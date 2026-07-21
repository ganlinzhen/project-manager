import type {
  ArtifactKind, ArtifactRecord, CreateTaskInput, DevelopmentServiceRecord, EventRecord,
  IssueProviderKind, ProjectConfig, TaskRecord, TaskStatus
} from './domain.js';
import { canTransition } from './domain.js';
import { WorkManagerDatabase } from './database.js';
import { WorkManagerError } from './errors.js';

type SqlRow = Record<string, unknown>;

function now(): string { return new Date().toISOString(); }
function boolean(value: unknown): boolean { return Number(value) === 1; }

function mapTask(row: SqlRow): TaskRecord {
  return {
    id: String(row.id), projectId: String(row.project_id), sequence: Number(row.sequence), title: String(row.title),
    type: row.type as TaskRecord['type'], priority: row.priority as TaskRecord['priority'], status: row.status as TaskStatus,
    requirementSummary: row.requirement_summary == null ? null : String(row.requirement_summary),
    currentProgress: row.current_progress == null ? null : String(row.current_progress),
    nextAction: row.next_action == null ? null : String(row.next_action),
    blockedReason: row.blocked_reason == null ? null : String(row.blocked_reason),
    issueProvider: row.issue_provider as IssueProviderKind,
    issueNumber: row.issue_number == null ? null : Number(row.issue_number), issueUrl: row.issue_url == null ? null : String(row.issue_url),
    pullRequestNumber: row.pull_request_number == null ? null : Number(row.pull_request_number),
    pullRequestUrl: row.pull_request_url == null ? null : String(row.pull_request_url),
    branchName: row.branch_name == null ? null : String(row.branch_name), worktreePath: row.worktree_path == null ? null : String(row.worktree_path),
    createIssueRequested: boolean(row.create_issue_requested), createWorktreeRequested: boolean(row.create_worktree_requested),
    createdAt: String(row.created_at), updatedAt: String(row.updated_at)
  };
}

function redact(value: unknown): unknown {
  if (Array.isArray(value)) {
    let hideNext = false;
    return value.map((item) => {
      if (hideNext) { hideNext = false; return '[REDACTED]'; }
      if (typeof item === 'string' && /^--?(?:token|api-key|apikey|password|secret|cookie|authorization)$/i.test(item)) {
        hideNext = true;
        return item;
      }
      if (typeof item === 'string' && /^--?(?:token|api-key|apikey|password|secret|cookie|authorization)=/i.test(item)) {
        return `${item.split('=', 1)[0]}=[REDACTED]`;
      }
      return redact(item);
    });
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).filter(([key]) => !/token|cookie|authorization|header|environment/i.test(key)).map(([key, item]) => [key, redact(item)]));
  }
  return value;
}

export class TaskRepository {
  constructor(readonly database: WorkManagerDatabase) {}

  registerProject(project: ProjectConfig): void {
    this.database.connection.prepare(`
      INSERT INTO projects(id, config_json, updated_at) VALUES (?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET config_json = excluded.config_json, updated_at = excluded.updated_at
    `).run(project.id, JSON.stringify(project), now());
  }

  getProject(projectId: string): ProjectConfig | null {
    const row = this.database.connection.prepare('SELECT config_json FROM projects WHERE id = ?').get(projectId) as SqlRow | undefined;
    return row ? JSON.parse(String(row.config_json)) as ProjectConfig : null;
  }

  listProjects(): ProjectConfig[] {
    return (this.database.connection.prepare('SELECT config_json FROM projects ORDER BY id').all() as SqlRow[])
      .map((row) => JSON.parse(String(row.config_json)) as ProjectConfig);
  }

  createTask(project: ProjectConfig, input: Omit<CreateTaskInput, 'projectId'>): TaskRecord {
    return this.database.transaction(() => {
      const update = this.database.connection.prepare('UPDATE projects SET number_counter = number_counter + 1, updated_at = ? WHERE id = ?').run(now(), project.id);
      if (update.changes !== 1) throw new WorkManagerError('PROJECT_NOT_REGISTERED', `项目未注册：${project.id}`);
      const counter = this.database.connection.prepare('SELECT number_counter FROM projects WHERE id = ?').get(project.id) as SqlRow;
      const sequence = Number(counter.number_counter);
      const id = `${project.taskPrefix}-${sequence}`;
      const timestamp = now();
      this.database.connection.prepare(`
        INSERT INTO tasks(id, project_id, sequence, title, type, priority, status, requirement_summary,
          issue_provider, create_issue_requested, create_worktree_requested, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, 'creating', ?, ?, ?, ?, ?, ?)
      `).run(id, project.id, sequence, input.title.trim(), input.type, input.priority, input.requirementSummary ?? null,
        project.issue.provider, input.createIssue ? 1 : 0, input.createWorktree ? 1 : 0, timestamp, timestamp);
      this.appendEvent(id, 'task_created', true, '任务已创建', { projectId: project.id });
      return this.requireTask(id);
    });
  }

  getTask(id: string): TaskRecord | null {
    const row = this.database.connection.prepare('SELECT * FROM tasks WHERE id = ?').get(id) as SqlRow | undefined;
    return row ? mapTask(row) : null;
  }

  requireTask(id: string): TaskRecord {
    const task = this.getTask(id);
    if (!task) throw new WorkManagerError('TASK_NOT_FOUND', `任务不存在：${id}`);
    return task;
  }

  listTasks(filters: { projectId?: string; status?: TaskStatus; query?: string } = {}): TaskRecord[] {
    const where: string[] = [];
    const values: Array<string | number> = [];
    if (filters.projectId) { where.push('project_id = ?'); values.push(filters.projectId); }
    if (filters.status) { where.push('status = ?'); values.push(filters.status); }
    if (filters.query) { where.push('(title LIKE ? OR id LIKE ? OR next_action LIKE ?)'); const query = `%${filters.query}%`; values.push(query, query, query); }
    const sql = `SELECT * FROM tasks ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY updated_at DESC`;
    return (this.database.connection.prepare(sql).all(...values) as SqlRow[]).map(mapTask);
  }

  updateTask(id: string, values: Partial<Pick<TaskRecord,
    'status' | 'currentProgress' | 'nextAction' | 'blockedReason' | 'issueProvider' | 'issueNumber' | 'issueUrl' |
    'branchName' | 'worktreePath' | 'pullRequestNumber' | 'pullRequestUrl'>>): TaskRecord {
    const mapping: Record<string, string> = {
      status: 'status', currentProgress: 'current_progress', nextAction: 'next_action', blockedReason: 'blocked_reason',
      issueProvider: 'issue_provider', issueNumber: 'issue_number', issueUrl: 'issue_url', branchName: 'branch_name',
      worktreePath: 'worktree_path', pullRequestNumber: 'pull_request_number', pullRequestUrl: 'pull_request_url'
    };
    const entries = Object.entries(values).filter(([key]) => key in mapping);
    if (!entries.length) return this.requireTask(id);
    const clauses = entries.map(([key]) => `${mapping[key]} = ?`);
    const params = entries.map(([, value]) => value ?? null);
    this.database.connection.prepare(`UPDATE tasks SET ${clauses.join(', ')}, updated_at = ? WHERE id = ?`).run(...params, now(), id);
    return this.requireTask(id);
  }

  transition(id: string, to: TaskStatus, message?: string): TaskRecord {
    return this.database.transaction(() => {
      const task = this.requireTask(id);
      if (task.status !== to && !canTransition(task.status, to)) {
        throw new WorkManagerError('TASK_TRANSITION_INVALID', `不能从 ${task.status} 转为 ${to}`);
      }
      const updated = this.updateTask(id, { status: to });
      this.appendEvent(id, 'status_changed', true, message ?? `${task.status} → ${to}`, { from: task.status, to });
      return updated;
    });
  }

  appendEvent(taskId: string, type: string, success: boolean, message: string | null = null, metadata: Record<string, unknown> = {}): void {
    this.database.connection.prepare('INSERT INTO task_events(task_id, type, success, message, metadata_json, created_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(taskId, type, success ? 1 : 0, message, JSON.stringify(redact(metadata)), now());
  }

  listEvents(taskId: string): EventRecord[] {
    return (this.database.connection.prepare('SELECT * FROM task_events WHERE task_id = ? ORDER BY id').all(taskId) as SqlRow[]).map((row) => ({
      id: Number(row.id), taskId: String(row.task_id), type: String(row.type), success: boolean(row.success),
      message: row.message == null ? null : String(row.message), metadata: JSON.parse(String(row.metadata_json)) as Record<string, unknown>, createdAt: String(row.created_at)
    }));
  }

  upsertArtifact(taskId: string, kind: ArtifactKind, artifactPath: string): void {
    this.database.connection.prepare(`
      INSERT INTO task_artifacts(task_id, kind, path, updated_at) VALUES (?, ?, ?, ?)
      ON CONFLICT(task_id, kind) DO UPDATE SET path = excluded.path, updated_at = excluded.updated_at
    `).run(taskId, kind, artifactPath, now());
  }

  listArtifacts(taskId: string): ArtifactRecord[] {
    return (this.database.connection.prepare('SELECT * FROM task_artifacts WHERE task_id = ? ORDER BY kind').all(taskId) as SqlRow[]).map((row) => ({
      taskId: String(row.task_id), kind: row.kind as ArtifactKind, path: String(row.path), updatedAt: String(row.updated_at)
    }));
  }

  upsertService(service: DevelopmentServiceRecord): void {
    this.database.connection.prepare(`
      INSERT INTO development_services(task_id, service_key, command_json, cwd, pid, process_identity, port, health_check_url, status, started_at, stopped_at, last_error)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(task_id, service_key) DO UPDATE SET command_json=excluded.command_json, cwd=excluded.cwd, pid=excluded.pid,
        process_identity=excluded.process_identity, port=excluded.port, health_check_url=excluded.health_check_url, status=excluded.status, started_at=excluded.started_at,
        stopped_at=excluded.stopped_at, last_error=excluded.last_error
    `).run(service.taskId, service.serviceKey, JSON.stringify(service.command), service.cwd, service.pid, service.processIdentity, service.port,
      service.healthCheckUrl, service.status, service.startedAt, service.stoppedAt, service.lastError);
  }

  getService(taskId: string, serviceKey: string): DevelopmentServiceRecord | null {
    const row = this.database.connection.prepare('SELECT * FROM development_services WHERE task_id=? AND service_key=?').get(taskId, serviceKey) as SqlRow | undefined;
    return row ? this.mapService(row) : null;
  }

  listServices(taskId: string): DevelopmentServiceRecord[] {
    return (this.database.connection.prepare('SELECT * FROM development_services WHERE task_id=? ORDER BY service_key').all(taskId) as SqlRow[]).map((row) => this.mapService(row));
  }

  private mapService(row: SqlRow): DevelopmentServiceRecord {
    return {
      taskId: String(row.task_id), serviceKey: String(row.service_key), command: JSON.parse(String(row.command_json)) as string[], cwd: String(row.cwd),
      pid: row.pid == null ? null : Number(row.pid), processIdentity: row.process_identity == null ? null : String(row.process_identity), port: row.port == null ? null : Number(row.port),
      healthCheckUrl: row.health_check_url == null ? null : String(row.health_check_url), status: row.status as DevelopmentServiceRecord['status'],
      startedAt: row.started_at == null ? null : String(row.started_at), stoppedAt: row.stopped_at == null ? null : String(row.stopped_at),
      lastError: row.last_error == null ? null : String(row.last_error)
    };
  }
}
