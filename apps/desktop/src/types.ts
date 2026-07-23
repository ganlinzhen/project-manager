export type TaskStatus = 'creating' | 'ready' | 'in_progress' | 'blocked' | 'paused' | 'done' | 'cancelled';
export type TaskPriority = 'low' | 'medium' | 'high' | 'urgent';

export interface ServiceSummary {
  serviceKey: string;
  status: 'stopped' | 'starting' | 'running' | 'unhealthy' | 'failed';
  port: number | null;
  lastError?: string | null;
  pid?: number | null;
  healthCheckUrl?: string | null;
}

export type ProjectMode = 'real' | 'demo';

export interface ProjectIssue {
  provider: 'github' | 'gitlab' | 'none';
  repository?: string;
  labels?: Partial<Record<'feature' | 'bug' | 'chore', string[]>>;
}

export interface ProjectServiceConfig {
  cwd: string;
  startCommand: string | string[];
  healthCheckUrl?: string;
  port?: number;
}

export interface ProjectConfig {
  id: string;
  name: string;
  mode: ProjectMode;
  repositoryPath: string;
  worktreeRoot?: string;
  defaultBranch: string;
  issue: ProjectIssue;
  development: { services: Record<string, ProjectServiceConfig> };
}

export interface ProjectSummary extends Omit<ProjectConfig, 'development' | 'worktreeRoot'> {
  serviceCount: number;
}

export interface ProjectDetail {
  project: ProjectConfig;
}

export interface TaskSummary {
  id: string;
  projectId: string;
  title: string;
  status: TaskStatus;
  priority: TaskPriority;
  currentProgress: string | null;
  nextAction: string | null;
  blockedReason: string | null;
  requirementSummary?: string | null;
  updatedAt: string;
  worktreePath?: string | null;
  branchName?: string | null;
  issueUrl?: string | null;
  pullRequestUrl?: string | null;
  archivedAt?: string | null;
  archivedReason?: string | null;
  services: ServiceSummary[];
}

export interface TaskEvent {
  id: number;
  type: string;
  success: boolean;
  message: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface TaskDetail {
  task: TaskSummary;
  project: { id: string; name: string; mode?: 'real' | 'demo'; repositoryPath?: string; issue?: { provider: string } };
  configuration?: { valid: boolean; issueProvider: string; configuredServices: number };
  artifacts: Partial<Record<'requirements' | 'context' | 'plan' | 'progress' | 'completion', string>>;
  artifactFiles: Array<{ kind: string; path: string; updatedAt: string }>;
  events: TaskEvent[];
  services: ServiceSummary[];
}

export type TaskAction = 'start-service' | 'stop-service' | 'pause' | 'resume' | 'complete' | 'archive' | 'restore' | 'copy-context' | 'open-worktree' | 'open-artifact' | 'open-url';
export interface Feedback { kind: 'success' | 'error'; message: string; suggestion?: string; }
