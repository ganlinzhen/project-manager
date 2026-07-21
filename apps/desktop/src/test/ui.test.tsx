import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { BoardPage } from '../pages/BoardPage.js';
import { TaskDetailPage } from '../pages/TaskDetailPage.js';
import { SettingsPage } from '../pages/SettingsPage.js';
import type { TaskDetail, TaskSummary } from '../types.js';

const active: TaskSummary = {
  id: 'DEMO-1', projectId: 'demo', title: '完成个人工作管理器', status: 'in_progress', priority: 'high',
  nextAction: '运行端到端验证', currentProgress: 'CLI 已完成', blockedReason: null,
  updatedAt: '2026-07-17T08:30:00.000Z', worktreePath: '/tmp/DEMO-1',
  services: [{ serviceKey: 'web', status: 'running', port: 1420 }]
};
const done: TaskSummary = { ...active, id: 'DEMO-2', title: '归档旧任务', status: 'done', nextAction: null, services: [] };

describe('桌面端任务流', () => {
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
    render(<TaskDetailPage detail={detail} pendingAction={null} feedback={null} onBack={vi.fn()} onAction={onAction} />);
    await userEvent.click(screen.getByRole('button', { name: '启动 web' }));
    expect(onAction).toHaveBeenCalledWith('start-service', { serviceKey: 'web' });
    expect(screen.getByText('健康检查失败')).toBeInTheDocument();
    expect(screen.getByText(/wm env start DEMO-1/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '打开工作树' })).toBeInTheDocument();
  });

  it('设置页保存工作管理仓库和 Node.js 绝对路径', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(<SettingsPage settings={{ managerRoot: '/workspace/manager', nodePath: '/opt/homebrew/bin/node' }} onSave={onSave} />);
    await userEvent.clear(screen.getByLabelText('工作管理仓库'));
    await userEvent.type(screen.getByLabelText('工作管理仓库'), '/Users/me/work-manager');
    await userEvent.click(screen.getByRole('button', { name: '保存桌面设置' }));
    expect(onSave).toHaveBeenCalledWith({ managerRoot: '/Users/me/work-manager', nodePath: '/opt/homebrew/bin/node' });
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
    render(<TaskDetailPage detail={detail} pendingAction={null} feedback={null} onBack={vi.fn()} onAction={vi.fn()} />);
    expect(screen.queryByRole('button', { name: '暂停任务' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '标记完成' })).not.toBeInTheDocument();
    expect(screen.getByText((_, element) => element?.tagName === 'DD' && element.textContent?.includes('配置有效') === true)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '打开完成总结文件' })).toBeInTheDocument();
  });
});
