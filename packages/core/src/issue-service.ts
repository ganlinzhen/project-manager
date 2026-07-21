import type { IssueProviderKind, ProjectConfig, TaskRecord } from './domain.js';
import type { CommandRunner } from './command-runner.js';
import { WorkManagerError, toWorkManagerError } from './errors.js';
import { TaskRepository } from './task-repository.js';

export interface IssueReference { provider: Exclude<IssueProviderKind, 'none'>; number: number; url: string; }

function numberFromUrl(url: string): number {
  const match = url.match(/\/(?:issues|issue)\/(\d+)(?:[/?#]|$)/);
  if (!match) throw new WorkManagerError('ISSUE_RESPONSE_INVALID', `无法从 Issue URL 解析编号：${url}`);
  return Number(match[1]);
}

export class IssueService {
  constructor(
    private readonly repository: TaskRepository,
    private readonly projectResolver: (projectId: string) => ProjectConfig | undefined,
    private readonly runner: CommandRunner
  ) {}

  async validateProject(projectId: string): Promise<{ provider: IssueProviderKind; accessible: boolean }> {
    const project = this.resolveProject(projectId);
    if (project.issue.provider === 'none') return { provider: 'none', accessible: true };
    const cli = project.issue.provider === 'github' ? 'gh' : 'glab';
    await this.runner.run([cli, 'auth', 'status']);
    if (project.issue.provider === 'github') await this.runner.run(['gh', 'repo', 'view', project.issue.repository!, '--json', 'nameWithOwner']);
    else await this.runner.run(['glab', 'repo', 'view', project.issue.repository!]);
    return { provider: project.issue.provider, accessible: true };
  }

  async createForTask(taskId: string): Promise<TaskRecord> {
    const task = this.repository.requireTask(taskId);
    if (task.issueNumber && task.issueUrl) return task;
    const project = this.resolveProject(task.projectId);
    if (project.issue.provider === 'none') throw new WorkManagerError('ISSUE_DISABLED', `项目 ${project.id} 未启用 Issue`, { recoverable: false });
    try {
      const body = `本地任务：${task.id}\n\n${task.requirementSummary ?? task.title}`;
      let reference: IssueReference;
      if (project.issue.provider === 'github') {
        const argv = ['gh', 'issue', 'create', '--repo', project.issue.repository!, '--title', task.title, '--body', body];
        for (const label of project.issue.labels?.[task.type] ?? []) argv.push('--label', label);
        const result = await this.runner.run(argv);
        const url = result.stdout.trim().split(/\s+/).find((item) => item.startsWith('http')) ?? '';
        reference = { provider: 'github', number: numberFromUrl(url), url };
      } else {
        const argv = ['glab', 'issue', 'create', '--repo', project.issue.repository!, '--title', task.title, '--description', body, '--output', 'json'];
        const result = await this.runner.run(argv);
        const json = JSON.parse(result.stdout) as { iid?: number; web_url?: string; id?: number; url?: string };
        const url = json.web_url ?? json.url ?? '';
        reference = { provider: 'gitlab', number: Number(json.iid ?? json.id ?? numberFromUrl(url)), url };
      }
      const updated = this.repository.updateTask(taskId, { issueProvider: reference.provider, issueNumber: reference.number, issueUrl: reference.url });
      this.repository.appendEvent(taskId, 'issue_created', true, 'Issue 已创建', { ...reference });
      return updated;
    } catch (error) {
      const failure = toWorkManagerError(error, 'ISSUE_CREATE_FAILED');
      this.repository.appendEvent(taskId, 'operation_failed', false, failure.message, { code: failure.code, operation: 'create_issue' });
      throw new WorkManagerError('ISSUE_CREATE_FAILED', failure.message, { recoverable: true, suggestedCommand: `wm task retry ${taskId} --json` });
    }
  }

  async getForTask(taskId: string): Promise<IssueReference> {
    const task = this.repository.requireTask(taskId);
    const project = this.resolveProject(task.projectId);
    if (!task.issueNumber || !task.issueUrl || task.issueProvider === 'none') {
      throw new WorkManagerError('ISSUE_NOT_ATTACHED', `任务没有关联 Issue：${taskId}`);
    }
    try {
      let reference: IssueReference;
      if (task.issueProvider === 'github') {
        const result = await this.runner.run(['gh', 'issue', 'view', String(task.issueNumber), '--repo', project.issue.repository!, '--json', 'number,url']);
        const json = JSON.parse(result.stdout) as { number: number; url: string };
        reference = { provider: 'github', number: json.number, url: json.url };
      } else {
        const result = await this.runner.run(['glab', 'issue', 'view', String(task.issueNumber), '--repo', project.issue.repository!, '--output', 'json']);
        const json = JSON.parse(result.stdout) as { iid?: number; id?: number; web_url?: string; url?: string };
        const url = json.web_url ?? json.url ?? task.issueUrl;
        reference = { provider: 'gitlab', number: Number(json.iid ?? json.id ?? task.issueNumber), url };
      }
      this.repository.appendEvent(taskId, 'issue_checked', true, 'Issue 可访问', { ...reference });
      return reference;
    } catch (error) {
      const failure = toWorkManagerError(error, 'ISSUE_READ_FAILED');
      this.repository.appendEvent(taskId, 'operation_failed', false, failure.message, { code: failure.code, operation: 'read_issue' });
      throw new WorkManagerError('ISSUE_READ_FAILED', failure.message, { recoverable: true, suggestedCommand: `wm task doctor ${taskId} --json` });
    }
  }

  attach(taskId: string, url: string): TaskRecord {
    const task = this.repository.requireTask(taskId);
    const project = this.resolveProject(task.projectId);
    const provider = url.includes('github.com') ? 'github' : url.includes('gitlab') || project.issue.provider === 'gitlab' ? 'gitlab' : project.issue.provider;
    if (provider === 'none') throw new WorkManagerError('ISSUE_URL_UNSUPPORTED', '无法判断 Issue 提供方');
    const number = numberFromUrl(url);
    const updated = this.repository.updateTask(taskId, { issueProvider: provider, issueNumber: number, issueUrl: url });
    this.repository.appendEvent(taskId, 'issue_attached', true, '已关联现有 Issue', { provider, number, url });
    return updated;
  }

  private resolveProject(projectId: string): ProjectConfig {
    const project = this.projectResolver(projectId) ?? this.repository.getProject(projectId);
    if (!project) throw new WorkManagerError('PROJECT_NOT_FOUND', `项目不存在：${projectId}`);
    return project;
  }
}
