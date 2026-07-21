import { Database, FolderCog, Save } from 'lucide-react';
import { type FormEvent, useEffect, useState } from 'react';
import type { DesktopSettings } from '../api/wm.js';

export function SettingsPage({ settings, onSave }: {
  settings: DesktopSettings;
  onSave: (settings: { managerRoot: string; nodePath: string }) => Promise<void>;
}) {
  const [managerRoot, setManagerRoot] = useState(settings.managerRoot ?? '');
  const [nodePath, setNodePath] = useState(settings.nodePath ?? '');
  const [saving, setSaving] = useState(false);
  useEffect(() => { setManagerRoot(settings.managerRoot ?? ''); setNodePath(settings.nodePath ?? ''); }, [settings]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    try { await onSave({ managerRoot, nodePath }); } finally { setSaving(false); }
  }

  return <main className="page settings-page">
    <header className="page-heading"><div><p className="page-heading__context">本地连接</p><h1>桌面设置</h1><p>配置桌面应用用于调用内置 wm 的工作仓库与 Node.js。</p></div></header>
    <form className="settings-form" onSubmit={submit}>
      <section><div className="settings-form__heading"><FolderCog size={19} /><div><h2>工作管理仓库</h2><p>必须包含 projects 目录；保存时会转换并验证绝对路径。</p></div></div><label><span>工作管理仓库</span><input aria-label="工作管理仓库" value={managerRoot} onChange={(event) => setManagerRoot(event.target.value)} placeholder="/Users/you/work-manager" required /></label></section>
      <section><div className="settings-form__heading"><Database size={19} /><div><h2>Node.js</h2><p>留空时依次检查 Homebrew 和系统常见路径，也可填写 node 可执行文件。</p></div></div><label><span>Node.js 可执行文件</span><input aria-label="Node.js 可执行文件" value={nodePath} onChange={(event) => setNodePath(event.target.value)} placeholder="/opt/homebrew/bin/node" /></label></section>
      <button className="button settings-form__submit" disabled={saving}><Save size={16} />{saving ? '正在保存' : '保存桌面设置'}</button>
    </form>
  </main>;
}
