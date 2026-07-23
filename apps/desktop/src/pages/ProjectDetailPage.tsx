import { ArrowLeft, FolderGit2, GitBranch, Wrench } from 'lucide-react';
import type { ProjectDetail } from '../types.js';

interface ProjectDetailPageProps {
  detail: ProjectDetail;
  onBack: () => void;
}

function command(value: string | string[]): string { return Array.isArray(value) ? value.join(' ') : value; }

export function ProjectDetailPage({ detail, onBack }: ProjectDetailPageProps) {
  const { project } = detail;
  const services = Object.entries(project.development.services);
  return <main className="page project-detail-page">
    <button className="back-button" onClick={onBack}><ArrowLeft size={16} />返回项目列表</button>
    <header className="detail-heading">
      <div><div className="detail-heading__meta"><span className={`status${project.mode === 'demo' ? ' status--demo' : ''}`}>{project.mode === 'demo' ? '演示项目' : '真实项目'}</span><span>{project.id}</span></div><h1>{project.name}</h1></div>
    </header>
    <div className="detail-layout">
      <div className="detail-main">
        <section><div className="section-heading"><div><h2>项目配置</h2><p>同步自 projects/*.yaml 的数据库快照。</p></div></div>
          <dl className="project-detail-list">
            <div><dt><FolderGit2 size={14} />仓库路径</dt><dd>{project.repositoryPath}</dd></div>
            <div><dt><GitBranch size={14} />默认分支</dt><dd>{project.defaultBranch}</dd></div>
            <div><dt><FolderGit2 size={14} />工作树目录</dt><dd>{project.worktreeRoot ?? '未配置'}</dd></div>
            <div><dt>Issue</dt><dd>{project.issue.provider}{project.issue.repository ? ` · ${project.issue.repository}` : ''}</dd></div>
          </dl>
        </section>
        <section><div className="section-heading"><div><h2>开发服务</h2><p>{services.length ? '按项目配置定义；启动服务需从任务详情操作。' : '此项目没有配置开发服务。'}</p></div></div>
          {services.length ? <div className="service-list">{services.map(([key, service]) => <div className="service-row project-service-row" key={key}>
            <div><strong><Wrench size={14} />{key}</strong><span className="service-state">{service.cwd}{service.port ? ` · ${service.port}` : ''}</span><small>{command(service.startCommand)}</small>{service.healthCheckUrl ? <small>{service.healthCheckUrl}</small> : null}</div>
          </div>)}</div> : null}
        </section>
      </div>
      <aside className="resource-panel"><h2>资源</h2><dl><div><dt>项目 ID</dt><dd>{project.id}</dd></div><div><dt>配置服务</dt><dd>{services.length} 项</dd></div><div><dt>模式</dt><dd>{project.mode === 'demo' ? '演示' : '真实'}</dd></div></dl></aside>
    </div>
  </main>;
}
