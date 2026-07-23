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
