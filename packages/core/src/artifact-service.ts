import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { ArtifactKind, TaskRecord } from './domain.js';
import { assertRealPathWithinRoots, assertWithinRoots } from './paths.js';
import { TaskRepository } from './task-repository.js';

const fileNames: Record<ArtifactKind, string> = {
  requirements: 'requirements.md', context: 'context.md', plan: 'plan.md', progress: 'progress.md', completion: 'completion.md'
};

export class ArtifactService {
  readonly artifactsRoot: string;
  constructor(private readonly managerRoot: string, private readonly repository: TaskRepository) {
    this.artifactsRoot = path.join(managerRoot, 'data', 'artifacts');
  }

  async createBaseArtifacts(task: TaskRecord): Promise<void> {
    const directory = assertWithinRoots(path.join(this.artifactsRoot, task.id), [this.artifactsRoot]);
    await mkdir(directory, { recursive: true });
    await assertRealPathWithinRoots(directory, [this.artifactsRoot]);
    const templates: Record<ArtifactKind, string> = {
      requirements: `# ${task.id} ${task.title}\n\n## 需求摘要\n\n${task.requirementSummary ?? '待补充'}\n`,
      context: `# 上下文\n\n- 任务：${task.id}\n- 项目：${task.projectId}\n- 优先级：${task.priority}\n\n任务状态以 SQLite 和 wm 查询结果为准。\n`,
      plan: '# 实施计划\n\n待补充。\n',
      progress: this.progressContent(task.currentProgress, task.nextAction),
      completion: '# 完成总结\n\n任务完成后补充。\n'
    };
    for (const kind of Object.keys(fileNames) as ArtifactKind[]) {
      const artifactPath = path.join(directory, fileNames[kind]);
      try { await readFile(artifactPath); } catch { await this.atomicWrite(artifactPath, templates[kind]); }
      this.repository.upsertArtifact(task.id, kind, artifactPath);
    }
    this.repository.appendEvent(task.id, 'artifacts_created', true, '基础 Markdown 产物已就绪');
  }

  async updateProgress(taskId: string, current: string, next: string): Promise<string> {
    const artifactPath = assertWithinRoots(path.join(this.artifactsRoot, taskId, fileNames.progress), [this.artifactsRoot]);
    await assertRealPathWithinRoots(path.dirname(artifactPath), [this.artifactsRoot]);
    await this.atomicWrite(artifactPath, this.progressContent(current, next));
    this.repository.upsertArtifact(taskId, 'progress', artifactPath);
    return artifactPath;
  }

  async read(taskId: string, kind: ArtifactKind): Promise<string> {
    const artifact = this.repository.listArtifacts(taskId).find((item) => item.kind === kind);
    if (!artifact) return '';
    const artifactPath = assertWithinRoots(artifact.path, [this.artifactsRoot]);
    await assertRealPathWithinRoots(artifactPath, [this.artifactsRoot]);
    return readFile(artifactPath, 'utf8');
  }

  private progressContent(current: string | null | undefined, next: string | null | undefined): string {
    return `# 进展\n\n## 当前进展\n\n${current || '尚未开始'}\n\n## 下一步行动\n\n${next || '明确下一步行动'}\n`;
  }

  private async atomicWrite(filePath: string, content: string): Promise<void> {
    await mkdir(path.dirname(filePath), { recursive: true });
    const temporary = `${filePath}.${process.pid}.${Date.now()}.tmp`;
    await writeFile(temporary, content, 'utf8');
    await rename(temporary, filePath);
  }
}
