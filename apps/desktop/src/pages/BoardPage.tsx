import { Search, SlidersHorizontal } from 'lucide-react';
import { useMemo, useState } from 'react';
import { TaskCard } from '../components/TaskCard.js';
import type { TaskPriority, TaskStatus, TaskSummary } from '../types.js';

const columns: Array<{ status: TaskStatus; title: string; note: string }> = [
  { status: 'in_progress', title: '进行中', note: '正在推进' },
  { status: 'blocked', title: '已阻塞', note: '需要处理' },
  { status: 'ready', title: '待开始', note: '可以领取' },
  { status: 'paused', title: '已暂停', note: '稍后恢复' }
];

export function BoardPage({ tasks, loading, onOpenTask }: { tasks: TaskSummary[]; loading: boolean; onOpenTask: (id: string) => void }) {
  const [query, setQuery] = useState('');
  const [project, setProject] = useState('all');
  const [status, setStatus] = useState<TaskStatus | 'active'>('active');
  const [priority, setPriority] = useState<TaskPriority | 'all'>('all');
  const projects = [...new Set(tasks.map((task) => task.projectId))].sort();
  const filtered = useMemo(() => tasks.filter((task) => {
    const statusMatch = status === 'active' ? ['in_progress', 'blocked', 'ready', 'paused'].includes(task.status) : task.status === status;
    return statusMatch && (project === 'all' || task.projectId === project) && (priority === 'all' || task.priority === priority)
      && (!query || `${task.id} ${task.title} ${task.nextAction ?? ''}`.toLowerCase().includes(query.toLowerCase()));
  }), [priority, project, query, status, tasks]);

  return (
    <main className="page board-page">
      <header className="page-heading">
        <div><p className="page-heading__context">今天的工作台</p><h1>任务看板</h1><p>先看下一步，再决定切换到哪里。</p></div>
        <div className="active-count"><strong>{filtered.length}</strong><span>项可见任务</span></div>
      </header>
      <section className="filters" aria-label="任务筛选">
        <label className="search-field"><Search size={17} /><span className="sr-only">搜索任务</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索标题、编号或下一步" /></label>
        <SlidersHorizontal size={17} aria-hidden="true" />
        <label><span className="sr-only">按项目筛选</span><select aria-label="按项目筛选" value={project} onChange={(event) => setProject(event.target.value)}><option value="all">全部项目</option>{projects.map((item) => <option key={item}>{item}</option>)}</select></label>
        <label><span className="sr-only">按状态筛选</span><select aria-label="按状态筛选" value={status} onChange={(event) => setStatus(event.target.value as TaskStatus | 'active')}><option value="active">活跃状态</option><option value="in_progress">进行中</option><option value="blocked">已阻塞</option><option value="ready">待开始</option><option value="paused">已暂停</option><option value="done">已完成</option><option value="cancelled">已取消</option></select></label>
        <label><span className="sr-only">按优先级筛选</span><select aria-label="按优先级筛选" value={priority} onChange={(event) => setPriority(event.target.value as TaskPriority | 'all')}><option value="all">全部优先级</option><option value="urgent">紧急</option><option value="high">高</option><option value="medium">中</option><option value="low">低</option></select></label>
      </section>
      {loading ? <div className="board-skeleton" aria-label="正在加载任务">{[1, 2, 3].map((item) => <span key={item} />)}</div> : filtered.length === 0 ? (
        <section className="empty-state"><h2>当前筛选下没有任务</h2><p>调整筛选条件，或在 Codex / CLI 中运行 <code>wm task create</code> 创建任务。</p></section>
      ) : status === 'active' ? (
        <div className="board-columns">{columns.map((column) => { const items = filtered.filter((task) => task.status === column.status); return <section className="board-column" key={column.status}><header><div><h2>{column.title}</h2><p>{column.note}</p></div><span>{items.length}</span></header><div className="task-list">{items.map((task) => <TaskCard key={task.id} task={task} onOpen={onOpenTask} />)}{items.length === 0 && <p className="column-empty">暂无任务</p>}</div></section>; })}</div>
      ) : <div className="filtered-list">{filtered.map((task) => <TaskCard key={task.id} task={task} onOpen={onOpenTask} />)}</div>}
    </main>
  );
}
