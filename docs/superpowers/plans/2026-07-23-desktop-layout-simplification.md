# 桌面端布局精简 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将桌面端的导航、项目页与任务看板收敛为参考图所示的简洁高效结构。

**Architecture:** 保持 `App.tsx` 负责页面切换和 API 调用；`ProjectListPage` 与 `BoardPage` 只调整结构和本地筛选状态；视觉令牌与响应式规则集中在 `styles.css`。

**Tech Stack:** React 19、TypeScript、Vitest、Testing Library、Lucide、CSS。

## Global Constraints

- 不修改 Core、CLI、Tauri 命令或数据模型。
- 保留同步、任务筛选、详情打开和无障碍名称。
- 不提交代码。

---

### Task 1: 回归测试

**Files:**
- Modify: `apps/desktop/src/App.test.tsx`
- Modify: `apps/desktop/src/test/ui.test.tsx`

- [ ] 为左侧导航和项目搜索添加失败测试。
- [ ] 运行 `pnpm --filter @work-manager/desktop test --run`，确认测试因新界面行为缺失而失败。

### Task 2: 应用壳与项目页

**Files:**
- Modify: `apps/desktop/src/App.tsx`
- Modify: `apps/desktop/src/pages/ProjectListPage.tsx`
- Modify: `apps/desktop/src/styles.css`

- [ ] 改为侧栏应用壳，保留现有页面切换回调。
- [ ] 在项目页添加本地搜索，工具栏仅保留搜索和同步按钮。
- [ ] 运行桌面端测试，确认项目同步和项目详情打开仍可用。

### Task 3: 精简任务看板

**Files:**
- Modify: `apps/desktop/src/pages/BoardPage.tsx`
- Modify: `apps/desktop/src/styles.css`

- [ ] 删除任务页标题和统计区域，保留筛选条与状态列。
- [ ] 使用侧栏内容区的响应式布局，保持任务卡片和筛选行为。
- [ ] 运行桌面端测试和类型检查。

### Task 4: 最终验证

**Files:**
- Verify: `apps/desktop/src/App.tsx`
- Verify: `apps/desktop/src/pages/ProjectListPage.tsx`
- Verify: `apps/desktop/src/pages/BoardPage.tsx`
- Verify: `apps/desktop/src/styles.css`

- [ ] 运行 `pnpm --filter @work-manager/desktop test --run`。
- [ ] 运行 `pnpm --filter @work-manager/desktop typecheck`。
- [ ] 运行 `git diff --check` 并检查未提交文件范围。
