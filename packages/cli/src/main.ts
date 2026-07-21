#!/usr/bin/env node
import { access } from 'node:fs/promises';
import { realpathSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ArtifactService, DoctorService, EnvironmentService, IssueService, SystemCommandRunner, SystemProcessController,
  TaskRepository, TaskService, WorkManagerDatabase, WorkspaceService, defaultDatabasePath, loadProjectConfigs,
  assertRealPathWithinRoots, parseCommandLine, toWorkManagerError,
  type ProjectConfig, type TaskPriority, type TaskStatus, type TaskType, type WorkManagerError
} from '@work-manager/core';

export interface CliRuntimeOptions { managerRoot?: string; projectsDir?: string; databasePath?: string; }
export type CliResponse = { ok: true; data: unknown } | {
  ok: false;
  error: { code: string; message: string; recoverable: boolean; suggestedCommand?: string; details?: Record<string, unknown> };
};

interface Runtime {
  database: WorkManagerDatabase;
  projects: Map<string, ProjectConfig>;
  repository: TaskRepository;
  artifacts: ArtifactService;
  tasks: TaskService;
  issues: IssueService;
  workspace: WorkspaceService;
  environment: EnvironmentService;
  doctor: DoctorService;
}

function value(args: string[], name: string, required = false): string | undefined {
  const index = args.indexOf(name);
  const found = index >= 0 ? args[index + 1] : undefined;
  if (required && (!found || found.startsWith('--'))) throw Object.assign(new Error(`缺少参数 ${name}`), { code: 'CLI_ARGUMENT_REQUIRED' });
  return found;
}

function flag(args: string[], name: string): boolean { return args.includes(name); }

export async function findManagerRoot(start: string): Promise<string> {
  let current = path.resolve(start);
  while (true) {
    try {
      await access(path.join(current, 'pnpm-workspace.yaml'));
      await access(path.join(current, 'projects'));
      return current;
    } catch {
      const parent = path.dirname(current);
      if (parent === current) return path.resolve(start);
      current = parent;
    }
  }
}

async function createRuntime(options: CliRuntimeOptions): Promise<Runtime> {
  const configuredRoot = options.managerRoot ?? process.env.WM_MANAGER_ROOT;
  const managerRoot = configuredRoot ? path.resolve(configuredRoot) : await findManagerRoot(process.cwd());
  const projectsDir = path.resolve(options.projectsDir ?? process.env.WM_PROJECTS_DIR ?? path.join(managerRoot, 'projects'));
  const databasePath = path.resolve(options.databasePath ?? process.env.WM_DATABASE_PATH ?? defaultDatabasePath());
  const projects = await loadProjectConfigs(projectsDir);
  const database = new WorkManagerDatabase(databasePath);
  const repository = new TaskRepository(database);
  for (const project of projects.values()) repository.registerProject(project);
  const resolveProject = (projectId: string) => projects.get(projectId) ?? repository.getProject(projectId) ?? undefined;
  const runner = new SystemCommandRunner();
  const processes = new SystemProcessController();
  const artifacts = new ArtifactService(managerRoot, repository);
  const issues = new IssueService(repository, resolveProject, runner);
  const workspace = new WorkspaceService(repository, resolveProject, runner);
  const tasks = new TaskService(repository, artifacts, resolveProject, { issues, workspace });
  const environment = new EnvironmentService(repository, resolveProject, processes);
  const doctor = new DoctorService(repository, resolveProject, processes, { issues, workspace });
  return { database, projects, repository, artifacts, tasks, issues, workspace, environment, doctor };
}

async function dispatch(args: string[], runtime: Runtime): Promise<unknown> {
  const [scope, action, id] = args;
  if (!scope || flag(args, '--help') || scope === 'help') return help();
  if (scope === 'project' && action === 'validate') {
    if (!id) throw Object.assign(new Error('缺少项目 ID'), { code: 'CLI_ARGUMENT_REQUIRED' });
    const project = runtime.projects.get(id);
    if (!project) throw Object.assign(new Error(`项目不存在：${id}`), { code: 'PROJECT_NOT_FOUND' });
    await access(project.repositoryPath);
    await new SystemCommandRunner().run(['git', 'rev-parse', '--is-inside-work-tree'], { cwd: project.repositoryPath });
    await new SystemCommandRunner().run(['git', 'rev-parse', '--verify', project.defaultBranch], { cwd: project.repositoryPath });
    const services = [];
    for (const [serviceKey, service] of Object.entries(project.development.services)) {
      const cwd = await assertRealPathWithinRoots(path.resolve(project.repositoryPath, service.cwd), [project.repositoryPath]);
      const argv = parseCommandLine(service.startCommand);
      if (path.isAbsolute(argv[0]!)) await access(argv[0]!);
      else await new SystemCommandRunner().run(['/usr/bin/env', 'which', argv[0]!], { cwd });
      services.push({ serviceKey, cwd, executable: argv[0] });
    }
    const issue = await runtime.issues.validateProject(id);
    return { project, issue, services, valid: true };
  }
  if (scope === 'task') {
    if (action === 'create') {
      const projectId = value(args, '--project', true)!;
      const title = value(args, '--title', true)!;
      const type = (value(args, '--type') ?? 'feature') as TaskType;
      const priority = (value(args, '--priority') ?? 'medium') as TaskPriority;
      if (!['feature', 'bug', 'chore'].includes(type)) throw Object.assign(new Error(`无效任务类型：${type}`), { code: 'TASK_TYPE_INVALID' });
      if (!['low', 'medium', 'high', 'urgent'].includes(priority)) throw Object.assign(new Error(`无效优先级：${priority}`), { code: 'TASK_PRIORITY_INVALID' });
      return runtime.tasks.createTask({
        projectId, title, type, priority, requirementSummary: value(args, '--requirement'),
        createIssue: flag(args, '--create-issue'), createWorktree: flag(args, '--create-worktree')
      });
    }
    if (action === 'list') {
      const requestedStatus = value(args, '--status') as TaskStatus | undefined;
      let tasks = runtime.repository.listTasks({ projectId: value(args, '--project'), status: requestedStatus, query: value(args, '--search') });
      if (!requestedStatus && !flag(args, '--all')) tasks = tasks.filter((task) => ['ready', 'in_progress', 'blocked', 'paused'].includes(task.status));
      const priority = value(args, '--priority');
      if (priority) tasks = tasks.filter((task) => task.priority === priority);
      return { tasks: tasks.map((task) => ({ ...task, services: runtime.tasks.listServices(task.id) })) };
    }
    if (!id) throw Object.assign(new Error('缺少任务 ID'), { code: 'CLI_ARGUMENT_REQUIRED' });
    if (action === 'show') {
      const detail = runtime.tasks.getTaskDetail(id);
      const artifacts = Object.fromEntries(await Promise.all(detail.artifacts.map(async (artifact) => [artifact.kind, await runtime.artifacts.read(id, artifact.kind)])));
      return {
        ...detail,
        configuration: {
          valid: true,
          issueProvider: detail.project.issue.provider,
          configuredServices: Object.keys(detail.project.development.services).length
        },
        artifacts,
        artifactFiles: detail.artifacts
      };
    }
    if (action === 'progress') {
      const task = await runtime.tasks.updateProgress(id, { current: value(args, '--current', true)!, next: value(args, '--next', true)! });
      return { task };
    }
    if (action === 'retry') return runtime.tasks.retryTask(id);
    if (action === 'pause') return { task: runtime.tasks.pauseTask(id) };
    if (action === 'resume') return { task: runtime.tasks.resumeTask(id) };
    if (action === 'complete') return { task: runtime.tasks.completeTask(id) };
    if (action === 'reopen') return { task: runtime.tasks.reopenTask(id) };
    if (action === 'attach-issue') return { task: runtime.issues.attach(id, value(args, '--url', true)!) };
    if (action === 'doctor') return runtime.doctor.check(id);
  }
  if (scope === 'env') {
    if (!id) throw Object.assign(new Error('缺少任务 ID'), { code: 'CLI_ARGUMENT_REQUIRED' });
    if (action === 'start') return { service: await runtime.environment.start(id, value(args, '--service', true)!) };
    if (action === 'stop') return { service: await runtime.environment.stop(id, value(args, '--service', true)!) };
    if (action === 'status') return { services: await runtime.environment.status(id) };
  }
  throw Object.assign(new Error(`未知命令：${args.slice(0, 3).join(' ')}`), { code: 'CLI_COMMAND_UNKNOWN' });
}

function help(): { usage: string; commands: string[] } {
  return {
    usage: 'wm <scope> <command> [options] --json',
    commands: [
      'project validate <project>', 'task create|list|show|progress|retry|pause|resume|complete|reopen|attach-issue|doctor',
      'env start|stop|status'
    ]
  };
}

function failureResponse(error: unknown): CliResponse {
  const candidate = error as Partial<WorkManagerError> & { code?: string; message?: string };
  const converted = candidate.code && candidate.message ? candidate : toWorkManagerError(error);
  const code = converted.code ?? 'UNEXPECTED_ERROR';
  return {
    ok: false,
    error: {
      code,
      message: (converted.message ?? String(error)).replace(new RegExp(`^${code}:\\s*`), ''),
      recoverable: converted.recoverable ?? false,
      ...(converted.suggestedCommand ? { suggestedCommand: converted.suggestedCommand } : {}),
      ...(converted.details ? { details: converted.details } : {})
    }
  };
}

export async function executeCli(args: string[], options: CliRuntimeOptions = {}, emit: (response: CliResponse) => void = () => {}): Promise<CliResponse> {
  let runtime: Runtime | undefined;
  try {
    runtime = await createRuntime(options);
    const response: CliResponse = { ok: true, data: await dispatch(args, runtime) };
    emit(response);
    return response;
  } catch (error) {
    const response = failureResponse(error);
    emit(response);
    return response;
  } finally {
    runtime?.database.close();
  }
}

function renderHuman(response: CliResponse): string {
  if (!response.ok) return `错误 [${response.error.code}] ${response.error.message}${response.error.suggestedCommand ? `\n建议：${response.error.suggestedCommand}` : ''}`;
  const data = response.data as Record<string, unknown> | null;
  const task = data && 'task' in data ? data.task as { id?: string; title?: string; status?: string; nextAction?: string } : undefined;
  if (task?.id) return `${task.id} ${task.title ?? ''}\n状态：${task.status ?? '未知'}${task.nextAction ? `\n下一步：${task.nextAction}` : ''}`;
  return JSON.stringify(response.data, null, 2);
}

const currentFile = fileURLToPath(import.meta.url);
function sameFile(left: string, right: string): boolean {
  try { return realpathSync(left) === realpathSync(right); }
  catch { return path.resolve(left) === path.resolve(right); }
}
if (process.argv[1] && sameFile(process.argv[1], currentFile)) {
  const args = process.argv.slice(2);
  const response = await executeCli(args);
  process.stdout.write(`${flag(args, '--json') ? JSON.stringify(response) : renderHuman(response)}\n`);
  if (!response.ok) process.exitCode = 1;
}
