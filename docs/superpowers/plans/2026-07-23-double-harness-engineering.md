# 双层 Harness Engineering Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让产品仓库与初始化后的 Codex 工作目录均具备可执行、安全、可验证的数据操作 Harness。

**Architecture:** Core 保存任务归档字段并以事件流审计；CLI 与桌面端共享同一任务操作。模板声明数据所有权，初始化代码在受控位置配置 CLI 桥接；根脚本和 CI 统一验证全部边界。

**Tech Stack:** TypeScript、Vitest、React、Tauri/Rust、pnpm、GitHub Actions。

## Global Constraints

- 不永久删除 SQLite 任务、工件或事件。
- 所有任务数据写入只能经过 Core/CLI/App。
- 不自动提交、推送、创建 PR 或访问真实远程资源。
- 所有新增用户可见文字使用简体中文。

---

### Task 1: 归档数据模型与 CLI

**Files:** `packages/core/src/{database,domain,task-repository,task-service}.ts`、`packages/core/test/core.test.ts`、`packages/cli/src/main.ts`、`packages/cli/test/cli.test.ts`

- [ ] 先写失败测试：归档保留原状态与工件、默认列表隐藏、`--archived` 查询、恢复后重新可见。
- [ ] 增加幂等迁移、仓储归档/恢复、事件记录和 CLI `task archive|restore`。
- [ ] 运行 Core 与 CLI 定向测试。

### Task 2: 桌面端任务归档闭环

**Files:** `apps/desktop/src/{types.ts,api/wm.ts,App.tsx,pages/BoardPage.tsx,pages/TaskDetailPage.tsx}`、对应 Vitest。

- [ ] 先写失败测试：归档按钮、归档筛选和恢复操作。
- [ ] 扩展 API、动作类型、筛选与详情页确认交互。
- [ ] 运行桌面定向测试。

### Task 3: 模板工作目录 Harness

**Files:** `templates/work-manager/{AGENTS.md,README.md,work-manager-harness.json}`、`apps/desktop/src-tauri/src/lib.rs`、Rust 测试。

- [ ] 先写失败测试：初始化后的模板包含清单，清单声明受管数据边界。
- [ ] 添加版本化清单和可执行的 Codex 操作协议；初始化保留模板完整性。
- [ ] 为后续受控 CLI 桥接预留明确诊断边界，不暴露通用文件系统 API。

### Task 4: 产品工程 Harness

**Files:** `AGENTS.md`、`package.json`、`.github/workflows/verify.yml`。

- [ ] 新增根级 AI 协作入口和按层验证矩阵。
- [ ] 新增顺序确定的 `check:code`、`check:native`、`verify`，避免 CLI 在 Core 类型产物之前检查。
- [ ] 新增离线 GitHub Actions 门禁。

### Task 5: 全量验证

- [ ] 运行 `pnpm verify`、打包构建、Rust 测试和 `git diff --check`。
- [ ] 审计任务归档、模板边界、App 操作和无真实外部操作的证据。
