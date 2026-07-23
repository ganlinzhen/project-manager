export const taskStatuses = ['creating', 'ready', 'in_progress', 'blocked', 'paused', 'done', 'cancelled'] as const;
export type TaskStatus = (typeof taskStatuses)[number];
export type TaskType = 'feature' | 'bug' | 'chore';
export type TaskPriority = 'low' | 'medium' | 'high' | 'urgent';
export type IssueProviderKind = 'github' | 'gitlab' | 'none';
export type ProjectMode = 'real' | 'demo';

export interface DevelopmentServiceConfig {
  cwd: string;
  startCommand: string | string[];
  healthCheckUrl?: string;
  port?: number;
}

export interface ProjectConfig {
  id: string;
  name: string;
  taskPrefix: string;
  mode: ProjectMode;
  repositoryPath: string;
  worktreeRoot?: string;
  defaultBranch: string;
  issue: {
    provider: IssueProviderKind;
    repository?: string;
    labels?: Partial<Record<TaskType, string[]>>;
  };
  development: { services: Record<string, DevelopmentServiceConfig> };
}

export interface TaskRecord {
  id: string;
  projectId: string;
  sequence: number;
  title: string;
  type: TaskType;
  priority: TaskPriority;
  status: TaskStatus;
  requirementSummary: string | null;
  currentProgress: string | null;
  nextAction: string | null;
  blockedReason: string | null;
  issueProvider: IssueProviderKind;
  issueNumber: number | null;
  issueUrl: string | null;
  pullRequestNumber: number | null;
  pullRequestUrl: string | null;
  branchName: string | null;
  worktreePath: string | null;
  createIssueRequested: boolean;
  createWorktreeRequested: boolean;
  archivedAt: string | null;
  archivedReason: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface EventRecord {
  id: number;
  taskId: string;
  type: string;
  success: boolean;
  message: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface ArtifactRecord {
  taskId: string;
  kind: ArtifactKind;
  path: string;
  updatedAt: string;
}

export type ArtifactKind = 'requirements' | 'context' | 'plan' | 'progress' | 'completion';

export interface DevelopmentServiceRecord {
  taskId: string;
  serviceKey: string;
  command: string[];
  cwd: string;
  pid: number | null;
  processIdentity: string | null;
  port: number | null;
  healthCheckUrl: string | null;
  status: 'stopped' | 'starting' | 'running' | 'unhealthy' | 'failed';
  startedAt: string | null;
  stoppedAt: string | null;
  lastError: string | null;
}

export interface CreateTaskInput {
  projectId: string;
  title: string;
  type: TaskType;
  priority: TaskPriority;
  requirementSummary?: string;
  createIssue?: boolean;
  createWorktree?: boolean;
}

const transitions: Record<TaskStatus, TaskStatus[]> = {
  creating: ['ready', 'blocked', 'cancelled'],
  ready: ['in_progress', 'paused', 'done', 'cancelled'],
  in_progress: ['blocked', 'paused', 'done', 'cancelled'],
  blocked: ['ready', 'in_progress', 'paused', 'cancelled'],
  paused: ['in_progress', 'cancelled'],
  done: ['in_progress'],
  cancelled: ['ready']
};

export function canTransition(from: TaskStatus, to: TaskStatus): boolean {
  return transitions[from].includes(to);
}
