import path from 'node:path';
import type { CreateTaskInput, ProjectConfig, TaskRecord, TaskStatus } from './domain.js';
import { ArtifactService } from './artifact-service.js';
import { parseCommandLine } from './command-runner.js';
import { WorkManagerError, toWorkManagerError } from './errors.js';
import { TaskRepository } from './task-repository.js';

export interface TaskDetail {
  task: TaskRecord;
  project: ProjectConfig;
  artifacts: ReturnType<TaskRepository['listArtifacts']>;
  events: ReturnType<TaskRepository['listEvents']>;
  services: ReturnType<TaskRepository['listServices']>;
}

export class TaskService {
  constructor(
    readonly repository: TaskRepository,
    readonly artifacts: ArtifactService,
    private readonly projectResolver: (projectId: string) => ProjectConfig | undefined,
    private readonly external?: {
      issues?: { createForTask(taskId: string): Promise<TaskRecord> };
      workspace?: { createWorktree(taskId: string): Promise<TaskRecord> };
    }
  ) {}

  async createTask(input: CreateTaskInput): Promise<{ task: TaskRecord; artifacts: ReturnType<TaskRepository['listArtifacts']> }> {
    const project = this.projectResolver(input.projectId);
    if (!project) throw new WorkManagerError('PROJECT_NOT_FOUND', `项目不存在：${input.projectId}`);
    if (!input.title.trim()) throw new WorkManagerError('TASK_TITLE_REQUIRED', '任务标题不能为空');
    if (input.createIssue && project.issue.provider === 'none') {
      throw new WorkManagerError('ISSUE_DISABLED', `项目 ${project.id} 未启用 Issue`);
    }
    if (input.createIssue && !this.external?.issues) throw new WorkManagerError('ISSUE_ADAPTER_UNAVAILABLE', 'Issue 适配器不可用');
    if (input.createWorktree && !this.external?.workspace) throw new WorkManagerError('WORKSPACE_ADAPTER_UNAVAILABLE', 'Git worktree 适配器不可用');
    const task = this.repository.createTask(project, input);
    const completedSteps = ['task_created'];
    try {
      await this.artifacts.createBaseArtifacts(task);
      completedSteps.push('artifacts_created');
      if (input.createIssue) { await this.external?.issues?.createForTask(task.id); completedSteps.push('issue_created'); }
      if (input.createWorktree) { await this.external?.workspace?.createWorktree(task.id); completedSteps.push('worktree_created'); }
      const ready = this.repository.transition(task.id, 'ready', '任务资源已准备完成');
      return { task: ready, artifacts: this.repository.listArtifacts(task.id) };
    } catch (error) {
      const failure = toWorkManagerError(error, 'TASK_PREPARATION_FAILED');
      const suggestedCommand = `wm task retry ${task.id} --json`;
      this.repository.updateTask(task.id, { blockedReason: failure.message });
      this.repository.appendEvent(task.id, 'operation_failed', false, failure.message, { code: failure.code, completedSteps, suggestedCommand });
      this.repository.transition(task.id, 'blocked', '任务准备失败，可重试');
      throw new WorkManagerError(failure.code, failure.message, { recoverable: true, suggestedCommand, details: { completedSteps } });
    }
  }

  async retryTask(taskId: string): Promise<TaskDetail> {
    const task = this.repository.requireTask(taskId);
    await this.artifacts.createBaseArtifacts(task);
    if (task.createIssueRequested && !task.issueNumber) await this.external?.issues?.createForTask(taskId);
    if (task.createWorktreeRequested && !task.worktreePath) await this.external?.workspace?.createWorktree(taskId);
    this.repository.updateTask(taskId, { blockedReason: null });
    if (task.status === 'creating') this.repository.transition(taskId, 'ready', '重试完成');
    else if (task.status === 'blocked') this.repository.transition(taskId, task.currentProgress ? 'in_progress' : 'ready', '恢复任务');
    this.repository.appendEvent(taskId, 'task_retried', true, '恢复步骤执行完成');
    return this.getTaskDetail(taskId);
  }

  async updateProgress(taskId: string, values: { current: string; next: string }): Promise<TaskRecord> {
    this.repository.requireTask(taskId);
    try {
      await this.artifacts.updateProgress(taskId, values.current, values.next);
      return this.repository.database.transaction(() => {
        const task = this.repository.updateTask(taskId, { currentProgress: values.current, nextAction: values.next });
        this.repository.appendEvent(taskId, 'progress_updated', true, '任务进展已更新', { current: values.current, next: values.next });
        return task;
      });
    } catch (error) {
      const failure = toWorkManagerError(error, 'PROGRESS_UPDATE_FAILED');
      this.repository.appendEvent(taskId, 'operation_failed', false, failure.message, { code: failure.code, operation: 'update_progress' });
      throw new WorkManagerError('PROGRESS_UPDATE_FAILED', failure.message, { recoverable: true, suggestedCommand: `wm task progress ${taskId} --current "..." --next "..." --json` });
    }
  }

  changeStatus(taskId: string, status: TaskStatus, message?: string): TaskRecord {
    return this.repository.transition(taskId, status, message);
  }

  pauseTask(taskId: string): TaskRecord { return this.changeStatus(taskId, 'paused', '任务已暂停'); }
  resumeTask(taskId: string): TaskRecord { return this.changeStatus(taskId, 'in_progress', '任务已恢复'); }
  completeTask(taskId: string): TaskRecord { return this.changeStatus(taskId, 'done', '任务已完成，资源保留'); }
  reopenTask(taskId: string): TaskRecord { return this.changeStatus(taskId, 'in_progress', '任务已重开'); }

  listServices(taskId: string) {
    const task = this.repository.requireTask(taskId);
    const project = this.projectResolver(task.projectId) ?? this.repository.getProject(task.projectId);
    if (!project) throw new WorkManagerError('PROJECT_NOT_FOUND', `项目不存在：${task.projectId}`);
    const stored = new Map(this.repository.listServices(taskId).map((service) => [service.serviceKey, service]));
    const configured = Object.entries(project.development.services).map(([serviceKey, config]) => stored.get(serviceKey) ?? ({
      taskId,
      serviceKey,
      command: parseCommandLine(config.startCommand),
      cwd: path.resolve(task.worktreePath ?? project.repositoryPath, config.cwd),
      pid: null,
      processIdentity: null,
      port: config.port ?? (config.healthCheckUrl ? Number(new URL(config.healthCheckUrl).port || (config.healthCheckUrl.startsWith('https:') ? 443 : 80)) : null),
      healthCheckUrl: config.healthCheckUrl ?? null,
      status: 'stopped' as const,
      startedAt: null,
      stoppedAt: null,
      lastError: null
    }));
    const configuredKeys = new Set(Object.keys(project.development.services));
    return [...configured, ...[...stored.values()].filter((service) => !configuredKeys.has(service.serviceKey))];
  }

  getTaskDetail(taskId: string): TaskDetail {
    const task = this.repository.requireTask(taskId);
    const project = this.projectResolver(task.projectId) ?? this.repository.getProject(task.projectId);
    if (!project) throw new WorkManagerError('PROJECT_NOT_FOUND', `项目不存在：${task.projectId}`);
    return { task, project, artifacts: this.repository.listArtifacts(taskId), events: this.repository.listEvents(taskId), services: this.listServices(taskId) };
  }
}
