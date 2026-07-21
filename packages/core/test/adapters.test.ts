import { mkdtemp, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  ArtifactService,
  DoctorService,
  EnvironmentService,
  IssueService,
  TaskRepository,
  TaskService,
  SystemCommandRunner,
  WorkManagerDatabase,
  WorkspaceService,
  parseCommandLine,
  type CommandResult,
  type CommandRunner,
  type ProcessController,
  type ProjectConfig
} from '../src/index.js';

class FakeRunner implements CommandRunner {
  calls: string[][] = [];
  constructor(private readonly responder: (argv: string[]) => CommandResult = () => ({ code: 0, stdout: '', stderr: '' })) {}
  async run(argv: string[]): Promise<CommandResult> {
    this.calls.push(argv);
    const result = this.responder(argv);
    if (result.code !== 0) throw Object.assign(new Error(result.stderr || '命令失败'), { result });
    return result;
  }
}

class FakeProcesses implements ProcessController {
  nextPid = 42001;
  running = new Set<number>();
  identities = new Map<number, string>();
  startCalls: Array<{ argv: string[]; cwd: string }> = [];
  async start(argv: string[], cwd: string): Promise<number> {
    this.startCalls.push({ argv, cwd });
    this.running.add(this.nextPid);
    this.identities.set(this.nextPid, `fake-process-${this.nextPid}`);
    return this.nextPid;
  }
  identity(pid: number): string | null { return this.identities.get(pid) ?? null; }
  isRunning(pid: number, identity?: string | null): boolean { return this.running.has(pid) && (!identity || this.identity(pid) === identity); }
  async stop(pid: number, identity?: string | null): Promise<void> {
    if (identity && this.identity(pid) !== identity) throw new Error('SERVICE_PROCESS_IDENTITY_MISMATCH');
    this.running.delete(pid);
  }
}

const databases: WorkManagerDatabase[] = [];
afterEach(() => databases.splice(0).forEach((database) => database.close()));

async function fixture(provider: ProjectConfig['issue']['provider'] = 'none') {
  const root = await mkdtemp(path.join(tmpdir(), 'wm-adapter-'));
  const repositoryPath = path.join(root, 'repo');
  const worktreePath = path.join(root, 'worktrees', 'DEMO-1');
  await mkdir(repositoryPath, { recursive: true });
  await mkdir(worktreePath, { recursive: true });
  const project: ProjectConfig = {
    id: 'demo', name: 'Demo', taskPrefix: 'DEMO', repositoryPath, defaultBranch: 'main',
    issue: { provider, repository: provider === 'none' ? undefined : 'group/project' },
    development: { services: { web: { cwd: '.', startCommand: 'node -e "setInterval(() => {}, 1000)"', port: 3100 } } }
  };
  const database = new WorkManagerDatabase(path.join(root, 'wm.db'));
  databases.push(database);
  const repository = new TaskRepository(database);
  repository.registerProject(project);
  const task = repository.createTask(project, { title: '适配器任务', type: 'feature', priority: 'high', createWorktree: true });
  repository.updateTask(task.id, { worktreePath, branchName: 'wm/demo-1-adapter' });
  repository.transition(task.id, 'ready');
  const artifacts = new ArtifactService(root, repository);
  await artifacts.createBaseArtifacts(repository.requireTask(task.id));
  const taskService = new TaskService(repository, artifacts, () => project);
  return { root, repositoryPath, worktreePath, project, database, repository, taskService, taskId: task.id };
}

describe('外部适配器', () => {
  it('外部命令超时后返回稳定错误而不永久挂起', async () => {
    await expect(new SystemCommandRunner().run([process.execPath, '-e', 'setTimeout(() => {}, 1000)'], { timeoutMs: 30 }))
      .rejects.toThrow(/COMMAND_TIMEOUT/);
  });

  it('将服务命令解析为参数数组而不经过 shell', () => {
    expect(parseCommandLine('node -e "console.log(\'hello world\')"')).toEqual(['node', '-e', "console.log('hello world')"]);
  });

  it('通过参数数组创建 worktree 并持久化资源', async () => {
    const { repository, project, taskId } = await fixture();
    repository.updateTask(taskId, { worktreePath: null, branchName: null });
    const runner = new FakeRunner();
    const workspace = new WorkspaceService(repository, () => project, runner);
    const task = await workspace.createWorktree(taskId);
    expect(runner.calls[0]?.slice(0, 4)).toEqual(['git', 'rev-parse', '--is-inside-work-tree']);
    expect(runner.calls[1]?.slice(0, 4)).toEqual(['git', 'worktree', 'add', '-b']);
    expect(task.worktreePath).toContain('DEMO-1');
    expect(repository.listEvents(taskId).at(-1)?.type).toBe('worktree_created');
  });

  it('通过 Git 同时确认分支和 worktree 登记状态', async () => {
    const { repository, project, taskId, worktreePath } = await fixture();
    const runner = new FakeRunner((argv) => ({
      code: 0,
      stdout: argv[1] === 'worktree' ? `worktree ${worktreePath}\nbranch refs/heads/wm/demo-1-adapter\n` : '',
      stderr: ''
    }));
    const workspace = new WorkspaceService(repository, () => project, runner);
    await expect(workspace.check(taskId)).resolves.toEqual({ ok: true, branch: true, worktree: true });
  });

  it('GitHub Issue 成功后立即持久化且重试不重复创建', async () => {
    const { repository, project, taskId } = await fixture('github');
    const runner = new FakeRunner((argv) => argv.includes('create')
      ? { code: 0, stdout: 'https://github.com/group/project/issues/23\n', stderr: '' }
      : { code: 0, stdout: '{}', stderr: '' });
    const issues = new IssueService(repository, () => project, runner);
    await issues.createForTask(taskId);
    await issues.createForTask(taskId);
    expect(repository.requireTask(taskId).issueNumber).toBe(23);
    expect(runner.calls.filter((argv) => argv.includes('create'))).toHaveLength(1);
  });

  it('通过 glab 参数数组创建并读取 GitLab Issue', async () => {
    const { repository, project, taskId } = await fixture('gitlab');
    const runner = new FakeRunner((argv) => argv.includes('create')
      ? { code: 0, stdout: '{"iid":31,"web_url":"https://gitlab.example/group/project/-/issues/31"}', stderr: '' }
      : { code: 0, stdout: '{"iid":31,"web_url":"https://gitlab.example/group/project/-/issues/31"}', stderr: '' });
    const issues = new IssueService(repository, () => project, runner);
    await expect(issues.createForTask(taskId)).resolves.toMatchObject({ issueProvider: 'gitlab', issueNumber: 31 });
    await expect(issues.getForTask(taskId)).resolves.toEqual({ provider: 'gitlab', number: 31, url: 'https://gitlab.example/group/project/-/issues/31' });
    expect(runner.calls[0]?.slice(0, 4)).toEqual(['glab', 'issue', 'create', '--repo']);
    expect(runner.calls[1]).toEqual(['glab', 'issue', 'view', '31', '--repo', 'group/project', '--output', 'json']);
  });

  it('通过平台 CLI 重新读取已关联 Issue', async () => {
    const { repository, project, taskId } = await fixture('github');
    repository.updateTask(taskId, { issueProvider: 'github', issueNumber: 23, issueUrl: 'https://github.com/group/project/issues/23' });
    const runner = new FakeRunner(() => ({ code: 0, stdout: '{"number":23,"url":"https://github.com/group/project/issues/23"}', stderr: '' }));
    const issues = new IssueService(repository, () => project, runner);
    await expect(issues.getForTask(taskId)).resolves.toEqual({ provider: 'github', number: 23, url: 'https://github.com/group/project/issues/23' });
    expect(runner.calls[0]).toEqual(['gh', 'issue', 'view', '23', '--repo', 'group/project', '--json', 'number,url']);
  });

  it('分别启动和停止命名服务并记录 PID', async () => {
    const { repository, project, taskId } = await fixture();
    const processes = new FakeProcesses();
    const environment = new EnvironmentService(repository, () => project, processes);
    const started = await environment.start(taskId, 'web');
    expect(started.status).toBe('running');
    expect(started.pid).toBe(42001);
    expect(started.processIdentity).toBe('fake-process-42001');
    expect(processes.startCalls[0]?.argv).toEqual(['node', '-e', 'setInterval(() => {}, 1000)']);
    const stopped = await environment.stop(taskId, 'web');
    expect(stopped.status).toBe('stopped');
    expect(processes.isRunning(42001)).toBe(false);
  });

  it('PID 被复用时拒绝停止无关进程并记录失败', async () => {
    const { repository, project, taskId } = await fixture();
    const processes = new FakeProcesses();
    const environment = new EnvironmentService(repository, () => project, processes);
    await environment.start(taskId, 'web');
    processes.identities.set(42001, 'reused-by-unrelated-process');
    await expect(environment.stop(taskId, 'web')).rejects.toThrow(/SERVICE_PROCESS_IDENTITY_MISMATCH/);
    expect(repository.getService(taskId, 'web')).toMatchObject({ status: 'running', processIdentity: 'fake-process-42001' });
    expect(repository.listEvents(taskId).at(-1)).toMatchObject({ type: 'operation_failed', success: false });
  });

  it('doctor 汇总任务、产物、worktree 与服务事实', async () => {
    const { repository, project, taskId } = await fixture();
    const processes = new FakeProcesses();
    const doctor = new DoctorService(repository, () => project, processes);
    const report = await doctor.check(taskId);
    expect(report.ok).toBe(true);
    expect(report.checks.map((item) => item.key)).toEqual(expect.arrayContaining(['database', 'artifacts', 'worktree', 'issue', 'services']));
  });

  it('doctor 对已关联 Issue 执行平台可访问性检查', async () => {
    const { repository, project, taskId } = await fixture('github');
    repository.updateTask(taskId, { issueProvider: 'github', issueNumber: 23, issueUrl: 'https://github.com/group/project/issues/23' });
    const runner = new FakeRunner(() => ({ code: 0, stdout: '{"number":23,"url":"https://github.com/group/project/issues/23"}', stderr: '' }));
    const issues = new IssueService(repository, () => project, runner);
    const doctor = new DoctorService(repository, () => project, new FakeProcesses(), { issues });
    const report = await doctor.check(taskId);
    expect(report.checks.find((item) => item.key === 'issue')).toMatchObject({ ok: true, message: 'Issue 可访问' });
    expect(runner.calls).toHaveLength(1);
  });
});
