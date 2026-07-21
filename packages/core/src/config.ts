import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import YAML from 'yaml';
import { z } from 'zod';
import { parseCommandLine } from './command-runner.js';
import type { ProjectConfig } from './domain.js';
import { WorkManagerError } from './errors.js';

const serviceSchema = z.object({
  cwd: z.string().min(1).default('.'),
  startCommand: z.union([z.string().min(1), z.array(z.string().min(1)).min(1)]),
  healthCheckUrl: z.string().url().optional(),
  port: z.number().int().positive().max(65535).optional()
});

const projectSchema = z.object({
  id: z.string().regex(/^[a-z][a-z0-9-]*$/),
  name: z.string().min(1),
  taskPrefix: z.string().regex(/^[A-Z][A-Z0-9]*$/),
  repositoryPath: z.string().min(1),
  worktreeRoot: z.string().min(1).optional(),
  defaultBranch: z.string().min(1),
  issue: z.object({
    provider: z.enum(['github', 'gitlab', 'none']),
    repository: z.string().min(1).optional(),
    labels: z.object({
      feature: z.array(z.string()).optional(),
      bug: z.array(z.string()).optional(),
      chore: z.array(z.string()).optional()
    }).optional()
  }),
  development: z.object({ services: z.record(z.string().regex(/^[a-z][a-z0-9-]*$/), serviceSchema).default({}) }).default({ services: {} })
}).superRefine((value, context) => {
  if (value.issue.provider !== 'none' && !value.issue.repository) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['issue', 'repository'], message: '启用 Issue 提供方时必须设置 repository' });
  }
  if (!path.isAbsolute(value.repositoryPath)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['repositoryPath'], message: 'repositoryPath 必须是绝对路径' });
  }
  if (value.worktreeRoot && !path.isAbsolute(value.worktreeRoot)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['worktreeRoot'], message: 'worktreeRoot 必须是绝对路径' });
  }
  for (const [serviceKey, service] of Object.entries(value.development.services)) {
    try { parseCommandLine(service.startCommand); }
    catch (error) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['development', 'services', serviceKey, 'startCommand'], message: error instanceof Error ? error.message : String(error) });
    }
  }
});

export async function loadProjectConfig(filePath: string): Promise<ProjectConfig> {
  try {
    const raw = YAML.parse(await readFile(filePath, 'utf8')) as unknown;
    return projectSchema.parse(raw) as ProjectConfig;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new WorkManagerError('PROJECT_CONFIG_INVALID', `${filePath}: ${message}`, { recoverable: true });
  }
}

export async function loadProjectConfigs(directory: string): Promise<Map<string, ProjectConfig>> {
  const configs = new Map<string, ProjectConfig>();
  const prefixes = new Map<string, string>();
  let files: string[];
  try {
    files = await readdir(directory);
  } catch (error) {
    throw new WorkManagerError('PROJECTS_DIRECTORY_UNAVAILABLE', `无法读取项目配置目录：${directory}`, { recoverable: true });
  }
  for (const file of files.filter((name) => /\.ya?ml$/i.test(name)).sort()) {
    const config = await loadProjectConfig(path.join(directory, file));
    if (configs.has(config.id)) throw new WorkManagerError('PROJECT_ID_DUPLICATE', `项目 ID 重复：${config.id}`);
    const existingProject = prefixes.get(config.taskPrefix);
    if (existingProject) throw new WorkManagerError('TASK_PREFIX_DUPLICATE', `项目 ${existingProject} 与 ${config.id} 使用了相同任务前缀：${config.taskPrefix}`);
    configs.set(config.id, config);
    prefixes.set(config.taskPrefix, config.id);
  }
  return configs;
}
