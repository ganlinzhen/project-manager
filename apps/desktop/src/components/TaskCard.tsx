import { ArrowRight, CircleAlert, GitBranch, Server } from 'lucide-react';
import type { TaskSummary } from '../types.js';
import { Badge } from './ui/Badge.js';
import { Button } from './ui/Button.js';

const statusLabels: Record<TaskSummary['status'], string> = {
  creating: '准备中', ready: '待开始', in_progress: '进行中', blocked: '已阻塞', paused: '已暂停', done: '已完成', cancelled: '已取消'
};
const priorityLabels: Record<TaskSummary['priority'], string> = { low: '低', medium: '中', high: '高', urgent: '紧急' };
const serviceLabels: Record<string, string> = { running: '运行中', starting: '启动中', stopped: '已停止', unhealthy: '不健康', failed: '失败' };

export function TaskCard({ task, onOpen }: { task: TaskSummary; onOpen: (id: string) => void }) {
  const updated = new Intl.DateTimeFormat('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(task.updatedAt));
  return (
    <article className="rounded-xl border bg-card p-3 shadow-xs transition-shadow hover:shadow-md">
      <div className="flex items-center justify-between gap-2">
        <Badge className={task.status === 'blocked' ? 'border-red-200 bg-red-50 text-red-700' : task.status === 'in_progress' ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-slate-200 bg-slate-50 text-slate-600'}>{statusLabels[task.status]}</Badge>
        <Badge className={task.priority === 'urgent' || task.priority === 'high' ? 'border-orange-200 bg-orange-50 text-orange-700' : 'border-slate-200 bg-slate-50 text-slate-600'}>{priorityLabels[task.priority]}优先级</Badge>
      </div>
      <button className="mt-3 w-full text-left text-sm font-semibold text-foreground hover:text-primary" onClick={() => onOpen(task.id)}>{task.title}</button>
      <div className="mt-3 rounded-lg bg-muted px-3 py-2">
        <span className="block text-[11px] font-medium text-muted-foreground">下一步</span>
        <strong className="mt-0.5 block text-xs leading-5">{task.nextAction || '明确下一步行动'}</strong>
      </div>
      {task.blockedReason && <p className="mt-3 flex items-center gap-1.5 text-xs text-destructive"><CircleAlert size={16} />{task.blockedReason}</p>}
      {task.services.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5" aria-label="开发服务">
          {task.services.map((service) => (
            <span className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-1 text-[11px] text-muted-foreground" key={service.serviceKey}><Server size={13} />{service.serviceKey} · {serviceLabels[service.status]}{service.port ? ` · ${service.port}` : ''}</span>
          ))}
        </div>
      )}
      <footer className="mt-3 flex items-center gap-2 border-t pt-3 text-[11px] text-muted-foreground">
        <span className="inline-flex min-w-0 items-center gap-1 truncate"><GitBranch size={14} />{task.projectId}</span>
        <span className="ml-auto whitespace-nowrap">更新于 {updated}</span>
        <Button size="icon" variant="ghost" className="size-7" aria-label={`查看 ${task.title}`} onClick={() => onOpen(task.id)}><ArrowRight size={16} /></Button>
      </footer>
    </article>
  );
}
