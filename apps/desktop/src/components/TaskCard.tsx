import { ArrowRight, CircleAlert, GitBranch, Server } from 'lucide-react';
import type { TaskSummary } from '../types.js';

const statusLabels: Record<TaskSummary['status'], string> = {
  creating: '准备中', ready: '待开始', in_progress: '进行中', blocked: '已阻塞', paused: '已暂停', done: '已完成', cancelled: '已取消'
};
const priorityLabels: Record<TaskSummary['priority'], string> = { low: '低', medium: '中', high: '高', urgent: '紧急' };
const serviceLabels: Record<string, string> = { running: '运行中', starting: '启动中', stopped: '已停止', unhealthy: '不健康', failed: '失败' };

export function TaskCard({ task, onOpen }: { task: TaskSummary; onOpen: (id: string) => void }) {
  const updated = new Intl.DateTimeFormat('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(task.updatedAt));
  return (
    <article className="task-card">
      <div className="task-card__heading">
        <span className={`status status--${task.status}`}>{statusLabels[task.status]}</span>
        <span className={`priority priority--${task.priority}`}>{priorityLabels[task.priority]}优先级</span>
      </div>
      <button className="task-card__title" onClick={() => onOpen(task.id)}>{task.title}</button>
      <div className="next-action">
        <span>下一步</span>
        <strong>{task.nextAction || '明确下一步行动'}</strong>
      </div>
      {task.blockedReason && <p className="task-card__warning"><CircleAlert size={16} />{task.blockedReason}</p>}
      {task.services.length > 0 && (
        <div className="task-card__services" aria-label="开发服务">
          {task.services.map((service) => (
            <span key={service.serviceKey}><Server size={14} />{service.serviceKey} · {serviceLabels[service.status]}{service.port ? ` · ${service.port}` : ''}</span>
          ))}
        </div>
      )}
      <footer className="task-card__footer">
        <span><GitBranch size={14} />{task.projectId}</span>
        <span>更新于 {updated}</span>
        <button className="icon-button" aria-label={`查看 ${task.title}`} onClick={() => onOpen(task.id)}><ArrowRight size={17} /></button>
      </footer>
    </article>
  );
}
