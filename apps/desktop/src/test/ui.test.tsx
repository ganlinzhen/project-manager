import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { BoardPage } from '../pages/BoardPage.js';
import { ProjectDetailPage } from '../pages/ProjectDetailPage.js';
import { ProjectListPage } from '../pages/ProjectListPage.js';
import { TaskDetailPage } from '../pages/TaskDetailPage.js';
import { SettingsPage } from '../pages/SettingsPage.js';
import type { ProjectDetail, ProjectSummary, TaskDetail, TaskSummary } from '../types.js';

const active: TaskSummary = {
  id: 'DEMO-1', projectId: 'demo', title: '完成个人工作管理器', status: 'in_progress', priority: 'high',
  nextAction: '运行端到端验证', currentProgress: 'CLI 已完成', blockedReason: null,
  updatedAt: '2026-07-17T08:30:00.000Z', worktreePath: '/tmp/DEMO-1',
  services: [{ serviceKey: 'web', status: 'running', port: 1420 }]
};
const done: TaskSummary = { ...active, id: 'DEMO-2', title: '归档旧任务', status: 'done', nextAction: null, services: [] };
const project: ProjectSummary = {
  id: 'demo', name: 'Demo 项目', mode: 'demo', repositoryPath: '/tmp/demo', defaultBranch: 'main',
  issue: { provider: 'none' }, serviceCount: 1
};

describe('桌面端任务流', () => {
  it('项目列表提供同步入口并打开项目详情', async () => {
    const onSync = vi.fn().mockResolvedValue(undefined);
    const onOpenProject = vi.fn();
    render(<ProjectListPage projects={[project]} loading={false} syncing={false} onSync={onSync} onOpenProject={onOpenProject} />);

    await userEvent.click(screen.getByRole('button', { name: '同步 projects' }));
    expect(onSync).toHaveBeenCalledTimes(1);
    await userEvent.click(screen.getByRole('button', { name: 'Demo 项目' }));
    expect(onOpenProject).toHaveBeenCalledWith('demo');
  });

  it('项目详情展示配置、Issue 和开发服务', () => {
    const detail: ProjectDetail = {
      project: {
        ...project,
        worktreeRoot: '/tmp/worktrees',
        issue: { provider: 'github', repository: 'owner/demo', labels: { feature: ['feature'] } },
        development: { services: { web: { cwd: 'apps/web', startCommand: ['pnpm', 'dev'], port: 3000, healthCheckUrl: 'http://localhost:3000' } } }
      }
    };
    render(<ProjectDetailPage detail={detail} onBack={vi.fn()} />);

    expect(screen.getByText(/owner\/demo/)).toBeInTheDocument();
    expect(screen.getByText('web')).toBeInTheDocument();
    expect(screen.getByText('pnpm dev')).toBeInTheDocument();
    expect(screen.getByText('/tmp/worktrees')).toBeInTheDocument();
  });

  it('看板默认隐藏完成任务并清晰展示下一步和服务状态', () => {
    render(<BoardPage tasks={[active, done]} loading={false} onOpenTask={vi.fn()} />);
    expect(screen.getByText('完成个人工作管理器')).toBeInTheDocument();
    expect(screen.getByText('运行端到端验证')).toBeInTheDocument();
    expect(screen.getByText('web · 运行中 · 1420')).toBeInTheDocument();
    expect(screen.queryByText('归档旧任务')).not.toBeInTheDocument();
  });

  it('可通过状态筛选查看完成任务', async () => {
    render(<BoardPage tasks={[active, done]} loading={false} onOpenTask={vi.fn()} />);
    await userEvent.selectOptions(screen.getByLabelText('按状态筛选'), 'done');
    expect(screen.getByText('归档旧任务')).toBeInTheDocument();
    expect(screen.queryByText('完成个人工作管理器')).not.toBeInTheDocument();
  });

  it('详情页提供命名服务操作、资源和事件恢复建议', async () => {
    const onAction = vi.fn().mockResolvedValue(undefined);
    const detail: TaskDetail = {
      task: active,
      project: { id: 'demo', name: 'Demo' },
      artifacts: { context: '# 上下文\nCLI 已完成', progress: '# 进展\n下一步验证' },
      artifactFiles: [],
      events: [{ id: 1, type: 'operation_failed', success: false, message: '健康检查失败', createdAt: '2026-07-17T08:32:00.000Z', metadata: { suggestedCommand: 'wm env start DEMO-1 --service web --json' } }],
      services: [{ serviceKey: 'web', status: 'stopped', port: 1420, lastError: null }]
    };
    render(<TaskDetailPage detail={detail} pendingAction={null} onBack={vi.fn()} onAction={onAction} />);
    await userEvent.click(screen.getByRole('button', { name: '启动 web' }));
    expect(onAction).toHaveBeenCalledWith('start-service', { serviceKey: 'web' });
    expect(screen.getByText('健康检查失败')).toBeInTheDocument();
    expect(screen.getByText(/wm env start DEMO-1/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '打开工作树' })).toBeInTheDocument();
  });

  it('详情页可归档任务，并可从归档任务恢复', async () => {
    const onAction = vi.fn().mockResolvedValue(undefined);
    const detail: TaskDetail = { task: active, project: { id: 'demo', name: 'Demo' }, artifacts: {}, artifactFiles: [], events: [], services: [] };
    vi.stubGlobal('confirm', vi.fn(() => true));
    render(<TaskDetailPage detail={detail} pendingAction={null} onBack={vi.fn()} onAction={onAction} />);
    await userEvent.click(screen.getByRole('button', { name: '归档任务' }));
    expect(onAction).toHaveBeenCalledWith('archive', { reason: '用户归档' });

    onAction.mockClear();
    render(<TaskDetailPage detail={{ ...detail, task: { ...active, archivedAt: '2026-07-23T00:00:00.000Z', archivedReason: '用户归档' } }} pendingAction={null} onBack={vi.fn()} onAction={onAction} />);
    await userEvent.click(screen.getByRole('button', { name: '恢复任务' }));
    expect(onAction).toHaveBeenCalledWith('restore');
  });

  it('演示项目显示连接边界且不提供服务启动操作', () => {
    const detail: TaskDetail = {
      task: active,
      project: { id: 'demo', name: 'Demo', mode: 'demo' },
      artifacts: {},
      artifactFiles: [],
      events: [],
      services: [{ serviceKey: 'web', status: 'stopped', port: 1420, lastError: null }]
    };
    render(<TaskDetailPage detail={detail} pendingAction={null} onBack={vi.fn()} onAction={vi.fn()} />);
    expect(screen.getByText('演示项目')).toBeInTheDocument();
    expect(screen.getByText('演示项目不连接真实仓库或开发服务。')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '启动 web' })).not.toBeInTheDocument();
  });

  it('设置页保存 Codex 项目目录和 Node.js 绝对路径', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(<SettingsPage
      settings={{ managerRoot: '/workspace/manager', nodePath: '/opt/homebrew/bin/node' }}
      onSave={onSave}
      onInitialize={vi.fn()}
      onClearAndReset={vi.fn()}
    />);
    await userEvent.clear(screen.getByLabelText('Codex 项目目录'));
    await userEvent.type(screen.getByLabelText('Codex 项目目录'), '/Users/me/work-manager');
    await userEvent.click(screen.getByRole('button', { name: '保存桌面设置' }));
    expect(onSave).toHaveBeenCalledWith({ managerRoot: '/Users/me/work-manager', nodePath: '/opt/homebrew/bin/node' });
  });

  it('未初始化时以 Codex 项目目录引导创建项目', async () => {
    const onInitialize = vi.fn().mockResolvedValue(undefined);
    render(<SettingsPage
      settings={{ managerRoot: null, nodePath: null }}
      onSave={vi.fn()}
      onInitialize={onInitialize}
      onClearAndReset={vi.fn()}
    />);
    await userEvent.click(screen.getByRole('button', { name: '初始化项目' }));
    expect(screen.getByRole('dialog', { name: '初始化 Codex 项目' })).toBeInTheDocument();
    expect(screen.getByText('Codex 项目目录')).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('项目名称'), '我的工作台');
    await userEvent.click(screen.getByRole('button', { name: '创建项目' }));
    expect(onInitialize).not.toHaveBeenCalled();
    expect(screen.getByText('请选择项目目录')).toBeInTheDocument();
  });

  it('目录选择失败时提示原因，并为初始化输入提供占位文本', async () => {
    const onChooseDirectory = vi.fn().mockRejectedValue(new Error('没有目录选择权限'));
    render(<SettingsPage
      settings={{ managerRoot: null, nodePath: null }}
      onSave={vi.fn()}
      onInitialize={vi.fn()}
      onClearAndReset={vi.fn()}
      onChooseDirectory={onChooseDirectory}
    />);

    await userEvent.click(screen.getByRole('button', { name: '初始化项目' }));
    expect(screen.getByLabelText('项目名称')).toHaveAttribute('placeholder', '例如：我的工作管理器');
    expect(screen.getByLabelText('项目目录')).toHaveAttribute('placeholder', '请选择保存项目的本机目录');
    await userEvent.click(screen.getByRole('button', { name: '选择目录' }));

    expect(onChooseDirectory).toHaveBeenCalledTimes(1);
    expect(await screen.findByRole('alert')).toHaveTextContent('没有目录选择权限');
  });

  it('已初始化时提供清空并重新设置', () => {
    render(<SettingsPage
      settings={{ managerRoot: '/tmp/work-manager', nodePath: null }}
      onSave={vi.fn()}
      onInitialize={vi.fn()}
      onClearAndReset={vi.fn().mockResolvedValue(undefined)}
    />);
    const codexDirectoryCard = screen.getByRole('heading', { name: 'Codex 项目目录' }).closest('section');
    expect(codexDirectoryCard).not.toBeNull();
    expect(within(codexDirectoryCard!).getByRole('button', { name: '清空并重新设置' })).toBeInTheDocument();
  });

  it('清空失败时显示错误并保留当前配置和重试入口', async () => {
    const onClearAndReset = vi.fn().mockRejectedValue(new Error('本地数据库正在使用中'));
    render(<SettingsPage
      settings={{ managerRoot: '/tmp/work-manager', nodePath: '/opt/homebrew/bin/node' }}
      onSave={vi.fn()}
      onInitialize={vi.fn()}
      onClearAndReset={onClearAndReset}
    />);

    await userEvent.click(screen.getByRole('button', { name: '清空并重新设置' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('本地数据库正在使用中');
    expect(screen.getByLabelText('Codex 项目目录')).toHaveValue('/tmp/work-manager');
    expect(screen.getByLabelText('Node.js 可执行文件')).toHaveValue('/opt/homebrew/bin/node');
    expect(screen.getByRole('button', { name: '清空并重新设置' })).toBeEnabled();
  });

  it('已完成任务不展示无效的暂停与完成操作', () => {
    const detail: TaskDetail = {
      task: done,
      project: { id: 'demo', name: 'Demo' },
      configuration: { valid: true, issueProvider: 'none', configuredServices: 0 },
      artifacts: { completion: '# 完成总结' },
      artifactFiles: [{ kind: 'completion', path: '/tmp/completion.md', updatedAt: '2026-07-17T08:32:00.000Z' }],
      events: [],
      services: []
    };
    render(<TaskDetailPage detail={detail} pendingAction={null} onBack={vi.fn()} onAction={vi.fn()} />);
    expect(screen.queryByRole('button', { name: '暂停任务' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '标记完成' })).not.toBeInTheDocument();
    expect(screen.getByText((_, element) => element?.tagName === 'DD' && element.textContent?.includes('配置有效') === true)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '打开完成总结文件' })).toBeInTheDocument();
  });
});
