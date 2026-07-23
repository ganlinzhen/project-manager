import { FolderKanban, KanbanSquare, Settings } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { wmApi, type DesktopSettings } from './api/wm.js';
import { ToastViewport, type Toast } from './components/ToastViewport.js';
import { BoardPage } from './pages/BoardPage.js';
import { ProjectDetailPage } from './pages/ProjectDetailPage.js';
import { ProjectListPage } from './pages/ProjectListPage.js';
import { TaskDetailPage } from './pages/TaskDetailPage.js';
import { SettingsPage } from './pages/SettingsPage.js';
import type { Feedback, ProjectDetail, ProjectSummary, TaskAction, TaskDetail, TaskSummary } from './types.js';

type Page = 'board' | 'projects' | 'settings';

export default function App() {
  const [page, setPage] = useState<Page>('board');
  const [tasks, setTasks] = useState<TaskSummary[]>([]);
  const [showArchived, setShowArchived] = useState(false);
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [detail, setDetail] = useState<TaskDetail | null>(null);
  const [projectDetail, setProjectDetail] = useState<ProjectDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [projectsLoading, setProjectsLoading] = useState(false);
  const [syncingProjects, setSyncingProjects] = useState(false);
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [settings, setSettings] = useState<DesktopSettings>({ managerRoot: null, nodePath: null });
  const taskLoadGeneration = useRef(0);
  const projectLoadGeneration = useRef(0);
  const toastId = useRef(0);

  const pushToast = useCallback((feedback: Feedback) => {
    setToasts((current) => [...current, { ...feedback, id: ++toastId.current }]);
  }, []);
  const dismissToast = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const loadTasks = useCallback(async (options: { archived?: boolean } = {}) => {
    const generation = ++taskLoadGeneration.current;
    setLoading(true);
    try {
      const loaded = await wmApi.listTasks({ archived: options.archived ?? showArchived });
      if (taskLoadGeneration.current !== generation) return false;
      setTasks(loaded);
      return true;
    } catch (error) {
      if (taskLoadGeneration.current === generation) {
        pushToast({ kind: 'error', message: error instanceof Error ? error.message : String(error) });
      }
      return false;
    } finally {
      if (taskLoadGeneration.current === generation) setLoading(false);
    }
  }, [pushToast, showArchived]);
  useEffect(() => { void loadTasks(); }, [loadTasks]);
  useEffect(() => { void wmApi.getSettings().then(setSettings).catch(() => undefined); }, []);

  const loadProjects = useCallback(async () => {
    const generation = ++projectLoadGeneration.current;
    setProjectsLoading(true);
    try {
      const loaded = await wmApi.listProjects();
      if (projectLoadGeneration.current !== generation) return false;
      setProjects(loaded);
      return true;
    } catch (error) {
      if (projectLoadGeneration.current === generation) pushToast({ kind: 'error', message: error instanceof Error ? error.message : String(error) });
      return false;
    } finally {
      if (projectLoadGeneration.current === generation) setProjectsLoading(false);
    }
  }, [pushToast]);
  useEffect(() => {
    if (page === 'projects' && !projectDetail) void loadProjects();
  }, [loadProjects, page, projectDetail]);

  async function openTask(id: string) {
    setLoading(true);
    try { setDetail(await wmApi.getTask(id)); }
    catch (error) { pushToast({ kind: 'error', message: error instanceof Error ? error.message : String(error) }); }
    finally { setLoading(false); }
  }

  async function openProject(id: string) {
    setProjectsLoading(true);
    try { setProjectDetail(await wmApi.getProject(id)); }
    catch (error) { pushToast({ kind: 'error', message: error instanceof Error ? error.message : String(error) }); }
    finally { setProjectsLoading(false); }
  }

  async function syncProjects() {
    setSyncingProjects(true);
    try {
      const synced = await wmApi.syncProjects();
      setProjects(synced);
      pushToast({ kind: 'success', message: `已同步 ${synced.length} 个项目` });
    } catch (error) {
      pushToast({ kind: 'error', message: error instanceof Error ? error.message : String(error) });
    } finally {
      setSyncingProjects(false);
    }
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
      else if (action === 'archive') await wmApi.taskAction(id, action, { reason: data.reason });
      else if (action === 'restore') await wmApi.taskAction(id, action);
      else if (action === 'open-worktree') await wmApi.openWorktree(id);
      else if (action === 'open-artifact') await wmApi.openArtifact(id, data.kind!);
      else if (action === 'open-url') await wmApi.openUrl(data.url!);
      pushToast({ kind: 'success', message: action === 'copy-context' ? 'Codex 上下文已复制' : '操作已完成' });
      if (!['open-worktree', 'open-artifact', 'open-url', 'copy-context'].includes(action)) { setDetail(await wmApi.getTask(id)); await loadTasks(); }
    } catch (error) {
      const candidate = error as Error & { suggestion?: string };
      pushToast({ kind: 'error', message: candidate.message, suggestion: candidate.suggestion });
    } finally { setPendingAction(null); }
  }

  function selectArchived(next: boolean) {
    setShowArchived(next);
    void loadTasks({ archived: next });
  }

  async function saveSettings(value: { managerRoot: string; nodePath: string }) {
    try {
      const saved = await wmApi.saveSettings(value);
      setSettings(saved);
      pushToast({ kind: 'success', message: '桌面设置已保存' });
      await loadTasks();
    } catch (error) {
      pushToast({ kind: 'error', message: error instanceof Error ? error.message : String(error) });
    }
  }

  async function initializeCodexProject(input: { projectName: string; parentDirectory: string }) {
    try {
      const saved = await wmApi.initializeCodexProject(input);
      setSettings(saved);
      if (await loadTasks()) pushToast({ kind: 'success', message: 'Codex 项目已初始化' });
      return saved;
    } catch (error) {
      pushToast({ kind: 'error', message: error instanceof Error ? error.message : String(error) });
      throw error;
    }
  }

  async function clearAndReset() {
    try {
      const saved = await wmApi.clearDesktopData();
      taskLoadGeneration.current += 1;
      projectLoadGeneration.current += 1;
      setSettings(saved);
      setTasks([]);
      setDetail(null);
      setProjects([]);
      setProjectDetail(null);
      setLoading(false);
      pushToast({ kind: 'success', message: '本地数据已清空，请重新初始化 Codex 项目' });
      return saved;
    } catch (error) {
      pushToast({ kind: 'error', message: error instanceof Error ? error.message : String(error) });
      throw error;
    }
  }

  return <div className="app-shell">
    <header className="topbar"><button className="brand" onClick={() => { setPage('board'); setDetail(null); setProjectDetail(null); }}><span>wm</span><strong>工作管理器</strong></button><nav aria-label="主导航"><button className={page === 'board' ? 'is-active' : ''} onClick={() => { setPage('board'); setDetail(null); setProjectDetail(null); }}><KanbanSquare size={17} />看板</button><button className={page === 'projects' ? 'is-active' : ''} onClick={() => { setPage('projects'); setDetail(null); setProjectDetail(null); }}><FolderKanban size={17} />项目</button><button className={page === 'settings' ? 'is-active' : ''} onClick={() => { setPage('settings'); setDetail(null); setProjectDetail(null); }}><Settings size={17} />设置</button></nav><span className="connection-state">本地数据</span></header>
    <ToastViewport toasts={toasts} onDismiss={dismissToast} />
    {projectDetail ? <ProjectDetailPage detail={projectDetail} onBack={() => setProjectDetail(null)} />
      : detail ?
      <TaskDetailPage detail={detail} pendingAction={pendingAction} onBack={() => setDetail(null)} onAction={handleAction} />
      : page === 'board' ? <BoardPage tasks={tasks} loading={loading} onOpenTask={openTask} showArchived={showArchived} onShowArchived={selectArchived} />
        : page === 'settings' ? <SettingsPage settings={settings} onSave={saveSettings} onInitialize={initializeCodexProject} onClearAndReset={clearAndReset} onChooseDirectory={wmApi.chooseDirectory} />
          : <ProjectListPage projects={projects} loading={projectsLoading} syncing={syncingProjects} onSync={syncProjects} onOpenProject={openProject} />}
  </div>;
}
