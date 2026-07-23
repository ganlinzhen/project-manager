import { FolderKanban, RefreshCw, Wrench } from 'lucide-react';
import type { ProjectSummary } from '../types.js';

interface ProjectListPageProps {
  projects: ProjectSummary[];
  loading: boolean;
  syncing: boolean;
  onSync: () => Promise<void>;
  onOpenProject: (id: string) => void;
}

export function ProjectListPage({ projects, loading, syncing, onSync, onOpenProject }: ProjectListPageProps) {
  return <main className="page project-page">
    <header className="page-heading">
      <div>
        <p className="page-heading__context">本地项目</p>
        <h1>项目</h1>
        <p>查看已同步到本地数据库的项目配置。</p>
      </div>
      <div className="active-count"><strong>{projects.length}</strong><span>个项目</span></div>
    </header>
    <div className="filters project-toolbar">
      <span>配置源：projects/*.yaml</span>
      <button className="button button--secondary" onClick={() => void onSync()} disabled={syncing}>
        <RefreshCw size={15} className={syncing ? 'is-spinning' : undefined} />{syncing ? '正在同步' : '同步 projects'}
      </button>
    </div>
    {loading ? <div className="board-skeleton" aria-label="正在加载项目"><span /><span /><span /></div>
      : projects.length ? <div className="project-grid">{projects.map((project) => <article className="project-card" key={project.id}>
        <div className="project-card__heading"><span className={`status${project.mode === 'demo' ? ' status--demo' : ''}`}>{project.mode === 'demo' ? '演示项目' : '真实项目'}</span><span>{project.id}</span></div>
        <button className="project-card__title" onClick={() => onOpenProject(project.id)}>{project.name}</button>
        <dl>
          <div><dt>默认分支</dt><dd>{project.defaultBranch}</dd></div>
          <div><dt>Issue</dt><dd>{project.issue.provider}</dd></div>
        </dl>
        <footer><span><FolderKanban size={14} />{project.repositoryPath}</span><span><Wrench size={14} />{project.serviceCount} 项服务</span></footer>
      </article>)}</div>
        : <section className="empty-state"><h2>尚未同步项目</h2><p>点击“同步 projects”读取当前 Codex 项目目录中的配置并写入本地数据库。</p></section>}
  </main>;
}
