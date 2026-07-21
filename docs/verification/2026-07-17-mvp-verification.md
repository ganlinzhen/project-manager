# 个人工作管理器 MVP 验收记录

> 验收日期：2026-07-17  
> 分支：`codex/personal-work-manager-mvp`  
> 结论：MVP 主流程和 macOS 原生打包已跑通。

## 验收范围

- 项目 YAML 读取、结构校验、任务前缀唯一性与外部命令检查。
- SQLite 迁移、单调任务编号、状态流转、只追加事件与 Markdown 产物。
- 任务创建、进展、详情、暂停、恢复、完成、重试与 `doctor`。
- Git worktree、GitHub/GitLab Issue 适配器和多个命名开发服务。
- React 看板、完整任务详情、设置页与 Tauri 受控命令层。
- 内置 CLI 资源、macOS `.app` 和 `.dmg` 发布构建。

## 自动化验证

| 验证 | 命令 | 结果 |
|---|---|---|
| 全量测试 | `pnpm test` | 33/33 通过：Core 23、CLI 5、Desktop 5 |
| TypeScript | `pnpm -r typecheck` | 全部通过 |
| Web/CLI 生产构建 | `pnpm build` | 全部通过，内置 `wm.mjs` 生成成功 |
| Rust 后台 | `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml` | 2/2 通过 |
| 依赖审计 | `pnpm audit --prod` | 未发现已知漏洞 |
| Tauri 发布构建 | `pnpm --filter @work-manager/desktop tauri build` | `.app` 与 `.dmg` 均生成成功 |

Rust 验证使用 `/tmp/wm-rustup-home` 和 `/tmp/wm-cargo-home` 中的隔离工具链，没有修改用户的全局 Rust 配置。

## 端到端证据

CLI 集成测试在真实临时 Git 仓库中依次完成：

1. 初始化 Git 仓库并提交基准分支。
2. `wm project validate` 校验项目。
3. 创建任务、分支、worktree 和五个 Markdown 产物。
4. 启动具名 `worker` 服务并记录 PID 与进程身份。
5. 运行 `wm task doctor`，确认任务、产物、Git 资源和进程一致。
6. 只停止该任务的 `worker` 服务。

另有独立测试覆盖任务进展、详情和完成闭环，以及部分失败后只补齐缺失资源的重试行为。GitHub 与 GitLab 通过命令替身验证参数数组、响应解析、持久化和重复调用保护；验收过程没有访问或存储真实平台凭证。

发布包内资源也从仓库外目录独立运行过：

```text
工作管理器.app/Contents/Resources/resources/wm.mjs task list --all --json
{"ok":true,"data":{"tasks":[]}}
```

## 产物

- macOS App：`apps/desktop/src-tauri/target/release/bundle/macos/工作管理器.app`
- macOS 安装镜像：`apps/desktop/src-tauri/target/release/bundle/dmg/工作管理器_0.1.0_aarch64.dmg`
- 桌面端内置 CLI：`apps/desktop/src-tauri/resources/wm.mjs`

## 安全检查

- 外部命令均使用参数数组且设置超时，不经 shell 拼接。
- 服务停止前同时核对 PID 和进程身份，拒绝 PID 复用误杀。
- 工件、服务目录和 worktree 使用真实路径边界校验。
- Tauri 仅开放受控 `wm` 子命令，打开工件时只接受登记类型和数据目录内文件。
- 审计事件元数据脱敏；SQLite 触发器阻止既有事件更新和删除。
- 不会自动 push、创建 PR、合并、删除分支、worktree 或远程资源。

## 已知边界

- MVP 只面向 macOS 本地单用户，不提供云同步、多人协作、进程守护或日志聚合。
- GitHub/GitLab 的真实远程烟测需要使用者本机已登录的 `gh`/`glab`；本次验收使用无凭证的适配器替身，避免触碰真实仓库。
- 桌面应用首次启动需在“设置”中选择工作管理仓库；若未自动发现 Node.js，还需填写其绝对路径。
