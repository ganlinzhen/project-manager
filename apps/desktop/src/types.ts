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
  project: { id: string; name: string; repositoryPath?: string; issue?: { provider: string } };
  configuration?: { valid: boolean; issueProvider: string; configuredServices: number };
  artifacts: Partial<Record<'requirements' | 'context' | 'plan' | 'progress' | 'completion', string>>;
  artifactFiles: Array<{ kind: string; path: string; updatedAt: string }>;
  events: TaskEvent[];
  services: ServiceSummary[];
}

export type TaskAction = 'start-service' | 'stop-service' | 'pause' | 'resume' | 'complete' | 'copy-context' | 'open-worktree' | 'open-artifact' | 'open-url';
export interface Feedback { kind: 'success' | 'error'; message: string; suggestion?: string; }
