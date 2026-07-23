import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  ArtifactService,
  TaskRepository,
  TaskService,
  WorkManagerDatabase,
  assertWithinRoots,
  canTransition,
  loadProjectConfig,
  loadProjectConfigs,
  seedDemoProject,
  type ProjectConfig
} from '../src/index.js';

const databases: WorkManagerDatabase[] = [];

afterEach(() => {
  for (const database of databases.splice(0)) database.close();
});

async function fixture() {
  const root = await mkdtemp(path.join(tmpdir(), 'wm-core-'));
  const repositoryPath = path.join(root, 'repo');
  const managerRoot = path.join(root, 'manager');
  await mkdir(repositoryPath, { recursive: true });
  await mkdir(path.join(managerRoot, 'projects'), { recursive: true });
  const projectFile = path.join(managerRoot, 'projects', 'demo.yaml');
  await writeFile(projectFile, [
    'id: demo',
    'name: Demo',
    'taskPrefix: DEMO',
    `repositoryPath: ${repositoryPath}`,
    'defaultBranch: main',
    'issue:',
    '  provider: none',
    'development:',
    '  services:',
    '    web:',
    '      cwd: .',
    '      startCommand: node -e "setInterval(() => {}, 1000)"'
  ].join('\n'));
  const project = await loadProjectConfig(projectFile);
  const database = new WorkManagerDatabase(path.join(root, 'work-manager.db'));
  databases.push(database);
  const repository = new TaskRepository(database);
  repository.registerProject(project);
  return { root, managerRoot, repositoryPath, project, database, repository };
}

describe('项目配置和领域规则', () => {
  it('读取单一 Issue 提供方和命名开发服务', async () => {
    const { project } = await fixture();
    expect(project.id).toBe('demo');
    expect(project.mode).toBe('real');
    expect(project.issue.provider).toBe('none');
    expect(project.development.services.web?.cwd).toBe('.');
  });

  it('读取演示项目模式', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'wm-demo-config-'));
    const configPath = path.join(root, 'demo.yaml');
    await writeFile(configPath, [
      'id: demo', 'name: Demo', 'taskPrefix: DEMO', 'mode: demo', 'repositoryPath: /__work-manager-demo__/repository', 'defaultBranch: main',
      'issue:', '  provider: none', 'development:', '  services: {}'
    ].join('\n'));
    await expect(loadProjectConfig(configPath)).resolves.toMatchObject({ mode: 'demo' });
  });

  it('拒绝允许根目录之外的路径', () => {
    expect(() => assertWithinRoots('/tmp/outside', ['/repo'])).toThrowError(/PATH_OUTSIDE_ALLOWED_ROOT/);
  });

  it('只允许已定义的状态迁移', () => {
    expect(canTransition('ready', 'in_progress')).toBe(true);
    expect(canTransition('done', 'ready')).toBe(false);
    expect(canTransition('done', 'in_progress')).toBe(true);
  });

  it('在读取项目配置时拒绝 shell 操作符', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'wm-invalid-config-'));
    const configPath = path.join(root, 'invalid.yaml');
    await writeFile(configPath, [
      'id: invalid', 'name: Invalid', 'taskPrefix: BAD', `repositoryPath: ${root}`, 'defaultBranch: main',
      'issue:', '  provider: none', 'development:', '  services:', '    web:', '      cwd: .', '      startCommand: pnpm dev && echo unsafe'
    ].join('\n'));
    await expect(loadProjectConfig(configPath)).rejects.toThrow(/COMMAND_SHELL_OPERATOR_FORBIDDEN/);
  });

  it('拒绝多个项目复用同一任务前缀', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'wm-duplicate-prefix-'));
    const base = (id: string) => [
      `id: ${id}`, `name: ${id}`, 'taskPrefix: SAME', `repositoryPath: ${root}`, 'defaultBranch: main',
      'issue:', '  provider: none', 'development:', '  services: {}'
    ].join('\n');
    await writeFile(path.join(root, 'a.yaml'), base('alpha'));
    await writeFile(path.join(root, 'b.yaml'), base('beta'));
    await expect(loadProjectConfigs(root)).rejects.toThrow(/TASK_PREFIX_DUPLICATE/);
  });
});

describe('任务存储和闭环', () => {
  it('只为没有任务的演示项目初始化四条完整示例数据', async () => {
    const { repository, project, managerRoot } = await fixture();
    const demoProject = { ...project, mode: 'demo' as const };
    repository.registerProject(demoProject);
    const artifacts = new ArtifactService(managerRoot, repository);
    const tasks = new TaskService(repository, artifacts, () => demoProject);

    await seedDemoProject(demoProject, tasks);
    expect(repository.listTasks({ projectId: 'demo' })).toHaveLength(4);
    expect(repository.listTasks({ projectId: 'demo' }).map((task) => task.status).sort()).toEqual(['blocked', 'done', 'in_progress', 'ready']);
    expect(repository.listArtifacts('DEMO-1')).toHaveLength(5);
    await expect(readFile(path.join(managerRoot, 'data', 'artifacts', 'DEMO-1', 'requirements.md'), 'utf8')).resolves.toContain('演示');

    await seedDemoProject(demoProject, tasks);
    expect(repository.listTasks({ projectId: 'demo' })).toHaveLength(4);
  });

  it('项目内任务编号单调递增且不会复用', async () => {
    const { repository, project } = await fixture();
    const first = repository.createTask(project, { title: '第一项', type: 'feature', priority: 'high' });
    const second = repository.createTask(project, { title: '第二项', type: 'bug', priority: 'medium' });
    expect([first.id, second.id]).toEqual(['DEMO-1', 'DEMO-2']);
    expect(repository.listEvents(first.id).map((event) => event.type)).toEqual(['task_created']);
  });

  it('事件元数据移除敏感键并遮蔽敏感命令参数', async () => {
    const { repository, project } = await fixture();
    const task = repository.createTask(project, { title: '脱敏', type: 'chore', priority: 'low' });
    repository.appendEvent(task.id, 'diagnostic', false, '测试', {
      command: ['server', '--token', 'secret-value', '--api-key=key-value'],
      environment: { ACCESS_TOKEN: 'environment-secret' }
    });
    const serialized = JSON.stringify(repository.listEvents(task.id).at(-1)?.metadata);
    expect(serialized).not.toContain('secret-value');
    expect(serialized).not.toContain('key-value');
    expect(serialized).not.toContain('environment-secret');
    expect(serialized).toContain('[REDACTED]');
  });

  it('数据库阻止修改或删除既有审计事件', async () => {
    const { repository, project, database } = await fixture();
    const task = repository.createTask(project, { title: '不可变事件', type: 'chore', priority: 'low' });
    expect(() => database.connection.prepare('UPDATE task_events SET message = ? WHERE task_id = ?').run('篡改', task.id)).toThrow(/append-only/);
    expect(() => database.connection.prepare('DELETE FROM task_events WHERE task_id = ?').run(task.id)).toThrow(/append-only/);
  });

  it('项目未启用 Issue 时在分配任务编号前拒绝创建 Issue', async () => {
    const { repository, project, managerRoot } = await fixture();
    const service = new TaskService(repository, new ArtifactService(managerRoot, repository), () => project);
    await expect(service.createTask({ projectId: 'demo', title: '不应创建', type: 'feature', priority: 'high', createIssue: true })).rejects.toThrow(/ISSUE_DISABLED/);
    expect(repository.listTasks()).toHaveLength(0);
  });

  it('创建基础产物并在更新进展时同步字段、文件和事件', async () => {
    const { repository, project, managerRoot } = await fixture();
    const artifacts = new ArtifactService(managerRoot, repository);
    const service = new TaskService(repository, artifacts, () => project);
    const created = await service.createTask({
      projectId: 'demo', title: '登录页', type: 'feature', priority: 'high'
    });
    expect(created.task.status).toBe('ready');
    expect(service.getTaskDetail(created.task.id).services).toMatchObject([{ serviceKey: 'web', status: 'stopped' }]);
    const context = await readFile(path.join(managerRoot, 'data', 'artifacts', created.task.id, 'context.md'), 'utf8');
    expect(context).not.toContain('状态：creating');
    await service.updateProgress(created.task.id, { current: '完成表单', next: '补充校验' });
    const task = repository.getTask(created.task.id);
    expect(task?.nextAction).toBe('补充校验');
    const progress = await readFile(path.join(managerRoot, 'data', 'artifacts', created.task.id, 'progress.md'), 'utf8');
    expect(progress).toContain('完成表单');
    expect(progress).toContain('补充校验');
    expect(repository.listEvents(created.task.id).at(-1)?.type).toBe('progress_updated');
  });

  it('归档任务时保留业务状态、工件和审计记录，并可恢复', async () => {
    const { repository, project, managerRoot } = await fixture();
    const service = new TaskService(repository, new ArtifactService(managerRoot, repository), () => project);
    const created = await service.createTask({ projectId: 'demo', title: '可归档任务', type: 'feature', priority: 'high' });
    await service.updateProgress(created.task.id, { current: '实现中', next: '验证归档' });

    const archived = service.archiveTask(created.task.id, '不再需要');
    expect(archived).toMatchObject({ status: 'ready', archivedReason: '不再需要', archivedAt: expect.any(String) });
    expect(repository.listTasks()).toHaveLength(0);
    expect(repository.listTasks({ archived: true })).toMatchObject([{ id: created.task.id, status: 'ready' }]);
    expect(repository.listArtifacts(created.task.id)).toHaveLength(5);
    expect(repository.listEvents(created.task.id).at(-1)).toMatchObject({ type: 'task_archived', metadata: { reason: '不再需要' } });

    const restored = service.restoreTask(created.task.id);
    expect(restored).toMatchObject({ status: 'ready', archivedAt: null, archivedReason: null });
    expect(repository.listTasks()).toMatchObject([{ id: created.task.id }]);
    expect(repository.listEvents(created.task.id).at(-1)).toMatchObject({ type: 'task_restored' });
  });

  it('进展文件写入失败时记录可诊断失败事件', async () => {
    const { repository, project } = await fixture();
    const task = repository.createTask(project, { title: '失败记录', type: 'bug', priority: 'high' });
    repository.transition(task.id, 'ready');
    const failingArtifacts = { updateProgress: async () => { throw new Error('磁盘只读'); } } as unknown as ArtifactService;
    const service = new TaskService(repository, failingArtifacts, () => project);
    await expect(service.updateProgress(task.id, { current: '写入中', next: '重试' })).rejects.toThrow(/磁盘只读/);
    expect(repository.listEvents(task.id).at(-1)).toMatchObject({ type: 'operation_failed', success: false, metadata: { operation: 'update_progress' } });
  });

  it('部分失败后重试只补齐缺失资源而不重复创建 Issue', async () => {
    const { repository, project, managerRoot } = await fixture();
    project.issue = { provider: 'github', repository: 'group/project' };
    repository.registerProject(project);
    let issueCalls = 0;
    let workspaceCalls = 0;
    const issues = { createForTask: async (taskId: string) => {
      issueCalls += 1;
      return repository.updateTask(taskId, { issueProvider: 'github', issueNumber: 7, issueUrl: 'https://github.com/group/project/issues/7' });
    } };
    const workspace = { createWorktree: async (taskId: string) => {
      workspaceCalls += 1;
      if (workspaceCalls === 1) throw new Error('Git 暂时不可用');
      return repository.updateTask(taskId, { branchName: 'wm/demo-1-retry', worktreePath: '/tmp/DEMO-1' });
    } };
    const service = new TaskService(repository, new ArtifactService(managerRoot, repository), () => project, { issues, workspace });
    await expect(service.createTask({ projectId: 'demo', title: '部分成功', type: 'feature', priority: 'high', createIssue: true, createWorktree: true })).rejects.toThrow(/TASK_PREPARATION_FAILED/);
    expect(repository.requireTask('DEMO-1')).toMatchObject({ status: 'blocked', issueNumber: 7, worktreePath: null, blockedReason: expect.stringContaining('Git 暂时不可用') });
    expect(repository.listEvents('DEMO-1').findLast((event) => event.type === 'operation_failed')?.metadata).toMatchObject({
      completedSteps: ['task_created', 'artifacts_created', 'issue_created'],
      suggestedCommand: 'wm task retry DEMO-1 --json'
    });
    const recovered = await service.retryTask('DEMO-1');
    expect(recovered.task).toMatchObject({ status: 'ready', issueNumber: 7, worktreePath: '/tmp/DEMO-1', blockedReason: null });
    expect({ issueCalls, workspaceCalls }).toEqual({ issueCalls: 1, workspaceCalls: 2 });
  });
});
