import { spawn } from 'node:child_process';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import type { DevelopmentServiceRecord, ProjectConfig } from './domain.js';
import { parseCommandLine } from './command-runner.js';
import { WorkManagerError, toWorkManagerError } from './errors.js';
import { assertRealPathWithinRoots } from './paths.js';
import { TaskRepository } from './task-repository.js';

export interface ProcessController {
  start(argv: string[], cwd: string): Promise<number>;
  identity(pid: number): string | null;
  isRunning(pid: number, identity?: string | null): boolean;
  stop(pid: number, identity: string): Promise<void>;
}

export class SystemProcessController implements ProcessController {
  async start(argv: string[], cwd: string): Promise<number> {
    return new Promise((resolve, reject) => {
      const child = spawn(argv[0]!, argv.slice(1), { cwd, detached: true, shell: false, stdio: 'ignore' });
      child.once('error', reject);
      child.once('spawn', () => {
        child.unref();
        if (!child.pid) reject(new Error('未取得进程 PID'));
        else resolve(child.pid);
      });
    });
  }
  identity(pid: number): string | null {
    try {
      return execFileSync('ps', ['-p', String(pid), '-o', 'lstart=', '-o', 'command='], { encoding: 'utf8' }).trim().replace(/\s+/g, ' ') || null;
    } catch { return null; }
  }
  isRunning(pid: number, identity?: string | null): boolean {
    try { process.kill(pid, 0); } catch { return false; }
    return !identity || this.identity(pid) === identity;
  }
  async stop(pid: number, identity: string): Promise<void> {
    if (!this.isRunning(pid, identity)) throw new WorkManagerError('SERVICE_PROCESS_IDENTITY_MISMATCH', 'PID 对应的进程身份与启动记录不一致');
    try { process.kill(-pid, 'SIGTERM'); }
    catch { process.kill(pid, 'SIGTERM'); }
    const deadline = Date.now() + 2500;
    while (Date.now() < deadline) {
      if (!this.isRunning(pid, identity)) return;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    throw new WorkManagerError('SERVICE_STOP_TIMEOUT', `服务进程 ${pid} 未在超时内退出`, { recoverable: true });
  }
}

function now(): string { return new Date().toISOString(); }

export class EnvironmentService {
  constructor(
    private readonly repository: TaskRepository,
    private readonly projectResolver: (projectId: string) => ProjectConfig | undefined,
    private readonly processes: ProcessController
  ) {}

  async start(taskId: string, serviceKey: string): Promise<DevelopmentServiceRecord> {
    const task = this.repository.requireTask(taskId);
    const project = this.resolveProject(task.projectId);
    const config = project.development.services[serviceKey];
    if (!config) throw new WorkManagerError('SERVICE_NOT_CONFIGURED', `项目未配置服务：${serviceKey}`);
    if (!task.worktreePath) throw new WorkManagerError('WORKTREE_REQUIRED', '启动开发服务前必须创建任务 worktree', { recoverable: true, suggestedCommand: `wm task retry ${taskId} --json` });
    const existing = this.repository.getService(taskId, serviceKey);
    if (existing?.pid && existing.processIdentity && this.processes.isRunning(existing.pid, existing.processIdentity)) return existing;
    const cwd = await assertRealPathWithinRoots(path.resolve(task.worktreePath, config.cwd), [task.worktreePath]);
    const argv = parseCommandLine(config.startCommand);
    let startedPid: number | null = null;
    let startedIdentity: string | null = null;
    try {
      const starting: DevelopmentServiceRecord = {
        taskId, serviceKey, command: argv, cwd, pid: null, processIdentity: null, port: config.port ?? this.portFromUrl(config.healthCheckUrl),
        healthCheckUrl: config.healthCheckUrl ?? null, status: 'starting', startedAt: now(), stoppedAt: null, lastError: null
      };
      this.repository.upsertService(starting);
      startedPid = await this.processes.start(argv, cwd);
      startedIdentity = this.processes.identity(startedPid);
      if (!startedIdentity) throw new WorkManagerError('SERVICE_PROCESS_IDENTITY_UNAVAILABLE', '无法读取新进程的身份信息');
      const running = { ...starting, pid: startedPid, processIdentity: startedIdentity, status: 'running' as const };
      this.repository.upsertService(running);
      this.repository.appendEvent(taskId, 'service_started', true, `服务 ${serviceKey} 已启动`, { serviceKey, pid: startedPid, cwd, command: argv });
      return running;
    } catch (error) {
      const failure = toWorkManagerError(error, 'SERVICE_START_FAILED');
      if (startedPid && startedIdentity && this.processes.isRunning(startedPid, startedIdentity)) {
        try { await this.processes.stop(startedPid, startedIdentity); } catch { /* 清理失败记录在 lastError */ }
      }
      const failed: DevelopmentServiceRecord = {
        taskId, serviceKey, command: argv, cwd, pid: null, processIdentity: null, port: config.port ?? null, healthCheckUrl: config.healthCheckUrl ?? null,
        status: 'failed', startedAt: now(), stoppedAt: now(), lastError: failure.message
      };
      this.repository.upsertService(failed);
      this.repository.appendEvent(taskId, 'operation_failed', false, failure.message, { code: failure.code, operation: 'start_service', serviceKey });
      throw new WorkManagerError('SERVICE_START_FAILED', failure.message, { recoverable: true, suggestedCommand: `wm env start ${taskId} --service ${serviceKey} --json` });
    }
  }

  async stop(taskId: string, serviceKey: string): Promise<DevelopmentServiceRecord> {
    const existing = this.repository.getService(taskId, serviceKey);
    if (!existing) throw new WorkManagerError('SERVICE_NOT_STARTED', `服务没有启动记录：${serviceKey}`);
    try {
      if (existing.pid) {
        if (!existing.processIdentity || !this.processes.isRunning(existing.pid, existing.processIdentity)) {
          throw new WorkManagerError('SERVICE_PROCESS_IDENTITY_MISMATCH', 'PID 对应的进程身份与启动记录不一致');
        }
        await this.processes.stop(existing.pid, existing.processIdentity);
      }
      const stopped = { ...existing, pid: null, processIdentity: null, status: 'stopped' as const, stoppedAt: now() };
      this.repository.upsertService(stopped);
      this.repository.appendEvent(taskId, 'service_stopped', true, `服务 ${serviceKey} 已停止`, { serviceKey });
      return stopped;
    } catch (error) {
      const failure = toWorkManagerError(error, 'SERVICE_STOP_FAILED');
      this.repository.appendEvent(taskId, 'operation_failed', false, failure.message, { code: failure.code, operation: 'stop_service', serviceKey });
      throw new WorkManagerError(failure.code, failure.message, { recoverable: true, suggestedCommand: `wm task doctor ${taskId} --json` });
    }
  }

  async status(taskId: string): Promise<DevelopmentServiceRecord[]> {
    const services = this.repository.listServices(taskId);
    for (const service of services) {
      if ((service.status === 'running' || service.status === 'unhealthy') && service.pid && !this.processes.isRunning(service.pid)) {
        this.repository.upsertService({ ...service, pid: null, processIdentity: null, status: 'stopped', stoppedAt: now(), lastError: '记录的 PID 已不存在' });
      } else if ((service.status === 'running' || service.status === 'unhealthy') && service.pid && (!service.processIdentity || !this.processes.isRunning(service.pid, service.processIdentity))) {
        this.repository.upsertService({ ...service, status: 'failed', lastError: 'PID 已被其他进程复用，拒绝操作' });
      } else if ((service.status === 'running' || service.status === 'unhealthy') && service.healthCheckUrl) {
        const healthy = await this.health(service.healthCheckUrl);
        if (!healthy) this.repository.upsertService({ ...service, status: 'unhealthy', lastError: '健康检查未通过' });
        else if (service.status === 'unhealthy') {
          this.repository.upsertService({ ...service, status: 'running', lastError: null });
          this.repository.appendEvent(taskId, 'service_recovered', true, `服务 ${service.serviceKey} 健康检查已恢复`, { serviceKey: service.serviceKey });
        }
      }
    }
    return this.repository.listServices(taskId);
  }

  private async health(url: string): Promise<boolean> {
    try { const response = await fetch(url, { signal: AbortSignal.timeout(1500) }); return response.ok; } catch { return false; }
  }
  private portFromUrl(url?: string): number | null { if (!url) return null; const parsed = new URL(url); return parsed.port ? Number(parsed.port) : parsed.protocol === 'https:' ? 443 : 80; }
  private resolveProject(projectId: string): ProjectConfig {
    const project = this.projectResolver(projectId) ?? this.repository.getProject(projectId);
    if (!project) throw new WorkManagerError('PROJECT_NOT_FOUND', `项目不存在：${projectId}`);
    return project;
  }
}
