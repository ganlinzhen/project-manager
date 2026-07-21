# 个人工作管理助手 MVP

本地单用户工作管理器。`wm` CLI 是唯一结构化操作入口；Core 统一维护 SQLite、任务状态、Markdown 产物、Git worktree、Issue 关联和命名开发服务，Tauri/React 桌面端通过 `wm --json` 展示相同事实。

## 当前能力

- 项目 YAML 注册与校验，项目内任务编号单调递增且不复用。
- 任务创建、列表、详情、进展、暂停、恢复、完成、重开、重试与 doctor。
- 在 `data/artifacts/<taskId>/` 原子维护需求、上下文、计划、进展和完成总结。
- 通过参数数组安全调用 Git、`gh` 和 `glab`，支持创建或关联 GitHub / GitLab Issue。
- 为任务创建分支和 worktree，部分失败时保留已成功资源，重试不会重复创建 Issue。
- 按任务和名称独立启动、停止与探测多个开发服务。
- 看板默认展示活跃任务，详情页显示上下文、资源、服务和不可变事件时间线。

MVP 不会自动 push、创建 PR、合并、删除分支、删除 worktree 或删除远程资源。

## 环境要求

- Node.js 22.13 或更高版本
- pnpm 10
- Git
- 可选：已经登录的 `gh` / `glab`
- 原生桌面打包需要 Rust、Cargo 和 macOS/Xcode 命令行工具

## 安装与构建

```bash
pnpm install
pnpm build
pnpm test
```

## 配置项目

在 `projects/` 下创建 YAML。仓库路径必须是绝对路径；每个项目只能选择一个 Issue 提供方。

```yaml
id: demo
name: Demo
taskPrefix: DEMO
repositoryPath: /absolute/path/to/repository
worktreeRoot: /absolute/path/to/worktrees/demo
defaultBranch: main

issue:
  provider: none # github | gitlab | none
  # repository: owner/repository

development:
  services:
    web:
      cwd: .
      startCommand:
        - pnpm
        - dev
      healthCheckUrl: http://localhost:3000
      port: 3000
```

先验证配置：

```bash
pnpm wm project validate demo --json
```

## 跑通 CLI 流程

以下命令使用 macOS Application Support 中的 SQLite，并在本仓库 `data/artifacts/` 写 Markdown：

```bash
pnpm wm task create \
  --project demo \
  --title "接通个人工作流" \
  --type feature \
  --priority high \
  --create-worktree \
  --json

pnpm wm task progress DEMO-1 \
  --current "核心流程已接通" \
  --next "启动本地服务" \
  --json

pnpm wm env start DEMO-1 --service web --json
pnpm wm env status DEMO-1 --json
pnpm wm task doctor DEMO-1 --json
pnpm wm env stop DEMO-1 --service web --json
pnpm wm task complete DEMO-1 --json
```

如果 Issue 或 worktree 在创建过程中失败，任务会保留为 `blocked`，响应中带稳定错误码和恢复命令。修复外部原因后运行：

```bash
pnpm wm task retry DEMO-1 --json
```

## 桌面端

无需 Rust 即可在浏览器预览完整桌面界面；非 Tauri 环境会显示内置演示数据：

```bash
pnpm desktop:dev
```

安装 Rust/Cargo 后运行原生 Tauri。桌面构建会自动把受控的 `wm` CLI 打进应用资源，不需要全局安装或链接 CLI：

```bash
pnpm --filter @work-manager/desktop tauri dev
pnpm --filter @work-manager/desktop tauri build
```

首次启动后，在“设置”中填写本工作管理仓库的绝对路径；如应用未自动找到 Node.js，再填写 `node` 可执行文件的绝对路径。桌面端只允许任务查看、暂停、恢复、完成、服务启停、复制上下文、打开已登记的工件、Finder 打开 worktree 和打开 Issue/PR URL。后台有命令白名单和路径边界校验，不提供打开终端或资源删除入口。

## 数据位置

- SQLite：`~/Library/Application Support/work-manager/work-manager.db`
- Markdown：本工作管理仓库的 `data/artifacts/<taskId>/`
- 项目配置：本工作管理仓库的 `projects/*.yaml`

测试可通过 `WM_MANAGER_ROOT`、`WM_PROJECTS_DIR`、`WM_DATABASE_PATH` 和 `WM_APP_DATA_DIR` 指向临时目录，不污染真实数据。
