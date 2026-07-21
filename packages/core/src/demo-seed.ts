import type { ProjectConfig, TaskPriority, TaskStatus, TaskType } from './domain.js';
import { TaskService } from './task-service.js';

interface DemoTask {
  title: string;
  type: TaskType;
  priority: TaskPriority;
  requirementSummary: string;
  current: string;
  next: string;
  status: Extract<TaskStatus, 'ready' | 'in_progress' | 'blocked' | 'done'>;
  blockedReason?: string;
}

const demoTasks: DemoTask[] = [
  {
    title: '梳理工作管理仓库规范', type: 'chore', priority: 'high',
    requirementSummary: '演示数据：确认项目配置、规则文档与任务工件的目录边界。',
    current: '目录规范已形成初稿', next: '补充第一个真实项目的接入说明', status: 'ready'
  },
  {
    title: '实现 Demo 展示项目', type: 'feature', priority: 'high',
    requirementSummary: '演示数据：让桌面看板能展示无需真实代码仓库的项目与任务。',
    current: '正在接入本地示例任务', next: '检查任务详情中的工件展示', status: 'in_progress'
  },
  {
    title: '等待部署方式确认', type: 'chore', priority: 'medium',
    requirementSummary: '演示数据：记录在外部依赖未确认时如何保留上下文和下一步。',
    current: '等待确认目标环境', next: '收到部署方式后补充项目规则', status: 'blocked',
    blockedReason: '演示：尚未确认真实部署环境'
  },
  {
    title: '完成模板体验走查', type: 'chore', priority: 'low',
    requirementSummary: '演示数据：确认模板可被复制，并包含项目规则与任务产物目录。',
    current: '目录、规则和示例任务已检查', next: '如需扩展可新增真实项目配置', status: 'done'
  }
];

export async function seedDemoProject(project: ProjectConfig, tasks: TaskService): Promise<void> {
  if (project.mode !== 'demo' || tasks.repository.listTasks({ projectId: project.id }).length > 0) return;

  for (const item of demoTasks) {
    const created = await tasks.createTask({
      projectId: project.id,
      title: item.title,
      type: item.type,
      priority: item.priority,
      requirementSummary: item.requirementSummary
    });
    await tasks.updateProgress(created.task.id, { current: item.current, next: item.next });
    if (item.status === 'in_progress') tasks.resumeTask(created.task.id);
    if (item.status === 'blocked') {
      tasks.resumeTask(created.task.id);
      tasks.repository.updateTask(created.task.id, { blockedReason: item.blockedReason ?? null });
      tasks.changeStatus(created.task.id, 'blocked', '演示任务等待外部确认');
    }
    if (item.status === 'done') tasks.completeTask(created.task.id);
  }
}
