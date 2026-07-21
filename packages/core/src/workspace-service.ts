import { mkdir, realpath } from 'node:fs/promises';
import path from 'node:path';
import type { ProjectConfig, TaskRecord } from './domain.js';
import { WorkManagerError, toWorkManagerError } from './errors.js';
import { assertWithinRoots } from './paths.js';
import { TaskRepository } from './task-repository.js';
import type { CommandRunner } from './command-runner.js';

function slug(value: string): string {
  const normalized = value.normalize('NFKD').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
  return normalized || 'task';
}

export class WorkspaceService {
  constructor(
    private readonly repository: TaskRepository,
    private readonly projectResolver: (projectId: string) => ProjectConfig | undefined,
    private readonly runner: CommandRunner
  ) {}

  async createWorktree(taskId: string): Promise<TaskRecord> {
    const task = this.repository.requireTask(taskId);
    if (task.worktreePath && task.branchName) return task;
    const project = this.projectResolver(task.projectId) ?? this.repository.getProject(task.projectId);
    if (!project) throw new WorkManagerError('PROJECT_NOT_FOUND', `项目不存在：${task.projectId}`);
    try {
      await this.runner.run(['git', 'rev-parse', '--is-inside-work-tree'], { cwd: project.repositoryPath });
      const worktreesRoot = project.worktreeRoot ?? path.join(path.dirname(project.repositoryPath), '.work-manager-worktrees', project.id);
      const branchName = `wm/${task.id.toLowerCase()}-${slug(task.title)}`;
      await mkdir(worktreesRoot, { recursive: true });
      const canonicalRoot = await realpath(worktreesRoot);
      const worktreePath = assertWithinRoots(path.join(canonicalRoot, task.id), [canonicalRoot]);
      await this.runner.run(['git', 'worktree', 'add', '-b', branchName, worktreePath, project.defaultBranch], { cwd: project.repositoryPath });
      const updated = this.repository.updateTask(taskId, { worktreePath, branchName });
      this.repository.appendEvent(taskId, 'worktree_created', true, '分支和 worktree 已创建', { branchName, worktreePath });
      return updated;
    } catch (error) {
      const failure = toWorkManagerError(error, 'WORKTREE_CREATE_FAILED');
      this.repository.appendEvent(taskId, 'operation_failed', false, failure.message, { code: failure.code, operation: 'create_worktree' });
      throw new WorkManagerError('WORKTREE_CREATE_FAILED', failure.message, { recoverable: true, suggestedCommand: `wm task retry ${taskId} --json` });
    }
  }

  async check(taskId: string): Promise<{ ok: boolean; branch: boolean; worktree: boolean }> {
    const task = this.repository.requireTask(taskId);
    const project = this.projectResolver(task.projectId) ?? this.repository.getProject(task.projectId);
    if (!project) throw new WorkManagerError('PROJECT_NOT_FOUND', `项目不存在：${task.projectId}`);
    if (!task.branchName || !task.worktreePath) return { ok: false, branch: false, worktree: false };
    let branch = false;
    try {
      await this.runner.run(['git', 'show-ref', '--verify', '--quiet', `refs/heads/${task.branchName}`], { cwd: project.repositoryPath });
      branch = true;
    } catch { branch = false; }
    let worktree = false;
    try {
      const result = await this.runner.run(['git', 'worktree', 'list', '--porcelain'], { cwd: project.repositoryPath });
      worktree = result.stdout.split('\n').some((line) => line === `worktree ${task.worktreePath}`);
    } catch { worktree = false; }
    return { ok: branch && worktree, branch, worktree };
  }
}
