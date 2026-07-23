import { SlidersHorizontal } from 'lucide-react';
import { useMemo, useState } from 'react';
import { SearchToolbar } from '../components/SearchToolbar.js';
import { TaskCard } from '../components/TaskCard.js';
import { Button } from '../components/ui/Button.js';
import type { TaskPriority, TaskStatus, TaskSummary } from '../types.js';

const columns: Array<{ status: TaskStatus; title: string; note: string }> = [
  { status: 'in_progress', title: '进行中', note: '正在推进' },
  { status: 'blocked', title: '已阻塞', note: '需要处理' },
  { status: 'ready', title: '待开始', note: '可以领取' },
  { status: 'paused', title: '已暂停', note: '稍后恢复' }
];

export function BoardPage({ tasks, loading, onOpenTask, showArchived = false, onShowArchived }: { tasks: TaskSummary[]; loading: boolean; onOpenTask: (id: string) => void; showArchived?: boolean; onShowArchived?: (value: boolean) => void }) {
  const [query, setQuery] = useState('');
  const [project, setProject] = useState('all');
  const [status, setStatus] = useState<TaskStatus | 'active' | 'archived'>(showArchived ? 'archived' : 'active');
  const [priority, setPriority] = useState<TaskPriority | 'all'>('all');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const projects = [...new Set(tasks.map((task) => task.projectId))].sort();
  const filtered = useMemo(() => tasks.filter((task) => {
    const statusMatch = status === 'active' ? ['in_progress', 'blocked', 'ready', 'paused'].includes(task.status) : status === 'archived' ? true : task.status === status;
    return statusMatch && (project === 'all' || task.projectId === project) && (priority === 'all' || task.priority === priority)
      && (!query || `${task.id} ${task.title} ${task.nextAction ?? ''}`.toLowerCase().includes(query.toLowerCase()));
  }), [priority, project, query, status, tasks]);

  return (
    <main className="mx-auto max-w-[1480px] px-8 py-11 max-sm:px-4 max-sm:py-7">
      <SearchToolbar label="搜索任务" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索标题、编号或下一步" actions={
        <div className="relative">
          <Button variant="outline" aria-expanded={filtersOpen} aria-haspopup="dialog" onClick={() => setFiltersOpen((open) => !open)}><SlidersHorizontal size={16} />筛选</Button>
          {filtersOpen && <div className="absolute right-0 top-[calc(100%+8px)] z-10 grid w-[min(460px,calc(100vw-48px))] grid-cols-3 gap-3 rounded-xl border bg-popover p-3 shadow-lg max-sm:left-0 max-sm:right-auto max-sm:grid-cols-1" role="dialog" aria-label="任务筛选条件">
            <label className="flex flex-col gap-1.5 text-[11px] font-semibold text-muted-foreground"><span>项目</span><select className="h-9 rounded-md border bg-background px-2 text-sm text-foreground outline-none" aria-label="按项目筛选" value={project} onChange={(event) => setProject(event.target.value)}><option value="all">全部项目</option>{projects.map((item) => <option key={item}>{item}</option>)}</select></label>
            <label className="flex flex-col gap-1.5 text-[11px] font-semibold text-muted-foreground"><span>状态</span><select className="h-9 rounded-md border bg-background px-2 text-sm text-foreground outline-none" aria-label="按状态筛选" value={status} onChange={(event) => { const value = event.target.value as TaskStatus | 'active' | 'archived'; setStatus(value); onShowArchived?.(value === 'archived'); }}><option value="active">活跃状态</option><option value="in_progress">进行中</option><option value="blocked">已阻塞</option><option value="ready">待开始</option><option value="paused">已暂停</option><option value="done">已完成</option><option value="cancelled">已取消</option><option value="archived">已归档</option></select></label>
            <label className="flex flex-col gap-1.5 text-[11px] font-semibold text-muted-foreground"><span>优先级</span><select className="h-9 rounded-md border bg-background px-2 text-sm text-foreground outline-none" aria-label="按优先级筛选" value={priority} onChange={(event) => setPriority(event.target.value as TaskPriority | 'all')}><option value="all">全部优先级</option><option value="urgent">紧急</option><option value="high">高</option><option value="medium">中</option><option value="low">低</option></select></label>
          </div>}
        </div>
      } />
      {loading ? <div className="grid grid-cols-3 gap-4" aria-label="正在加载任务">{[1, 2, 3].map((item) => <span className="h-52 animate-pulse rounded-xl bg-muted" key={item} />)}</div> : filtered.length === 0 ? (
        <section className="rounded-xl border border-dashed bg-card px-6 py-16 text-center"><h2 className="text-base font-semibold">当前筛选下没有任务</h2><p className="mt-2 text-sm text-muted-foreground">调整筛选条件，或在 Codex / CLI 中运行 <code>wm task create</code> 创建任务。</p></section>
      ) : status === 'active' ? (
        <div className="grid grid-cols-4 gap-4 max-xl:grid-cols-2 max-sm:grid-cols-1">{columns.map((column) => { const items = filtered.filter((task) => task.status === column.status); return <section className="rounded-xl bg-muted/70 p-3" key={column.status}><header className="mb-3 flex items-start justify-between"><div><h2 className="text-sm font-semibold">{column.title}</h2><p className="mt-0.5 text-xs text-muted-foreground">{column.note}</p></div><span className="grid size-6 place-items-center rounded-full bg-background text-xs text-muted-foreground">{items.length}</span></header><div className="space-y-3">{items.map((task) => <TaskCard key={task.id} task={task} onOpen={onOpenTask} />)}{items.length === 0 && <p className="py-12 text-center text-xs text-muted-foreground">暂无任务</p>}</div></section>; })}</div>
      ) : <div className="grid grid-cols-[repeat(auto-fit,minmax(280px,1fr))] gap-4">{filtered.map((task) => <TaskCard key={task.id} task={task} onOpen={onOpenTask} />)}</div>}
    </main>
  );
}
