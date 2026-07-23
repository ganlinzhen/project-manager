import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProjectDetail, ProjectSummary, TaskSummary } from './types.js';

const api = vi.hoisted(() => ({
  listTasks: vi.fn(),
  listProjects: vi.fn(),
  syncProjects: vi.fn(),
  getProject: vi.fn(),
  getSettings: vi.fn(),
  initializeCodexProject: vi.fn(),
  clearDesktopData: vi.fn(),
  chooseDirectory: vi.fn(),
  saveSettings: vi.fn(),
  getTask: vi.fn(),
  taskAction: vi.fn(),
  serviceAction: vi.fn(),
  openWorktree: vi.fn(),
  openArtifact: vi.fn(),
  openUrl: vi.fn()
}));
const nativeWindow = vi.hoisted(() => ({ startDragging: vi.fn() }));

vi.mock('./api/wm.js', () => ({ wmApi: api }));
vi.mock('@tauri-apps/api/window', () => ({
  getCurrentWindow: () => nativeWindow
}));

import App from './App.js';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

const oldTask: TaskSummary = {
  id: 'DEMO-OLD', projectId: 'demo', title: '旧任务', status: 'in_progress', priority: 'high',
  nextAction: '等待清空', currentProgress: '旧数据', blockedReason: null,
  updatedAt: '2026-07-22T00:00:00.000Z', worktreePath: '/tmp/DEMO-OLD', services: []
};
const project: ProjectSummary = {
  id: 'demo', name: 'Demo 项目', mode: 'demo', repositoryPath: '/tmp/demo', defaultBranch: 'main',
  issue: { provider: 'none' }, serviceCount: 0
};
const projectDetail: ProjectDetail = {
  project: { ...project, development: { services: {} } }
};

describe('应用级项目初始化与重设', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.listTasks.mockResolvedValue([]);
    api.listProjects.mockResolvedValue([project]);
    api.syncProjects.mockResolvedValue([project]);
    api.getProject.mockResolvedValue(projectDetail);
    api.getSettings.mockResolvedValue({ managerRoot: null, nodePath: null });
    api.initializeCodexProject.mockResolvedValue({ managerRoot: '/tmp/我的项目', nodePath: null });
    api.clearDesktopData.mockResolvedValue({ managerRoot: null, nodePath: null });
    api.chooseDirectory.mockResolvedValue('/tmp');
  });

  it('初始化 Codex 项目后刷新设置和任务，跨页面返回仍显示已初始化状态', async () => {
    render(<App />);

    await userEvent.click(screen.getByRole('button', { name: '设置' }));
    await userEvent.click(screen.getByRole('button', { name: '初始化项目' }));
    await userEvent.type(screen.getByLabelText('项目名称'), '我的项目');
    await userEvent.click(screen.getByRole('button', { name: '选择目录' }));
    await userEvent.click(screen.getByRole('button', { name: '创建项目' }));

    await waitFor(() => expect(api.listTasks).toHaveBeenCalledTimes(2));
    expect(screen.getByText('Codex 项目已初始化')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: '项目' }));
    await userEvent.click(screen.getByRole('button', { name: '设置' }));
    expect(screen.getByRole('button', { name: '清空并重新设置' })).toBeInTheDocument();
    expect(screen.getByLabelText('Codex 项目目录')).toHaveValue('/tmp/我的项目');
  });

  it('将主导航放入带有 macOS 顶部安全区的左侧栏', () => {
    render(<App />);

    const navigation = screen.getByRole('navigation', { name: '主导航' });
    expect(navigation.closest('aside')).toHaveClass('app-sidebar');
    expect(screen.getByRole('button', { name: '看板' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '项目' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '设置' })).toBeInTheDocument();
  });

  it('侧栏品牌只显示应用 Logo，不重复显示工作管理器文字', () => {
    render(<App />);

    const brand = screen.getByRole('button', { name: '返回看板' });
    expect(brand.querySelector('img')).toHaveAttribute('src', expect.stringContaining('icon-husky.png'));
    expect(screen.queryByText('工作管理器')).not.toBeInTheDocument();
  });

  it('在内容区顶部按下主鼠标键时调用原生窗口拖拽', () => {
    render(<App />);

    const dragRegion = document.querySelector('.window-drag-region');
    expect(dragRegion).not.toBeNull();
    fireEvent.mouseDown(dragRegion!, { button: 0 });
    expect(nativeWindow.startDragging).toHaveBeenCalledTimes(1);
  });

  it('项目页同步配置后可打开数据库中的项目详情', async () => {
    render(<App />);

    await userEvent.click(screen.getByRole('button', { name: '项目' }));
    expect(await screen.findByText('Demo 项目')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: '同步 projects' }));
    await waitFor(() => expect(api.syncProjects).toHaveBeenCalledTimes(1));
    expect(screen.getByText('已同步 1 个项目')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Demo 项目' }));
    expect(await screen.findByText('项目配置')).toBeInTheDocument();
    expect(api.getProject).toHaveBeenCalledWith('demo');
  });

  it('连续操作在顶部 Toast 队列中显示，进入项目详情后仍保留', async () => {
    render(<App />);

    await userEvent.click(screen.getByRole('button', { name: '项目' }));
    await userEvent.click(screen.getByRole('button', { name: '同步 projects' }));
    await userEvent.click(screen.getByRole('button', { name: '同步 projects' }));

    expect(screen.getByLabelText('操作通知')).toBeInTheDocument();
    expect(screen.getAllByText('已同步 1 个项目')).toHaveLength(2);
    await userEvent.click(screen.getByRole('button', { name: 'Demo 项目' }));
    expect(await screen.findByText('项目配置')).toBeInTheDocument();
    expect(screen.getAllByText('已同步 1 个项目')).toHaveLength(2);
  });

  it('清空成功后移除旧任务并使用返回设置恢复初始化入口', async () => {
    api.getSettings.mockResolvedValue({ managerRoot: '/tmp/旧项目', nodePath: '/opt/homebrew/bin/node' });
    api.listTasks.mockResolvedValue([oldTask]);
    api.clearDesktopData.mockResolvedValue({ managerRoot: null, nodePath: '/opt/homebrew/bin/node' });
    render(<App />);

    expect(await screen.findByText('旧任务')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: '设置' }));
    await userEvent.click(await screen.findByRole('button', { name: '清空并重新设置' }));

    expect(await screen.findByText('本地数据已清空，请重新初始化 Codex 项目')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: '看板' }));
    expect(screen.queryByText('旧任务')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: '设置' }));
    expect(screen.getByRole('button', { name: '初始化项目' })).toBeInTheDocument();
    expect(screen.getByLabelText('Node.js 可执行文件')).toHaveValue('/opt/homebrew/bin/node');
  });

  it('清空后忽略此前尚未完成的任务加载', async () => {
    const pendingTasks = deferred<TaskSummary[]>();
    api.getSettings.mockResolvedValue({ managerRoot: '/tmp/旧项目', nodePath: null });
    api.listTasks.mockReturnValueOnce(pendingTasks.promise);
    render(<App />);

    await userEvent.click(screen.getByRole('button', { name: '设置' }));
    await userEvent.click(await screen.findByRole('button', { name: '清空并重新设置' }));
    pendingTasks.resolve([oldTask]);

    await userEvent.click(screen.getByRole('button', { name: '看板' }));
    await waitFor(() => expect(screen.queryByText('旧任务')).not.toBeInTheDocument());
    expect(screen.queryByLabelText('正在加载任务')).not.toBeInTheDocument();
  });

  it('初始化后的任务刷新失败时保留错误且不显示成功反馈', async () => {
    api.listTasks
      .mockResolvedValueOnce([])
      .mockRejectedValueOnce(new Error('刷新任务失败'));
    render(<App />);

    await userEvent.click(screen.getByRole('button', { name: '设置' }));
    await userEvent.click(screen.getByRole('button', { name: '初始化项目' }));
    await userEvent.type(screen.getByLabelText('项目名称'), '我的项目');
    await userEvent.click(screen.getByRole('button', { name: '选择目录' }));
    await userEvent.click(screen.getByRole('button', { name: '创建项目' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('刷新任务失败');
    expect(screen.queryByText('Codex 项目已初始化')).not.toBeInTheDocument();
  });
});
