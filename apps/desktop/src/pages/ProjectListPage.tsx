import { FolderKanban, RefreshCw, Wrench } from 'lucide-react';
import { useMemo, useState } from 'react';
import { SearchToolbar } from '../components/SearchToolbar.js';
import { Button } from '../components/ui/Button.js';
import { Badge } from '../components/ui/Badge.js';
import type { ProjectSummary } from '../types.js';

interface ProjectListPageProps {
  projects: ProjectSummary[];
  loading: boolean;
  syncing: boolean;
  onSync: () => Promise<void>;
  onOpenProject: (id: string) => void;
}

export function ProjectListPage({ projects, loading, syncing, onSync, onOpenProject }: ProjectListPageProps) {
  const [query, setQuery] = useState('');
  const filteredProjects = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    if (!normalizedQuery) return projects;
    return projects.filter((project) => `${project.name} ${project.id} ${project.defaultBranch}`.toLocaleLowerCase().includes(normalizedQuery));
  }, [projects, query]);

  return <main className="mx-auto max-w-[1480px] px-8 py-11 max-sm:px-4 max-sm:py-7">
    <SearchToolbar label="搜索项目" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索项目名称、编号或分支" actions={
      <Button variant="outline" onClick={() => void onSync()} disabled={syncing}>
        <RefreshCw size={15} className={syncing ? 'animate-spin' : undefined} />{syncing ? '正在同步' : '同步 projects'}
      </Button>
    } />
    {loading ? <div className="grid grid-cols-3 gap-4" aria-label="正在加载项目"><span className="h-60 animate-pulse rounded-xl bg-muted" /><span className="h-60 animate-pulse rounded-xl bg-muted" /><span className="h-60 animate-pulse rounded-xl bg-muted" /></div>
      : filteredProjects.length ? <div className="grid grid-cols-[repeat(auto-fit,minmax(270px,1fr))] gap-4">{filteredProjects.map((project) => <article className="flex min-h-60 flex-col rounded-xl border bg-card p-4 shadow-xs transition-shadow hover:shadow-md" key={project.id}>
        <div className="flex items-center gap-2 text-xs text-muted-foreground"><Badge className={project.mode === 'demo' ? 'border-amber-200 bg-amber-50 text-amber-700' : 'border-emerald-200 bg-emerald-50 text-emerald-700'}>{project.mode === 'demo' ? '演示项目' : '真实项目'}</Badge><span>{project.id}</span></div>
        <button className="mt-4 text-left text-lg font-semibold tracking-tight hover:text-primary" onClick={() => onOpenProject(project.id)}>{project.name}</button>
        <dl className="mt-6 grid grid-cols-2 gap-3 text-sm">
          <div><dt className="text-xs text-muted-foreground">默认分支</dt><dd className="mt-1 font-medium">{project.defaultBranch}</dd></div>
          <div><dt className="text-xs text-muted-foreground">Issue</dt><dd className="mt-1 font-medium">{project.issue.provider}</dd></div>
        </dl>
        <footer className="mt-auto space-y-2 border-t pt-3 text-xs text-muted-foreground"><span className="flex items-center gap-1.5 truncate"><FolderKanban size={14} />{project.repositoryPath}</span><span className="flex items-center gap-1.5"><Wrench size={14} />{project.serviceCount} 项服务</span></footer>
      </article>)}</div>
        : <section className="rounded-xl border border-dashed bg-card px-6 py-16 text-center"><h2 className="text-base font-semibold">{projects.length ? '没有匹配的项目' : '尚未同步项目'}</h2><p className="mt-2 text-sm text-muted-foreground">{projects.length ? '换个关键词，或清空搜索条件后查看全部项目。' : '点击“同步 projects”读取当前 Codex 项目目录中的配置并写入本地数据库。'}</p></section>}
  </main>;
}
