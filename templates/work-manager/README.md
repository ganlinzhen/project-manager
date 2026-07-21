# 工作管理仓库

这是个人工作管理器的本地工作目录模板。它同时承担两项职责：

- 为桌面应用提供项目配置和任务 Markdown 工件的存放位置；
- 作为 Codex 项目目录，保存项目约定、需求上下文和决策记录。

## 使用方法

1. 复制整个目录到你希望长期保存工作管理数据的位置，例如：

   ```sh
   cp -R templates/work-manager ~/Documents/work-manager
   ```

2. 在桌面应用的“设置 → 工作管理仓库”中填写复制后的绝对路径：

   ```text
   /Users/你的用户名/Documents/work-manager
   ```

3. 打开看板。首次加载时，内置的 Demo 项目会生成四条本地示例任务。

4. 如需通过 CLI 验证 Demo，可在工作管理器产品仓库中运行：

   ```sh
   WM_MANAGER_ROOT="$HOME/Documents/work-manager" \
   WM_PROJECTS_DIR="$HOME/Documents/work-manager/projects" \
   pnpm wm project validate demo --json
   ```

## 目录入口

- `projects/*.yaml`：工作管理器读取的项目配置。
- `project-rules/*.md`：项目的分支、合并、部署和验证约定。
- `data/artifacts/<任务 ID>/`：任务自动生成的需求、上下文、计划、进展和完成总结。
- `docs/`：仓库级规范和决策记录。

## Demo 项目

`projects/demo.yaml` 使用 `mode: demo`。它没有真实代码仓库、Git 分支、Issue 或本地服务，仅用于体验看板与任务详情：

- 会跳过真实路径、Git、Issue 和服务校验；
- 支持查看、更新进展、暂停、恢复、完成和阅读工件；
- 不支持创建 worktree、启动服务、创建或关联 Issue。

新增真实项目时，请阅读 [工作管理仓库规范](docs/工作管理仓库规范.md)。
