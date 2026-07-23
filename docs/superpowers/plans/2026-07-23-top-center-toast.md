# 顶部居中 Toast Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 用顶部居中、5 秒自动消失的 Toast 队列替换页面内操作反馈。

**Architecture:** `App` 维护通知列表并通过 `pushToast` 追加消息；新建 `ToastViewport` 只负责显示、计时、暂停、关闭和三条可见上限。应用根节点始终渲染该视口，详情页移除正文内反馈。

**Tech Stack:** React 19、TypeScript、Vitest、Testing Library、现有 CSS 与 lucide-react。

## Global Constraints

- Toast 固定在顶部居中，默认 5 秒，悬停暂停。
- 同时可见 3 条；其余按创建顺序保留在队列中。
- 失败提示使用 `role="alert"`，成功提示使用 `role="status"`。
- 不新增第三方通知依赖，不改 wm API 或 Tauri 代码。
- 不提交代码，所有修改保留在隔离 worktree。

---

### Task 1: Toast 视口与行为测试

**Files:**
- Create: `apps/desktop/src/components/ToastViewport.tsx`
- Create: `apps/desktop/src/components/ToastViewport.test.tsx`
- Modify: `apps/desktop/src/styles.css`

**Interfaces:**
- Consumes: `Feedback`（`kind`、`message`、可选 `suggestion`）。
- Produces: `Toast`（`id` 加 `Feedback`）与 `ToastViewport({ toasts, onDismiss })`。

- [x] **Step 1: 写失败测试**：使用 fake timers 断言消息在 5 秒后调用 `onDismiss`；鼠标进入时暂停、离开后继续；四条消息只渲染前三条，关闭第一条后第四条出现。
- [x] **Step 2: 运行测试确认失败**：`pnpm --filter @work-manager/desktop test -- --run ToastViewport.test.tsx`，预期因为组件不存在而失败。
- [x] **Step 3: 最小实现**：每个可见 Toast 以 `useEffect` 管理剩余毫秒；`onMouseEnter` 清除计时器并记录剩余时间，`onMouseLeave` 恢复；通过 `toasts.slice(0, 3)` 形成视口。
- [x] **Step 4: 加入 CSS**：使用 `position: fixed; top: 88px; left: 50%; transform: translateX(-50%)`，为出现/离开设置 180ms 过渡，且在 `prefers-reduced-motion` 下关闭位移动画。
- [x] **Step 5: 运行组件测试确认通过**：同上命令，预期全部 PASS。

### Task 2: 接入应用级通知队列

**Files:**
- Modify: `apps/desktop/src/App.tsx`
- Modify: `apps/desktop/src/pages/TaskDetailPage.tsx`
- Modify: `apps/desktop/src/App.test.tsx`

**Interfaces:**
- Consumes: `ToastViewport` 的 `Toast[]` 与 `onDismiss(id)`。
- Produces: `pushToast(feedback: Feedback)`，替换现有操作成功和失败的 `setFeedback`。

- [x] **Step 1: 写失败应用测试**：触发两个相继完成的操作，断言两条通知可同时存在；打开任务详情仍在顶部视口而不出现在详情正文。
- [x] **Step 2: 运行测试确认失败**：`pnpm --filter @work-manager/desktop test -- --run App.test.tsx`，预期旧的单条反馈行为不满足断言。
- [x] **Step 3: 最小实现**：以递增 `useRef` 生成稳定 id，`pushToast` 向状态数组追加，关闭按 id 过滤；将 `ToastViewport` 放在顶栏后并始终渲染；移除 `TaskDetailPage` 对旧反馈组件的渲染和属性。
- [x] **Step 4: 运行桌面端测试**：`pnpm --filter @work-manager/desktop test -- --run`，预期全部 PASS。

### Task 3: 完整验证

**Files:**
- Modify: `docs/superpowers/plans/2026-07-23-top-center-toast.md`（勾选实际完成项）

- [x] **Step 1: 类型检查**：`pnpm --filter @work-manager/desktop exec tsc --noEmit -p tsconfig.app.json`，预期退出码 0。
- [x] **Step 2: 构建桌面前端**：`pnpm --filter @work-manager/desktop build`，预期退出码 0。
- [x] **Step 3: 检查差异**：`git diff --check`，预期无输出。
