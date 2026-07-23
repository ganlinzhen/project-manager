import { Database, FolderCog, Save } from 'lucide-react';
import { type FormEvent, useEffect, useState } from 'react';
import { type DesktopSettings, type InitializeCodexProjectInput, wmApi } from '../api/wm.js';

export function SettingsPage({ settings, onSave, onInitialize = wmApi.initializeCodexProject, onClearAndReset = wmApi.clearDesktopData, onChooseDirectory = wmApi.chooseDirectory }: {
  settings: DesktopSettings;
  onSave: (settings: { managerRoot: string; nodePath: string }) => Promise<void>;
  onInitialize?: (input: InitializeCodexProjectInput) => Promise<DesktopSettings | void>;
  onClearAndReset?: () => Promise<DesktopSettings | void>;
  onChooseDirectory?: () => Promise<string | null>;
}) {
  const [managerRoot, setManagerRoot] = useState(settings.managerRoot ?? '');
  const [nodePath, setNodePath] = useState(settings.nodePath ?? '');
  const [saving, setSaving] = useState(false);
  const [showInitializer, setShowInitializer] = useState(false);
  const [initializing, setInitializing] = useState(false);
  const [projectName, setProjectName] = useState('');
  const [parentDirectory, setParentDirectory] = useState('');
  const [initializationError, setInitializationError] = useState<string | null>(null);
  const [resetting, setResetting] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);
  const [hasManagerRoot, setHasManagerRoot] = useState(Boolean(settings.managerRoot));
  useEffect(() => { setManagerRoot(settings.managerRoot ?? ''); setNodePath(settings.nodePath ?? ''); }, [settings]);
  useEffect(() => { setHasManagerRoot(Boolean(settings.managerRoot)); }, [settings.managerRoot]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    try { await onSave({ managerRoot, nodePath }); } finally { setSaving(false); }
  }

  async function chooseParentDirectory() {
    try {
      const selected = await onChooseDirectory();
      if (selected) {
        setParentDirectory(selected);
        setInitializationError(null);
      }
    } catch (error) {
      setInitializationError(error instanceof Error ? error.message : String(error));
    }
  }

  async function submitInitialization(event: FormEvent) {
    event.preventDefault();
    if (!projectName.trim() || !parentDirectory) {
      setInitializationError(!projectName.trim() ? '请输入项目名称' : '请选择项目目录');
      return;
    }
    setInitializing(true);
    setInitializationError(null);
    try {
      const saved = await onInitialize({ projectName: projectName.trim(), parentDirectory });
      if (saved) {
        setManagerRoot(saved.managerRoot ?? '');
        setNodePath(saved.nodePath ?? '');
        setHasManagerRoot(Boolean(saved.managerRoot));
      } else {
        setHasManagerRoot(true);
      }
      setShowInitializer(false);
    } catch (error) {
      setInitializationError(error instanceof Error ? error.message : String(error));
    } finally { setInitializing(false); }
  }

  async function clearAndReset() {
    setResetting(true);
    setResetError(null);
    try {
      const saved = await onClearAndReset();
      setManagerRoot(saved?.managerRoot ?? '');
      setNodePath(saved?.nodePath ?? '');
      setHasManagerRoot(Boolean(saved?.managerRoot));
      setProjectName('');
      setParentDirectory('');
      setInitializationError(null);
      setShowInitializer(true);
    } catch (error) {
      setResetError(error instanceof Error ? error.message : String(error));
    } finally { setResetting(false); }
  }

  return <main className="page settings-page">
    <header className="page-heading"><div><p className="page-heading__context">本地连接</p><h1>桌面设置</h1><p>配置桌面应用用于调用内置 wm 的 Codex 项目目录与 Node.js。</p></div></header>
    <form className="settings-form" onSubmit={submit}>
      <section><div className="settings-form__heading"><div className="settings-form__heading-main"><FolderCog size={19} /><div><h2>Codex 项目目录</h2><p>初始化会在所选目录下创建固定模板项目；也可手工保存已有项目目录。</p></div></div>{hasManagerRoot ? <button type="button" className="button button--secondary" onClick={clearAndReset} disabled={resetting}>{resetting ? '正在清空' : '清空并重新设置'}</button> : null}</div><label><span>项目路径</span><input aria-label="Codex 项目目录" value={managerRoot} onChange={(event) => setManagerRoot(event.target.value)} placeholder="/Users/you/work-manager" required /></label></section>
      <section><div className="settings-form__heading"><Database size={19} /><div><h2>Node.js</h2><p>留空时依次检查 Homebrew 和系统常见路径，也可填写 node 可执行文件。</p></div></div><label><span>Node.js 可执行文件</span><input aria-label="Node.js 可执行文件" value={nodePath} onChange={(event) => setNodePath(event.target.value)} placeholder="/opt/homebrew/bin/node" /></label></section>
      {!hasManagerRoot ? <button type="button" className="button button--secondary" onClick={() => setShowInitializer(true)}>初始化项目</button> : null}
      {resetError ? <p className="form-error" role="alert">{resetError}</p> : null}
      <button className="button settings-form__submit" disabled={saving}><Save size={16} />{saving ? '正在保存' : '保存桌面设置'}</button>
    </form>
    {showInitializer ? <div className="dialog-backdrop" role="presentation">
      <section className="settings-dialog" role="dialog" aria-modal="true" aria-labelledby="initializer-title">
        <h2 id="initializer-title">初始化 Codex 项目</h2>
        <form onSubmit={submitInitialization}>
          <label><span>项目名称</span><input aria-label="项目名称" value={projectName} placeholder="例如：我的工作管理器" onChange={(event) => setProjectName(event.target.value)} /></label>
          <label><span>项目目录</span><div className="directory-picker"><input aria-label="项目目录" value={parentDirectory} placeholder="请选择保存项目的本机目录" readOnly /><button type="button" className="button button--secondary" onClick={chooseParentDirectory}>选择目录</button></div></label>
          {initializationError ? <p className="form-error" role="alert">{initializationError}</p> : null}
          <footer><button type="button" className="button button--secondary" onClick={() => setShowInitializer(false)} disabled={initializing}>取消</button><button type="submit" className="button" disabled={initializing}>{initializing ? '正在创建' : '创建项目'}</button></footer>
        </form>
      </section>
    </div> : null}
  </main>;
}
