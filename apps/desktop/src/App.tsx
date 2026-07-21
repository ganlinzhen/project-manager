import { FolderKanban, KanbanSquare, Settings } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { wmApi, type DesktopSettings } from './api/wm.js';
import { BoardPage } from './pages/BoardPage.js';
import { TaskDetailPage } from './pages/TaskDetailPage.js';
import { SettingsPage } from './pages/SettingsPage.js';
import type { Feedback, TaskAction, TaskDetail, TaskSummary } from './types.js';

type Page = 'board' | 'projects' | 'settings';

export default function App() {
  const [page, setPage] = useState<Page>('board');
  const [tasks, setTasks] = useState<TaskSummary[]>([]);
  const [detail, setDetail] = useState<TaskDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [settings, setSettings] = useState<DesktopSettings>({ managerRoot: null, nodePath: null });

  const loadTasks = useCallback(async () => {
    setLoading(true);
    try { setTasks(await wmApi.listTasks()); }
    catch (error) { setFeedback({ kind: 'error', message: error instanceof Error ? error.message : String(error) }); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void loadTasks(); }, [loadTasks]);
  useEffect(() => { void wmApi.getSettings().then(setSettings).catch(() => undefined); }, []);

  async function openTask(id: string) {
    setLoading(true);
    try { setDetail(await wmApi.getTask(id)); }
    catch (error) { setFeedback({ kind: 'error', message: error instanceof Error ? error.message : String(error) }); }
    finally { setLoading(false); }
  }

  async function handleAction(action: TaskAction, data: Record<string, string> = {}) {
    if (!detail) return;
    const id = detail.task.id;
    setPendingAction(action.includes('service') ? `${action.startsWith('start') ? 'start' : 'stop'}-${data.serviceKey}` : action);
    try {
      if (action === 'copy-context') {
        await navigator.clipboard.writeText([detail.artifacts.requirements, detail.artifacts.context, detail.artifacts.progress].filter(Boolean).join('\n\n'));
      } else if (action === 'start-service' || action === 'stop-service') {
        await wmApi.serviceAction(id, action === 'start-service' ? 'start' : 'stop', data.serviceKey!);
      } else if (action === 'pause' || action === 'resume' || action === 'complete') await wmApi.taskAction(id, action);
      else if (action === 'open-worktree') await wmApi.openWorktree(id);
      else if (action === 'open-artifact') await wmApi.openArtifact(id, data.kind!);
      else if (action === 'open-url') await wmApi.openUrl(data.url!);
      setFeedback({ kind: 'success', message: action === 'copy-context' ? 'Codex 上下文已复制' : '操作已完成' });
      if (!['open-worktree', 'open-artifact', 'open-url', 'copy-context'].includes(action)) { setDetail(await wmApi.getTask(id)); await loadTasks(); }
    } catch (error) {
      const candidate = error as Error & { suggestion?: string };
      setFeedback({ kind: 'error', message: candidate.message, suggestion: candidate.suggestion });
    } finally { setPendingAction(null); }
  }

  async function saveSettings(value: { managerRoot: string; nodePath: string }) {
    try {
      const saved = await wmApi.saveSettings(value);
      setSettings(saved);
      setFeedback({ kind: 'success', message: '桌面设置已保存' });
      await loadTasks();
    } catch (error) {
      setFeedback({ kind: 'error', message: error instanceof Error ? error.message : String(error) });
    }
  }

  return <div className="app-shell">
    <header className="topbar"><button className="brand" onClick={() => { setPage('board'); setDetail(null); }}><span>wm</span><strong>工作管理器</strong></button><nav aria-label="主导航"><button className={page === 'board' ? 'is-active' : ''} onClick={() => { setPage('board'); setDetail(null); }}><KanbanSquare size={17} />看板</button><button className={page === 'projects' ? 'is-active' : ''} onClick={() => { setPage('projects'); setDetail(null); }}><FolderKanban size={17} />项目</button><button className={page === 'settings' ? 'is-active' : ''} onClick={() => { setPage('settings'); setDetail(null); }}><Settings size={17} />设置</button></nav><span className="connection-state">本地数据</span></header>
    {detail ?
      <TaskDetailPage detail={detail} pendingAction={pendingAction} feedback={feedback} onBack={() => setDetail(null)} onAction={handleAction} />
      : page === 'board' ? <BoardPage tasks={tasks} loading={loading} onOpenTask={openTask} />
        : page === 'settings' ? <SettingsPage settings={settings} onSave={saveSettings} />
          : <main className="page utility-page"><h1>项目</h1><p>项目配置来自工作管理仓库的 projects/*.yaml。使用 wm project validate 检查仓库、Issue 登录态和服务配置。</p></main>}
  </div>;
}
