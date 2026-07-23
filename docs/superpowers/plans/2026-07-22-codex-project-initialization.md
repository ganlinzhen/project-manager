# Codex 项目目录初始化 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让桌面端可创建并配置一个包含工作管理模板的 Codex 项目目录，并在重新设置时安全清空本地数据库后刷新项目和任务。

**Architecture:** React 设置页只收集项目名称、驱动原生目录选择器并显示初始化状态；Tauri 主进程验证路径、复制打包模板、保存设置和清理数据库。模板随应用资源打包，初始化结束后复用既有 `wm task list --all --json` 调用，以现有 CLI 的 demo 种子机制刷新 SQLite 数据。

**Tech Stack:** React 19、TypeScript、Vitest、Tauri 2、Rust、Tauri Dialog 插件。

## Global Constraints

- 所有用户可见文字和新增注释使用简体中文。
- 不暴露任意文件系统读写 API；复制、校验和数据库清理由 Tauri 主进程执行。
- 目标路径为用户选择的父目录与项目名称组合；目标已存在时绝不覆盖。
- 清空只删除工作管理器的 SQLite 数据和设置，绝不删除用户创建的 Codex 项目目录。
- 模板来源固定为 `templates/work-manager`，打包产物也必须包含该目录。
- 不自动提交、推送或创建 PR。

---

## 文件结构

- `apps/desktop/src-tauri/src/lib.rs`：桌面设置持久化、模板初始化、SQLite 清理和 Tauri 命令。
- `apps/desktop/src-tauri/Cargo.toml`：声明原生目录选择所需的 Tauri Dialog 插件。
- `apps/desktop/src-tauri/tauri.conf.json`：将工作管理模板作为 bundle resource 打包。
- `apps/desktop/package.json`：声明 Dialog 的前端 API 依赖。
- `apps/desktop/src/api/wm.ts`：为设置页提供目录选择、初始化和重设 IPC 封装。
- `apps/desktop/src/pages/SettingsPage.tsx`：呈现 Codex 项目目录区块和初始化弹窗。
- `apps/desktop/src/App.tsx`：在初始化/重设后刷新设置、任务与反馈状态。
- `apps/desktop/src/styles.css`：弹窗和目录选择行的样式。
- `apps/desktop/src/test/ui.test.tsx`：验证设置页标题、初始化表单、状态转换。
- `apps/desktop/src/App.test.tsx`：验证应用级初始化后刷新任务。

### Task 1: 主进程安全初始化与重设能力

**Files:**
- Modify: `apps/desktop/src-tauri/src/lib.rs`
- Modify: `apps/desktop/src-tauri/Cargo.toml`
- Modify: `apps/desktop/src-tauri/tauri.conf.json`

**Interfaces:**
- Consumes: `AppHandle`、`projectName: String`、`parentDirectory: String`、打包资源目录中的 `templates/work-manager`。
- Produces: `initialize_codex_project(app, project_name, parent_directory) -> Result<DesktopSettings, String>`、`clear_desktop_data(app) -> Result<DesktopSettings, String>`。

- [ ] **Step 1: 写入 Rust 失败测试，固定目标路径、模板复制和同名目录拒绝。**

在 `lib.rs` 的测试模块中导入 `std::fs::{self, File}`、`std::time::{SystemTime, UNIX_EPOCH}` 与待实现的 `validate_project_name`、`prepare_project_target`、`copy_template_directory`。使用唯一临时目录，建立 `template/projects/demo.yaml` 后断言：

```rust
#[test]
fn 初始化仅接受单层名称并复制完整模板() {
    let root = temp_directory("wm-init");
    let template = root.join("template");
    fs::create_dir_all(template.join("projects")).unwrap();
    File::create(template.join("projects/demo.yaml")).unwrap();

    let target = prepare_project_target(&root, "我的项目").unwrap();
    copy_template_directory(&template, &target).unwrap();

    assert!(target.join("projects/demo.yaml").is_file());
    assert!(prepare_project_target(&root, "我的项目").is_err());
    assert!(validate_project_name("../危险").is_err());
    fs::remove_dir_all(root).unwrap();
}
```

- [ ] **Step 2: 运行 Rust 测试，确认它因辅助函数尚不存在而失败。**

运行：`rtk pnpm --filter @work-manager/desktop tauri dev --help` 不适合单测；改为 `rtk cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml 初始化仅接受单层名称并复制完整模板`

预期：编译失败，信息包含 `prepare_project_target` 或 `copy_template_directory` 未定义。

- [ ] **Step 3: 实现最小文件操作边界。**

在 `lib.rs` 中添加以下辅助函数；所有路径均由 Rust 处理，且不接受多层项目名：

```rust
fn validate_project_name(value: &str) -> Result<&str, String> {
    let name = value.trim();
    if name.is_empty() || name == "." || name == ".." || name.contains('/') || name.contains('\\') {
        return Err("项目名称不能为空且不能包含路径分隔符".into());
    }
    Ok(name)
}

fn prepare_project_target(parent: &Path, project_name: &str) -> Result<PathBuf, String> {
    let parent = parent.canonicalize().map_err(|error| format!("项目目录不可用：{error}"))?;
    if !parent.is_dir() { return Err("请选择一个有效的本机目录".into()); }
    let target = parent.join(validate_project_name(project_name)?);
    if target.exists() { return Err("该目录下已存在同名项目，请修改名称或选择其他位置".into()); }
    Ok(target)
}

fn copy_template_directory(source: &Path, target: &Path) -> Result<(), String> {
    fs::create_dir_all(target).map_err(|error| format!("无法创建项目目录：{error}"))?;
    for entry in fs::read_dir(source).map_err(|error| format!("无法读取项目模板：{error}"))? {
        let entry = entry.map_err(|error| error.to_string())?;
        let destination = target.join(entry.file_name());
        if entry.file_type().map_err(|error| error.to_string())?.is_dir() {
            copy_template_directory(&entry.path(), &destination)?;
        } else {
            fs::copy(entry.path(), destination).map_err(|error| format!("无法复制项目模板：{error}"))?;
        }
    }
    Ok(())
}
```

再实现 `template_path(app)`，从 `app.path().resource_dir()?.join("templates/work-manager")` 取模板；`initialize_codex_project` 使用该路径复制后，以 `validate_manager_root` 验证目标、调用现有原子写设置逻辑保存 `manager_root`，并返回新设置。任何复制或保存错误都只删除本次新建且仍为空的目标目录。

实现 `clear_desktop_data`：读取现有设置，定位 CLI 当前使用的 `~/Library/Application Support/work-manager/work-manager.db` 与同目录的 `-wal`、`-shm` 文件；逐个删除不存在以外的文件，随后将 `manager_root` 置为 `None`、保留 `node_path` 并使用现有临时文件重命名方式保存。删除失败不得写入空设置。

将两个命令加入 `tauri::generate_handler!`：

```rust
#[tauri::command]
fn initialize_codex_project(app: AppHandle, project_name: String, parent_directory: String) -> Result<DesktopSettings, String> {
    let target = prepare_project_target(Path::new(&parent_directory), &project_name)?;
    let template = template_path(&app)?;
    copy_template_directory(&template, &target)?;
    save_settings(&app, DesktopSettings { manager_root: Some(validate_manager_root(&target)?), node_path: read_settings(&app)?.node_path })
}

#[tauri::command]
fn clear_desktop_data(app: AppHandle) -> Result<DesktopSettings, String> {
    let settings = read_settings(&app)?;
    remove_database_files(&work_manager_database_path(&app)?)?;
    save_settings(&app, DesktopSettings { manager_root: None, node_path: settings.node_path })
}
```

- [ ] **Step 4: 将模板和原生目录选择能力加入桌面包。**

在 `Cargo.toml` 的 `[dependencies]` 中增加与当前 Tauri 2 兼容的 `tauri-plugin-dialog = "2"`，在 `run()` 的 builder 中注册：

```rust
.plugin(tauri_plugin_dialog::init())
```

在 `tauri.conf.json` 的 `bundle.resources` 改为映射，同时保留 CLI：

```json
"resources": {
  "resources/wm.mjs": "resources/wm.mjs",
  "../../templates/work-manager": "templates/work-manager"
}
```

- [ ] **Step 5: 重新运行 Rust 测试并检查编译。**

运行：`rtk cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml 初始化仅接受单层名称并复制完整模板`

预期：退出码 0，测试确认模板复制、同名目录拒绝和非法名称拒绝。

### Task 2: 前端 IPC 封装与初始化设置界面

**Files:**
- Modify: `apps/desktop/package.json`
- Modify: `apps/desktop/src/api/wm.ts`
- Modify: `apps/desktop/src/pages/SettingsPage.tsx`
- Modify: `apps/desktop/src/styles.css`
- Modify: `apps/desktop/src/test/ui.test.tsx`

**Interfaces:**
- Consumes: `@tauri-apps/plugin-dialog` 的 `open({ directory: true, multiple: false })`、Tauri 命令 `initialize_codex_project`、`clear_desktop_data`。
- Produces: `wmApi.chooseDirectory()`、`wmApi.initializeCodexProject(input)`、`wmApi.clearDesktopData()`，以及 `SettingsPage` 的 `onInitialize` 和 `onClearAndReset` 回调。

- [ ] **Step 1: 写入 UI 失败测试，描述标题、弹窗和成功后的状态转换。**

在 `ui.test.tsx` 引入 `screen` 已有断言工具，扩展 `SettingsPage` 的回调参数并新增：

```tsx
it('未初始化时以 Codex 项目目录引导创建项目', async () => {
  const onInitialize = vi.fn().mockResolvedValue(undefined);
  render(<SettingsPage
    settings={{ managerRoot: null, nodePath: null }}
    onSave={vi.fn()}
    onInitialize={onInitialize}
    onClearAndReset={vi.fn()}
  />);
  await userEvent.click(screen.getByRole('button', { name: '初始化项目' }));
  expect(screen.getByRole('dialog', { name: '初始化 Codex 项目' })).toBeInTheDocument();
  expect(screen.getByText('Codex 项目目录')).toBeInTheDocument();
  await userEvent.type(screen.getByLabelText('项目名称'), '我的工作台');
  await userEvent.click(screen.getByRole('button', { name: '创建项目' }));
  expect(onInitialize).not.toHaveBeenCalled();
  expect(screen.getByText('请选择项目目录')).toBeInTheDocument();
});

it('已初始化时提供清空并重新设置', async () => {
  render(<SettingsPage
    settings={{ managerRoot: '/tmp/work-manager', nodePath: null }}
    onSave={vi.fn()}
    onInitialize={vi.fn()}
    onClearAndReset={vi.fn().mockResolvedValue(undefined)}
  />);
  expect(screen.getByRole('button', { name: '清空并重新设置' })).toBeInTheDocument();
});
```

- [ ] **Step 2: 运行 UI 测试，确认它因新回调和按钮缺失而失败。**

运行：`rtk pnpm --filter @work-manager/desktop test --run apps/desktop/src/test/ui.test.tsx`

预期：失败信息包含找不到“初始化项目”或 `onInitialize` 属性不存在。

- [ ] **Step 3: 实现前端 API，并保持浏览器预览可用。**

将 `@tauri-apps/plugin-dialog` 添加到 `apps/desktop/package.json` 的 `dependencies`。在 `wm.ts` 导入 `open` 并新增类型和方法：

```ts
export interface InitializeCodexProjectInput { projectName: string; parentDirectory: string; }

async chooseDirectory(): Promise<string | null> {
  if (!isTauri()) return null;
  const selected = await open({ directory: true, multiple: false, title: '选择 Codex 项目的本机目录' });
  return typeof selected === 'string' ? selected : null;
},
async initializeCodexProject(input: InitializeCodexProjectInput): Promise<DesktopSettings> {
  if (!isTauri()) return { managerRoot: input.parentDirectory ? `${input.parentDirectory}/${input.projectName}` : null, nodePath: null };
  return invoke<DesktopSettings>('initialize_codex_project', { projectName: input.projectName, parentDirectory: input.parentDirectory });
},
async clearDesktopData(): Promise<DesktopSettings> {
  if (!isTauri()) return { managerRoot: null, nodePath: null };
  return invoke<DesktopSettings>('clear_desktop_data');
}
```

- [ ] **Step 4: 实现设置页弹窗与条件按钮。**

将现有“工作管理仓库”区块标题改为“Codex 项目目录”。在 `SettingsPage` 维护 `initializing`、`projectName`、`parentDirectory`、`initializationError` 和 `resetting` 状态；新增：

```ts
async function submitInitialization(event: FormEvent) {
  event.preventDefault();
  if (!projectName.trim() || !parentDirectory) {
    setInitializationError(!projectName.trim() ? '请输入项目名称' : '请选择项目目录');
    return;
  }
  setInitializing(true);
  setInitializationError(null);
  try {
    await onInitialize({ projectName: projectName.trim(), parentDirectory });
    setShowInitializer(false);
  } catch (error) {
    setInitializationError(error instanceof Error ? error.message : String(error));
  } finally { setInitializing(false); }
}
```

目录字段使用只读 input 显示已选路径，旁边的“选择目录”按钮调用 `onChooseDirectory`。点击“清空并重新设置”先等待 `onClearAndReset` 成功，再显示同一弹窗；重设中禁用按钮。保留现有 `onSave`，使用户仍可手工保存已有目录和 Node.js。

弹窗使用语义化结构：

```tsx
<div className="dialog-backdrop" role="presentation">
  <section className="settings-dialog" role="dialog" aria-modal="true" aria-labelledby="initializer-title">
    <h2 id="initializer-title">初始化 Codex 项目</h2>
    <form onSubmit={submitInitialization}>
      <label><span>项目名称</span><input aria-label="项目名称" value={projectName} onChange={(event) => setProjectName(event.target.value)} /></label>
      <label><span>项目目录</span><input aria-label="项目目录" value={parentDirectory} readOnly /></label>
      {initializationError ? <p className="form-error">{initializationError}</p> : null}
      <button type="button" onClick={() => setShowInitializer(false)}>取消</button>
      <button type="submit" disabled={initializing}>{initializing ? '正在创建' : '创建项目'}</button>
    </form>
  </section>
</div>
```

在 `styles.css` 增加 `.dialog-backdrop` 固定遮罩、`.settings-dialog` 适配 520px 宽度的容器、`.directory-picker` 横向排列输入框与按钮、`.form-error` 红色错误文字；小屏幕下将 `.directory-picker` 改为纵向排列。

- [ ] **Step 5: 运行 UI 测试，确认标题、必填校验与重设按钮通过。**

运行：`rtk pnpm --filter @work-manager/desktop test --run apps/desktop/src/test/ui.test.tsx`

预期：退出码 0，原有保存设置用例和新增初始化用例均通过。

### Task 3: 应用级刷新、数据库重新加载与端到端验证

**Files:**
- Modify: `apps/desktop/src/App.tsx`
- Create: `apps/desktop/src/App.test.tsx`
- Modify: `apps/desktop/src-tauri/src/lib.rs`

**Interfaces:**
- Consumes: `wmApi.initializeCodexProject`、`wmApi.clearDesktopData`、既有 `loadTasks`。
- Produces: 初始化完成后一致的设置/看板状态；重设后无旧任务，重新初始化后由 CLI 生成新 demo 数据。

- [ ] **Step 1: 写入应用级失败测试，确认初始化回调刷新任务。**

创建 `App.test.tsx`，以 `vi.mock` 替换 API 后再导入 App；渲染后导航至设置页，初始化项目并断言 `listTasks` 再次执行且出现成功反馈：

```tsx
vi.mock('./api/wm.js', () => ({
  wmApi: {
    listTasks: vi.fn().mockResolvedValue([]), getSettings: vi.fn().mockResolvedValue({ managerRoot: null, nodePath: null }),
    initializeCodexProject: vi.fn().mockResolvedValue({ managerRoot: '/tmp/我的项目', nodePath: null }),
    clearDesktopData: vi.fn(), chooseDirectory: vi.fn().mockResolvedValue('/tmp'), saveSettings: vi.fn(),
    getTask: vi.fn(), taskAction: vi.fn(), serviceAction: vi.fn(), openWorktree: vi.fn(), openArtifact: vi.fn(), openUrl: vi.fn()
  }
}));

it('初始化 Codex 项目后刷新设置和任务', async () => {
  render(<App />);
  await userEvent.click(screen.getByRole('button', { name: '设置' }));
  await userEvent.click(screen.getByRole('button', { name: '初始化项目' }));
  await userEvent.type(screen.getByLabelText('项目名称'), '我的项目');
  await userEvent.click(screen.getByRole('button', { name: '选择目录' }));
  await userEvent.click(screen.getByRole('button', { name: '创建项目' }));
  await waitFor(() => expect(wmApi.listTasks).toHaveBeenCalledTimes(2));
  expect(screen.getByText('Codex 项目已初始化')).toBeInTheDocument();
});
```

- [ ] **Step 2: 运行应用级测试，确认它因尚未定义处理函数而失败。**

运行：`rtk pnpm --filter @work-manager/desktop test --run apps/desktop/src/test/ui.test.tsx`

预期：失败信息包含 `initializeCodexProject` 未被调用，或看板刷新次数不匹配。

- [ ] **Step 3: 在 App 中实现初始化和重设回调。**

在 `App.tsx` 增加：

```ts
async function initializeCodexProject(input: { projectName: string; parentDirectory: string }) {
  try {
    const saved = await wmApi.initializeCodexProject(input);
    setSettings(saved);
    await loadTasks();
    setFeedback({ kind: 'success', message: 'Codex 项目已初始化' });
  } catch (error) {
    setFeedback({ kind: 'error', message: error instanceof Error ? error.message : String(error) });
    throw error;
  }
}

async function clearAndReset() {
  try {
    const saved = await wmApi.clearDesktopData();
    setSettings(saved);
    setTasks([]);
    setDetail(null);
    setFeedback({ kind: 'success', message: '本地数据已清空，请重新初始化 Codex 项目' });
  } catch (error) {
    setFeedback({ kind: 'error', message: error instanceof Error ? error.message : String(error) });
    throw error;
  }
}
```

将其与 `wmApi.chooseDirectory` 一并传入 `SettingsPage`。保持 `loadTasks` 的错误反馈逻辑不变，以便模板配置无效时仍可解释失败原因。

在 Rust 测试中为数据库路径文件增加独立的 `remove_database_files(path)` 辅助函数测试，分别创建 `work-manager.db`、`work-manager.db-wal`、`work-manager.db-shm` 后确认三者被删除；实际 `clear_desktop_data` 仅在删除成功后保存空 `manager_root`。

- [ ] **Step 4: 运行全量桌面校验。**

运行：

```bash
rtk pnpm --filter @work-manager/desktop test --run
rtk pnpm --filter @work-manager/desktop typecheck
rtk cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml
rtk pnpm --filter @work-manager/desktop build
```

预期：四条命令均退出码 0。

- [ ] **Step 5: 在临时目录进行实际桌面验证。**

运行 `rtk pnpm desktop:dev`，在设置页选择一个临时父目录、填写唯一项目名称并创建。确认生成目录包含 `projects/demo.yaml`、应用设置已更新、看板出现 demo 任务；再点击“清空并重新设置”，确认看板不再显示旧任务且刚创建的项目目录仍存在。此验证不删除任何用户真实目录。

## 计划自检

- 规格中的标题调整、双字段弹窗、模板复制、拒绝覆盖、主进程边界、数据库清理、刷新项目/任务、错误处理及不删除用户目录均分别由 Task 1-3 覆盖。
- 已扫描计划；没有 `TODO`、`TBD`、未定义接口或省略的测试命令。
- 与现有接口一致：设置仍通过 `DesktopSettings` 返回，任务刷新仍通过 `wmApi.listTasks()`，模板 demo 仍由现有 CLI 在首次读任务时写入 SQLite。
