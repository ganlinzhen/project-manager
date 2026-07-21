import { ArrowLeft, CheckCircle2, Clipboard, ExternalLink, FolderOpen, GitBranch, Pause, Play, RotateCcw, Server, Square } from 'lucide-react';
import { OperationFeedback } from '../components/OperationFeedback.js';
import type { Feedback, TaskAction, TaskDetail } from '../types.js';

const labels: Record<string, string> = { ready: '待开始', in_progress: '进行中', blocked: '已阻塞', paused: '已暂停', done: '已完成', cancelled: '已取消', creating: '准备中' };
const serviceLabels: Record<string, string> = { running: '运行中', starting: '启动中', stopped: '已停止', unhealthy: '不健康', failed: '失败' };

export function TaskDetailPage({ detail, pendingAction, feedback, onBack, onAction }: {
  detail: TaskDetail; pendingAction: string | null; feedback: Feedback | null; onBack: () => void;
  onAction: (action: TaskAction, data?: Record<string, string>) => Promise<void>;
}) {
  const { task } = detail;
  const isDemo = detail.project.mode === 'demo';
  const canPause = ['ready', 'in_progress', 'blocked'].includes(task.status);
  const canComplete = ['ready', 'in_progress'].includes(task.status);
  return (
    <main className="page detail-page">
      <button className="back-button" onClick={onBack}><ArrowLeft size={17} />返回看板</button>
      <header className="detail-heading">
        <div><div className="detail-heading__meta"><span className={`status status--${task.status}`}>{labels[task.status]}</span>{isDemo && <span className="status status--demo">演示项目</span>}<span>{task.id}</span><span>{detail.project.name}</span></div><h1>{task.title}</h1></div>
        <div className="detail-actions">
          <button className="button button--secondary" onClick={() => onAction('copy-context')}><Clipboard size={16} />复制 Codex 上下文</button>
          {task.status === 'paused' ? <button className="button" disabled={Boolean(pendingAction)} onClick={() => onAction('resume')}><RotateCcw size={16} />恢复任务</button> : canPause && <button className="button button--secondary" disabled={Boolean(pendingAction)} onClick={() => onAction('pause')}><Pause size={16} />暂停任务</button>}
          {canComplete && <button className="button" disabled={Boolean(pendingAction)} onClick={() => onAction('complete')}><CheckCircle2 size={16} />标记完成</button>}
        </div>
      </header>
      <OperationFeedback feedback={feedback} />
      <div className="detail-layout">
        <div className="detail-main">
          <section className="overview-panel">
            <div><span>需求摘要</span><p>{task.requirementSummary || '尚未填写需求摘要'}</p></div>
            <div><span>当前进展</span><p>{task.currentProgress || '尚未记录进展'}</p></div>
            <div className="overview-panel__next"><span>下一步行动</span><strong>{task.nextAction || '明确下一步行动'}</strong></div>
            {task.blockedReason && <div><span>阻塞原因</span><p>{task.blockedReason}</p></div>}
          </section>
          <section className="section-block"><div className="section-heading"><div><h2>开发服务</h2><p>每项服务独立启动、停止和探测。</p></div><Server size={19} /></div>
            <div className="service-list">{isDemo ? <p className="inline-empty">演示项目不连接真实仓库或开发服务。</p> : detail.services.length ? detail.services.map((service) => <div className="service-row" key={service.serviceKey}><div><strong>{service.serviceKey}</strong><span className={`service-state service-state--${service.status}`}>{serviceLabels[service.status]}{service.port ? ` · ${service.port}` : ''}</span>{service.lastError && <small>{service.lastError}</small>}</div>{service.status === 'running' || service.status === 'starting' ? <button className="button button--secondary" disabled={pendingAction === `stop-${service.serviceKey}`} onClick={() => onAction('stop-service', { serviceKey: service.serviceKey })}><Square size={14} />停止 {service.serviceKey}</button> : <button className="button button--secondary" disabled={pendingAction === `start-${service.serviceKey}`} onClick={() => onAction('start-service', { serviceKey: service.serviceKey })}><Play size={14} />启动 {service.serviceKey}</button>}</div>) : <p className="inline-empty">此项目没有配置开发服务。</p>}</div>
          </section>
          <section className="section-block"><div className="section-heading"><div><h2>上下文与产物</h2><p>从长文本恢复任务意图和最新进展。</p></div></div><div className="artifact-tabs">{Object.entries(detail.artifacts).map(([kind, content]) => { const label = ({ requirements: '需求', context: '上下文', plan: '计划', progress: '进展', completion: '完成总结' } as Record<string, string>)[kind] ?? kind; const hasFile = detail.artifactFiles.some((file) => file.kind === kind); return <details key={kind} open={kind === 'progress'}><summary>{label}</summary><pre>{content}</pre>{hasFile && <button className="artifact-open" aria-label={`打开${label}文件`} onClick={() => onAction('open-artifact', { kind })}><FolderOpen size={14} />打开文件</button>}</details>; })}</div></section>
          <section className="section-block"><div className="section-heading"><div><h2>事件时间线</h2><p>按发生顺序保留成功、失败与恢复线索。</p></div></div><ol className="timeline">{[...detail.events].reverse().map((event) => <li key={event.id} className={event.success ? '' : 'timeline__failure'}><span className="timeline__dot" /><div><strong>{event.message || event.type}</strong><time>{new Intl.DateTimeFormat('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(event.createdAt))}</time>{typeof event.metadata.suggestedCommand === 'string' && <code>{event.metadata.suggestedCommand}</code>}</div></li>)}</ol></section>
        </div>
        <aside className="resource-panel"><h2>资源</h2><dl><div><dt>项目</dt><dd>{task.projectId}</dd></div><div><dt>配置</dt><dd>{detail.configuration?.valid === false ? '配置异常' : '配置有效'} · {detail.configuration?.configuredServices ?? detail.services.length} 项服务</dd></div><div><dt>Issue</dt><dd>{detail.configuration?.issueProvider ?? detail.project.issue?.provider ?? 'none'}</dd></div><div><dt>优先级</dt><dd>{task.priority}</dd></div><div><dt>分支</dt><dd><GitBranch size={14} />{task.branchName || '未创建'}</dd></div></dl>
          <div className="resource-links">{!isDemo && task.worktreePath && <a href="#open-worktree" onClick={(event) => { event.preventDefault(); void onAction('open-worktree'); }}><FolderOpen size={16} />打开工作树</a>}{task.issueUrl && <a href={task.issueUrl} onClick={(event) => { event.preventDefault(); void onAction('open-url', { url: task.issueUrl! }); }}><ExternalLink size={16} />打开 Issue</a>}{task.pullRequestUrl && <a href={task.pullRequestUrl} onClick={(event) => { event.preventDefault(); void onAction('open-url', { url: task.pullRequestUrl! }); }}><ExternalLink size={16} />打开 PR</a>}</div>
        </aside>
      </div>
    </main>
  );
}
