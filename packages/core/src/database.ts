import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

export class WorkManagerDatabase {
  readonly connection: DatabaseSync;

  constructor(filePath: string) {
    mkdirSync(path.dirname(filePath), { recursive: true });
    this.connection = new DatabaseSync(filePath);
    this.connection.exec('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;');
    this.migrate();
  }

  private migrate(): void {
    this.connection.exec(`
      CREATE TABLE IF NOT EXISTS projects (
        id TEXT PRIMARY KEY,
        config_json TEXT NOT NULL,
        number_counter INTEGER NOT NULL DEFAULT 0,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS tasks (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL REFERENCES projects(id),
        sequence INTEGER NOT NULL,
        title TEXT NOT NULL,
        type TEXT NOT NULL,
        priority TEXT NOT NULL,
        status TEXT NOT NULL,
        requirement_summary TEXT,
        current_progress TEXT,
        next_action TEXT,
        blocked_reason TEXT,
        issue_provider TEXT NOT NULL,
        issue_number INTEGER,
        issue_url TEXT,
        pull_request_number INTEGER,
        pull_request_url TEXT,
        branch_name TEXT,
        worktree_path TEXT,
        create_issue_requested INTEGER NOT NULL DEFAULT 0,
        create_worktree_requested INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE(project_id, sequence)
      );
      CREATE INDEX IF NOT EXISTS tasks_active_idx ON tasks(status, updated_at DESC);
      CREATE TABLE IF NOT EXISTS task_artifacts (
        task_id TEXT NOT NULL REFERENCES tasks(id),
        kind TEXT NOT NULL,
        path TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY(task_id, kind)
      );
      CREATE TABLE IF NOT EXISTS task_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        task_id TEXT NOT NULL REFERENCES tasks(id),
        type TEXT NOT NULL,
        success INTEGER NOT NULL,
        message TEXT,
        metadata_json TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS events_task_idx ON task_events(task_id, id);
      CREATE TRIGGER IF NOT EXISTS task_events_no_update
      BEFORE UPDATE ON task_events
      BEGIN
        SELECT RAISE(ABORT, 'task_events are append-only');
      END;
      CREATE TRIGGER IF NOT EXISTS task_events_no_delete
      BEFORE DELETE ON task_events
      BEGIN
        SELECT RAISE(ABORT, 'task_events are append-only');
      END;
      CREATE TABLE IF NOT EXISTS development_services (
        task_id TEXT NOT NULL REFERENCES tasks(id),
        service_key TEXT NOT NULL,
        command_json TEXT NOT NULL,
        cwd TEXT NOT NULL,
        pid INTEGER,
        process_identity TEXT,
        port INTEGER,
        health_check_url TEXT,
        status TEXT NOT NULL,
        started_at TEXT,
        stopped_at TEXT,
        last_error TEXT,
        PRIMARY KEY(task_id, service_key)
      );
    `);
    const serviceColumns = this.connection.prepare('PRAGMA table_info(development_services)').all() as Array<{ name: string }>;
    if (!serviceColumns.some((column) => column.name === 'process_identity')) {
      this.connection.exec('ALTER TABLE development_services ADD COLUMN process_identity TEXT');
    }
    const taskColumns = this.connection.prepare('PRAGMA table_info(tasks)').all() as Array<{ name: string }>;
    if (!taskColumns.some((column) => column.name === 'archived_at')) this.connection.exec('ALTER TABLE tasks ADD COLUMN archived_at TEXT');
    if (!taskColumns.some((column) => column.name === 'archived_reason')) this.connection.exec('ALTER TABLE tasks ADD COLUMN archived_reason TEXT');
  }

  transaction<T>(operation: () => T): T {
    this.connection.exec('BEGIN IMMEDIATE');
    try {
      const result = operation();
      this.connection.exec('COMMIT');
      return result;
    } catch (error) {
      this.connection.exec('ROLLBACK');
      throw error;
    }
  }

  close(): void {
    this.connection.close();
  }
}
