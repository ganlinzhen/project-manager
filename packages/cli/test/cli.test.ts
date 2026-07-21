import { execFile } from 'node:child_process';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';
import { executeCli, findManagerRoot, type CliResponse } from '../src/main.js';

const exec = promisify(execFile);

async function runtime() {
  const root = await mkdtemp(path.join(tmpdir(), 'wm-cli-'));
  const repositoryPath = path.join(root, 'repo');
  const projectsDir = path.join(root, 'projects');
  await mkdir(repositoryPath, { recursive: true });
  await mkdir(projectsDir, { recursive: true });
  await writeFile(path.join(projectsDir, 'demo.yaml'), [
    'id: demo', 'name: Demo', 'taskPrefix: DEMO', `repositoryPath: ${repositoryPath}`, 'defaultBranch: main',
    'issue:', '  provider: none', 'development:', '  services: {}'
  ].join('\n'));
  return { managerRoot: root, projectsDir, databasePath: path.join(root, 'wm.db') };
}

async function run(args: string[], config: Awaited<ReturnType<typeof runtime>>): Promise<CliResponse> {
  let response: CliResponse | undefined;
  await executeCli(args, config, (value) => { response = value; });
  if (!response) throw new Error('CLI 未返回响应');
  return response;
}

describe('wm CLI JSON 闭环', () => {
  it('从 workspace 子包目录向上找到工作管理仓库根目录', async () => {
    const root = path.resolve(import.meta.dirname, '../../..');
    await expect(findManagerRoot(path.join(root, 'packages', 'cli'))).resolves.toBe(root);
  });

  it('创建、更新进展、查看并完成任务', async () => {
    const config = await runtime();
    const created = await run(['task', 'create', '--project', 'demo', '--title', '闭环任务', '--type', 'feature', '--priority', 'high', '--json'], config);
    expect(created).toMatchObject({ ok: true, data: { task: { id: 'DEMO-1', status: 'ready' } } });

    const progress = await run(['task', 'progress', 'DEMO-1', '--current', '实现中', '--next', '运行测试', '--json'], config);
    expect(progress).toMatchObject({ ok: true, data: { task: { nextAction: '运行测试' } } });

    const shown = await run(['task', 'show', 'DEMO-1', '--json'], config);
    expect(shown).toMatchObject({ ok: true, data: { task: { currentProgress: '实现中' }, artifacts: { progress: expect.stringContaining('运行测试') } } });

    const completed = await run(['task', 'complete', 'DEMO-1', '--json'], config);
    expect(completed).toMatchObject({ ok: true, data: { task: { status: 'done' } } });
  });

  it('返回稳定、可恢复的错误契约', async () => {
    const config = await runtime();
    const response = await run(['task', 'show', 'DEMO-404', '--json'], config);
    expect(response).toMatchObject({ ok: false, error: { code: 'TASK_NOT_FOUND', recoverable: false } });
  });

  it('默认列表只返回活跃任务，也可显式筛选完成任务', async () => {
    const config = await runtime();
    await run(['task', 'create', '--project', 'demo', '--title', '活跃', '--type', 'chore', '--priority', 'medium', '--json'], config);
    await run(['task', 'create', '--project', 'demo', '--title', '已完成', '--type', 'chore', '--priority', 'low', '--json'], config);
    await run(['task', 'complete', 'DEMO-2', '--json'], config);
    const active = await run(['task', 'list', '--json'], config);
    expect((active.ok && (active.data as { tasks: Array<{ id: string }> }).tasks.map((task) => task.id))).toEqual(['DEMO-1']);
    const done = await run(['task', 'list', '--status', 'done', '--json'], config);
    expect(done).toMatchObject({ ok: true, data: { tasks: [{ id: 'DEMO-2' }] } });
    const all = await run(['task', 'list', '--all', '--json'], config);
    expect(all.ok && (all.data as { tasks: Array<{ id: string }> }).tasks.map((task) => task.id).sort()).toEqual(['DEMO-1', 'DEMO-2']);
  });

  it('在真实临时 Git 仓库中跑通 worktree、命名服务和 doctor', async () => {
    const config = await runtime();
    const repositoryPath = path.join(config.managerRoot, 'repo');
    await exec('git', ['init', '-b', 'main'], { cwd: repositoryPath });
    await exec('git', ['config', 'user.email', 'wm-test@example.com'], { cwd: repositoryPath });
    await exec('git', ['config', 'user.name', 'WM Test'], { cwd: repositoryPath });
    await writeFile(path.join(repositoryPath, 'README.md'), 'demo\n');
    await exec('git', ['add', 'README.md'], { cwd: repositoryPath });
    await exec('git', ['commit', '-m', 'test: initial'], { cwd: repositoryPath });
    await writeFile(path.join(config.projectsDir, 'demo.yaml'), [
      'id: demo', 'name: Demo', 'taskPrefix: DEMO', `repositoryPath: ${repositoryPath}`, 'defaultBranch: main',
      'issue:', '  provider: none', 'development:', '  services:', '    worker:', '      cwd: .',
      '      startCommand:', '        - node', '        - -e', '        - setInterval(() => {}, 1000)'
    ].join('\n'));

    const validated = await run(['project', 'validate', 'demo', '--json'], config);
    expect(validated).toMatchObject({ ok: true, data: { valid: true } });
    const created = await run(['task', 'create', '--project', 'demo', '--title', '真实闭环', '--type', 'feature', '--priority', 'high', '--create-worktree', '--json'], config);
    expect(created).toMatchObject({ ok: true, data: { task: { id: 'DEMO-1', worktreePath: expect.stringContaining('DEMO-1') } } });
    const started = await run(['env', 'start', 'DEMO-1', '--service', 'worker', '--json'], config);
    expect(started).toMatchObject({ ok: true, data: { service: { status: 'running', pid: expect.any(Number) } } });
    const diagnosis = await run(['task', 'doctor', 'DEMO-1', '--json'], config);
    expect(diagnosis).toMatchObject({ ok: true, data: { ok: true } });
    const stopped = await run(['env', 'stop', 'DEMO-1', '--service', 'worker', '--json'], config);
    expect(stopped).toMatchObject({ ok: true, data: { service: { status: 'stopped' } } });
  });
});
