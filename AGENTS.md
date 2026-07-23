# 工作管理器工程 Harness

## 先读什么

1. Core 数据与任务状态：`packages/core/src/`。
2. CLI JSON 契约：`packages/cli/src/main.ts`。
3. 桌面端只通过 `apps/desktop/src/api/wm.ts` 与受限 Tauri 命令交互。
4. 用户工作目录规则：`templates/work-manager/AGENTS.md` 与 `work-manager-harness.json`。

## 不可违反的边界

- 不直接修改 SQLite 或 `data/artifacts/` 来伪造任务状态。
- 不自动执行 push、PR、合并、删除 worktree、远程 Issue 或真实外部服务操作。
- Demo 不能创建 worktree、Issue 或开发服务。
- 任务删除只能归档；不得永久删除任务、工件或事件。

## 变更验证矩阵

- Core/CLI：`pnpm --filter @work-manager/core test --run` 与 `pnpm --filter @work-manager/cli test --run`。
- React/Tauri：`pnpm --filter @work-manager/desktop test --run` 与 `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml`。
- 跨层或打包改动：`pnpm verify`。

先写会失败的测试，再写最小实现；每个 CLI 操作固定使用 `--json` 并验证错误码。

## 桌面端 UI 规范

- 使用 Tailwind CSS 管理桌面端的布局、间距、颜色与响应式样式；`apps/desktop/src/styles.css` 保留 Tailwind 入口、设计令牌、全局重置、无障碍降级，以及由 `@layer components` 定义的共享语义样式。
- 交互控件优先使用 `apps/desktop/src/components/ui/` 中的 shadcn 组件源码。新增组件遵循 `components.json` 的路径与别名约定，避免重复手写同类 Button、Input、Badge 等基础控件。
- 新页面优先组合 shadcn 基础组件与 Tailwind 原子类，不新增页面级 CSS class 或散落的内联 style；既有复杂页面在完成组件化迁移前，可用 `@layer components` 承载共享语义样式。
- 保持键盘可操作性；若产品要求移除某个焦点效果，应仅在对应组件局部处理，不能删除全局可访问性规则。
