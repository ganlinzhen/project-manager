import { access, readFile } from 'node:fs/promises';
import type { ProjectConfig } from './domain.js';
import type { ProcessController } from './environment-service.js';
import { TaskRepository } from './task-repository.js';

export interface DoctorCheck { key: 'database' | 'artifacts' | 'worktree' | 'issue' | 'services'; ok: boolean; message: string; suggestedCommand?: string; }
export interface DoctorReport { taskId: string; ok: boolean; checks: DoctorCheck[]; }

async function exists(filePath: string): Promise<boolean> { try { await access(filePath); return true; } catch { return false; } }

export class DoctorService {
  constructor(
    private readonly repository: TaskRepository,
    private readonly projectResolver: (projectId: string) => ProjectConfig | undefined,
    private readonly processes: ProcessController,
    private readonly external?: {
      issues?: { getForTask(taskId: string): Promise<unknown> };
      workspace?: { check(taskId: string): Promise<{ ok: boolean; branch: boolean; worktree: boolean }> };
    }
  ) {}

  async check(taskId: string): Promise<DoctorReport> {
    const task = this.repository.requireTask(taskId);
    const project = this.projectResolver(task.projectId) ?? this.repository.getProject(task.projectId);
    const artifacts = this.repository.listArtifacts(taskId);
    const missingArtifacts = (await Promise.all(artifacts.map(async (artifact) => ({ artifact, ok: await exists(artifact.path) })))).filter((item) => !item.ok);
    let artifactContentOk = true;
    const progressArtifact = artifacts.find((artifact) => artifact.kind === 'progress');
    if (progressArtifact && await exists(progressArtifact.path)) {
      const progress = await readFile(progressArtifact.path, 'utf8');
      artifactContentOk = (!task.currentProgress || progress.includes(task.currentProgress)) && (!task.nextAction || progress.includes(task.nextAction));
    }
    let worktreeOk = task.worktreePath ? await exists(task.worktreePath) : !task.createWorktreeRequested;
    if (Boolean(task.worktreePath) !== Boolean(task.branchName)) worktreeOk = false;
    let worktreeMessage = task.worktreePath ? (worktreeOk ? task.worktreePath : 'worktree 路径不存在') : '任务未请求 worktree';
    if (task.worktreePath && task.branchName && this.external?.workspace) {
      const git = await this.external.workspace.check(taskId);
      worktreeOk = worktreeOk && git.ok;
      worktreeMessage = git.ok ? '分支与 worktree 均已登记' : `Git 资源不一致：分支 ${git.branch ? '存在' : '缺失'}，worktree ${git.worktree ? '存在' : '缺失'}`;
    }
    let issueOk = task.issueNumber ? Boolean(task.issueUrl) : !task.createIssueRequested;
    let issueMessage = task.issueUrl ?? '任务未请求 Issue';
    if (task.issueNumber && task.issueUrl && this.external?.issues) {
      try { await this.external.issues.getForTask(taskId); issueMessage = 'Issue 可访问'; }
      catch (error) { issueOk = false; issueMessage = error instanceof Error ? error.message : String(error); }
    }
    const deadServices = this.repository.listServices(taskId).filter((service) =>
      ['running', 'unhealthy', 'starting'].includes(service.status)
      && (!service.pid || !service.processIdentity || !this.processes.isRunning(service.pid, service.processIdentity))
    );
    const checks: DoctorCheck[] = [
      { key: 'database', ok: Boolean(project), message: project ? '任务和项目记录可读取' : '项目记录缺失', suggestedCommand: project ? undefined : `wm project validate ${task.projectId} --json` },
      { key: 'artifacts', ok: artifacts.length === 5 && missingArtifacts.length === 0 && artifactContentOk, message: missingArtifacts.length ? `缺少 ${missingArtifacts.length} 个产物文件` : !artifactContentOk ? 'progress.md 与 SQLite 进展字段不一致' : `${artifacts.length}/5 个产物可用`, suggestedCommand: missingArtifacts.length || artifacts.length !== 5 || !artifactContentOk ? `wm task retry ${taskId} --json` : undefined },
      { key: 'worktree', ok: worktreeOk, message: worktreeMessage, suggestedCommand: worktreeOk ? undefined : `wm task retry ${taskId} --json` },
      { key: 'issue', ok: issueOk, message: issueMessage, suggestedCommand: issueOk ? undefined : `wm task retry ${taskId} --json` },
      { key: 'services', ok: deadServices.length === 0, message: deadServices.length ? `${deadServices.length} 个服务 PID 不存在` : '服务记录一致', suggestedCommand: deadServices.length ? `wm env status ${taskId} --json` : undefined }
    ];
    this.repository.appendEvent(taskId, 'doctor_checked', checks.every((item) => item.ok), '一致性检查完成', { failed: checks.filter((item) => !item.ok).map((item) => item.key) });
    return { taskId, ok: checks.every((item) => item.ok), checks };
  }
}
