import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import type { ProjectDetail, ProjectSummary, TaskDetail, TaskSummary } from '../types.js';

export interface DesktopSettings { managerRoot: string | null; nodePath: string | null; }
export interface InitializeCodexProjectInput { projectName: string; parentDirectory: string; }

type WmSuccess<T> = { ok: true; data: T };
type WmFailure = { ok: false; error: { code: string; message: string; recoverable: boolean; suggestedCommand?: string } };
type WmResponse<T> = WmSuccess<T> | WmFailure;

const browserDemo: TaskSummary[] = [{
  id: 'DEMO-1', projectId: 'project-manager', title: '完成个人工作管理器 MVP', status: 'in_progress', priority: 'high',
  currentProgress: 'CLI 核心流程已接通', nextAction: '检查桌面端任务详情', blockedReason: null,
  updatedAt: new Date().toISOString(), worktreePath: '/tmp/DEMO-1', branchName: 'wm/demo-1-mvp', issueUrl: null,
  services: [{ serviceKey: 'desktop', status: 'running', port: 1420 }]
}];

const browserProject: ProjectSummary = {
  id: 'project-manager', name: 'Project Manager', mode: 'demo', repositoryPath: '/tmp/project-manager',
  defaultBranch: 'main', issue: { provider: 'none' }, serviceCount: 1
};

function isTauri(): boolean { return '__TAURI_INTERNALS__' in window; }

async function call<T>(args: string[]): Promise<T> {
  const response = await invoke<WmResponse<T>>('wm_command', { args });
  if (!response.ok) {
    const error = new Error(response.error.message) as Error & { suggestion?: string };
    error.suggestion = response.error.suggestedCommand;
    throw error;
  }
  return response.data;
}

export const wmApi = {
  async listTasks(options: { archived?: boolean } = {}): Promise<TaskSummary[]> {
    if (!isTauri()) return browserDemo;
    return (await call<{ tasks: TaskSummary[] }>(['task', 'list', '--all', ...(options.archived ? ['--archived'] : []), '--json'])).tasks;
  },
  async listProjects(): Promise<ProjectSummary[]> {
    if (!isTauri()) return [browserProject];
    return (await call<{ projects: ProjectSummary[] }>(['project', 'list', '--json'])).projects;
  },
  async syncProjects(): Promise<ProjectSummary[]> {
    if (!isTauri()) return [browserProject];
    return (await call<{ projects: ProjectSummary[] }>(['project', 'sync', '--json'])).projects;
  },
  async getProject(id: string): Promise<ProjectDetail> {
    if (!isTauri()) {
      return {
        project: {
          ...browserProject,
          development: { services: { desktop: { cwd: '.', startCommand: ['pnpm', 'desktop:dev'], port: 1420 } } }
        }
      };
    }
    return call<ProjectDetail>(['project', 'show', id, '--json']);
  },
  async getTask(id: string): Promise<TaskDetail> {
    if (!isTauri()) return {
      task: browserDemo[0]!, project: { id: 'project-manager', name: 'Project Manager' },
      artifacts: { context: '# 上下文\nCLI 与 Core 已接通。', progress: '# 进展\n下一步：检查桌面端任务详情。' }, artifactFiles: [],
      services: browserDemo[0]!.services,
      events: [{ id: 1, type: 'progress_updated', success: true, message: '任务进展已更新', metadata: {}, createdAt: new Date().toISOString() }]
    };
    return call<TaskDetail>(['task', 'show', id, '--json']);
  },
  async taskAction(id: string, action: 'pause' | 'resume' | 'complete' | 'archive' | 'restore', data: { reason?: string } = {}): Promise<void> {
    if (!isTauri()) return;
    await call(['task', action, id, ...(data.reason ? ['--reason', data.reason] : []), '--json']);
  },
  async serviceAction(id: string, action: 'start' | 'stop', serviceKey: string): Promise<void> {
    if (!isTauri()) return;
    await call(['env', action, id, '--service', serviceKey, '--json']);
  },
  async openWorktree(taskId: string): Promise<void> { if (isTauri()) await invoke('open_worktree', { taskId }); },
  async openArtifact(taskId: string, kind: string): Promise<void> { if (isTauri()) await invoke('open_artifact', { taskId, kind }); },
  async openUrl(url: string): Promise<void> { if (isTauri()) await invoke('open_url', { url }); },
  async getSettings(): Promise<DesktopSettings> {
    if (!isTauri()) return { managerRoot: '', nodePath: '' };
    return invoke<DesktopSettings>('get_desktop_settings');
  },
  async saveSettings(settings: { managerRoot: string; nodePath: string }): Promise<DesktopSettings> {
    if (!isTauri()) return settings;
    return invoke<DesktopSettings>('save_desktop_settings', { managerRoot: settings.managerRoot, nodePath: settings.nodePath || null });
  },
  async chooseDirectory(): Promise<string | null> {
    if (!isTauri()) return null;
    const selected = await open({ directory: true, multiple: false, title: '选择 Codex 项目的本机目录' });
    return typeof selected === 'string' ? selected : null;
  },
  async initializeCodexProject(input: InitializeCodexProjectInput): Promise<DesktopSettings> {
    if (!isTauri()) return { managerRoot: input.parentDirectory ? `${input.parentDirectory}/${input.projectName}` : null, nodePath: null };
    return invoke<DesktopSettings>('initialize_codex_project', { projectName: input.projectName, parentDirectory: input.parentDirectory });
  },
  async clearDesktopData(): Promise<DesktopSettings> {
    if (!isTauri()) return { managerRoot: null, nodePath: null };
    return invoke<DesktopSettings>('clear_desktop_data');
  }
};
