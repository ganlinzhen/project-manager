# 个人工作管理助手 MVP 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 交付一个可在本机跑通“注册项目 → 创建任务与本地产物/工作树 → 更新进展 → 管理命名开发服务 → 在桌面看板和详情页查看及操作”的单用户工作管理器 MVP。

**Architecture:** 使用 pnpm workspace 承载 TypeScript Core、`wm` CLI 与 Tauri/React 桌面端。Core 是所有领域操作的唯一实现，SQLite 保存结构化状态和事件，仓库内 Markdown 保存长文本产物；CLI 和桌面端均只调用 Core（桌面端经 Tauri 的受控 CLI 子进程）。外部 Git、`gh`/`glab` 和进程操作包装为可替换适配器，以命令替身完成测试，不触碰真实远程仓库。

**Tech Stack:** Node.js 22、TypeScript、pnpm、Vitest、Zod、YAML、better-sqlite3、React、Vite、Tauri 2、Rust。

## 全局约束

- `wm` 是结构化任务操作的唯一入口；App 不直接写 SQLite 或操作 Git。
- SQLite 默认位于 macOS Application Support，Markdown 位于工作管理仓库的 `data/artifacts/<taskId>/`。
- 项目 Issue 提供方只能是 `github`、`gitlab` 或 `none`；不读取或保存任何 CLI 凭证。
- 不实现自动 push、PR 创建/合并、删除分支或删除 worktree。
- 所有外部命令使用参数数组和受控 cwd；所有文件路径先归一化并限制在允许根目录内。
- 每个成功或失败的任务、Issue、worktree、服务操作都写入不含敏感值的不可变事件。
- 不自动提交 Git 变更。

## 文件结构

| 路径 | 职责 |
| --- | --- |
| `package.json`、`pnpm-workspace.yaml`、`tsconfig.base.json` | workspace、脚本和 TypeScript 基础配置 |
| `packages/core/src/` | 领域模型、数据库迁移、仓储、服务与外部适配器 |
| `packages/core/test/` | Core 单元及集成测试，使用临时目录、临时 SQLite 和命令替身 |
| `packages/cli/src/` | `wm` 参数解析、JSON 契约和人类可读渲染 |
| `packages/cli/test/` | CLI 黑盒测试 |
| `apps/desktop/src/` | 看板、详情、筛选和操作状态 UI |
| `apps/desktop/src-tauri/` | 受控 `wm --json` 调用及 Tauri 命令定义 |
| `projects/*.yaml` | 本地项目配置样例 |
| `data/artifacts/` | 运行时 Markdown 产物（忽略具体任务内容） |

---

### Task 1: 初始化 workspace 与可重复测试环境

**Files:**
- Create: `package.json`
- Create: `pnpm-workspace.yaml`
- Create: `tsconfig.base.json`
- Create: `.gitignore`
- Create: `packages/core/package.json`
- Create: `packages/core/vitest.config.ts`
- Create: `packages/core/src/index.ts`
- Create: `packages/core/test/smoke.test.ts`

**Interfaces:**
- Produces: `@work-manager/core` 可由 CLI 和 App 依赖；`pnpm test`、`pnpm build` 为统一验证入口。

- [x] **Step 1: 写出 workspace 冒烟失败测试**

```ts
import { describe, expect, it } from 'vitest';
import { WORK_MANAGER_VERSION } from '../src/index.js';

describe('core package', () => {
  it('exports its version', () => expect(WORK_MANAGER_VERSION).toBe('0.1.0'));
});
```

- [x] **Step 2: 运行测试确认失败**

Run: `pnpm --filter @work-manager/core test --run`

Expected: FAIL，因为 package、测试配置或导出尚未存在。

- [x] **Step 3: 建立最小工作区和导出**

```ts
// packages/core/src/index.ts
export const WORK_MANAGER_VERSION = '0.1.0';
```

根 `package.json` 定义 `test`、`build`、`lint` 脚本，使用 Node 22、pnpm 和 Vitest；`.gitignore` 忽略 `node_modules`、`dist`、`target`、运行时数据库及 `data/artifacts/*`。

- [x] **Step 4: 验证基础环境**

Run: `pnpm install && pnpm --filter @work-manager/core test --run && pnpm build`

Expected: 全部 PASS。

### Task 2: 实现配置、路径边界、状态机和 SQLite 事件存储

**Files:**
- Create: `packages/core/src/domain.ts`
- Create: `packages/core/src/errors.ts`
- Create: `packages/core/src/config.ts`
- Create: `packages/core/src/paths.ts`
- Create: `packages/core/src/database.ts`
- Create: `packages/core/src/task-repository.ts`
- Create: `packages/core/test/config.test.ts`
- Create: `packages/core/test/task-repository.test.ts`

**Interfaces:**
- Produces: `ProjectConfig`、`TaskStatus`、`TaskRecord`、`EventRecord`、`WorkManagerDatabase`、`TaskRepository`。
- Consumes: Task 1 的 TypeScript/Vitest 基础设施。

- [x] **Step 1: 为 YAML、路径与状态规则写失败测试**

```ts
expect(parseProjectConfig(yaml)).toMatchObject({ id: 'demo', issue: { provider: 'none' } });
expect(() => assertWithinRoots('/tmp/outside', ['/repo'])).toThrow('PATH_OUTSIDE_ALLOWED_ROOT');
expect(canTransition('ready', 'in_progress')).toBe(true);
expect(canTransition('done', 'ready')).toBe(false);
```

- [x] **Step 2: 运行针对性测试确认失败**

Run: `pnpm --filter @work-manager/core test --run test/config.test.ts test/task-repository.test.ts`

Expected: FAIL，缺少领域函数和数据库实现。

- [x] **Step 3: 编写最小实现和迁移**

实现 Zod 校验的项目 YAML（`id`、仓库绝对路径、默认分支、单一 Issue provider、服务配置），并迁移创建 `projects`、`tasks`、`task_artifacts`、`task_events`、`development_services` 表。分配编号使用事务中的项目计数，事件用 `appendEvent()` 只追加；公开 `transitionTask(id, toStatus)` 并拒绝非法迁移。

- [x] **Step 4: 验证迁移和原子编号**

Run: `pnpm --filter @work-manager/core test --run test/config.test.ts test/task-repository.test.ts`

Expected: PASS；同一项目连续创建返回 `DEMO-1`、`DEMO-2`，即使任务结束也不复用。

### Task 3: 实现 Markdown 产物与任务创建/进展/恢复 Core 闭环

**Files:**
- Create: `packages/core/src/artifact-service.ts`
- Create: `packages/core/src/task-service.ts`
- Create: `packages/core/test/task-service.test.ts`
- Create: `packages/core/test/fixtures/demo.yaml`

**Interfaces:**
- Consumes: `TaskRepository`、`ProjectConfig`、路径校验。
- Produces: `TaskService.createTask()`、`retryTask()`、`updateProgress()`、`pauseTask()`、`resumeTask()`、`completeTask()`、`getTaskDetail()`。

- [x] **Step 1: 写创建、部分失败和进展原子写入的失败测试**

```ts
const result = await service.createTask({ projectId: 'demo', title: '登录页', type: 'feature', priority: 'high' });
expect(result.task.id).toBe('DEMO-1');
expect(await readFile(result.artifacts.progressPath, 'utf8')).toContain('下一步行动');

await service.updateProgress('DEMO-1', { current: '完成表单', next: '补充校验' });
expect(repository.getTask('DEMO-1')?.nextAction).toBe('补充校验');
expect(repository.listEvents('DEMO-1').at(-1)?.type).toBe('progress_updated');
```

- [x] **Step 2: 运行测试确认失败**

Run: `pnpm --filter @work-manager/core test --run test/task-service.test.ts`

Expected: FAIL，服务与 Markdown 原子写入尚未实现。

- [x] **Step 3: 实现任务闭环**

在 `data/artifacts/<taskId>/` 创建 `requirements.md`、`context.md`、`plan.md`、`progress.md`、`completion.md` 模板。写文件使用同目录临时文件和 `rename`；任务字段与事件置于同一 SQLite 事务。外部步骤异常时保留成功资源，记录 `operation_failed`，返回 `{ code, message, recoverable, suggestedCommand, completedSteps }`，`retryTask` 只执行缺失步骤。

- [x] **Step 4: 验证完整闭环与失败诊断**

Run: `pnpm --filter @work-manager/core test --run test/task-service.test.ts`

Expected: PASS；不产生重复 ID 或覆盖已有成功资源。

### Task 4: 实现 Git/worktree 与多服务适配器及 doctor

**Files:**
- Create: `packages/core/src/command-runner.ts`
- Create: `packages/core/src/workspace-service.ts`
- Create: `packages/core/src/environment-service.ts`
- Create: `packages/core/src/doctor-service.ts`
- Create: `packages/core/test/workspace-service.test.ts`
- Create: `packages/core/test/environment-service.test.ts`
- Create: `packages/core/test/doctor-service.test.ts`

**Interfaces:**
- Consumes: `TaskService`、`ProjectConfig.development.services`、`appendEvent()`。
- Produces: `createWorktree(taskId)`、`startService(taskId, serviceKey)`、`stopService(taskId, serviceKey)`、`getEnvironmentStatus(taskId)`、`doctor(taskId)`。

- [x] **Step 1: 用命令替身写失败测试**

```ts
const runner = new FakeCommandRunner([{ argv: ['git', 'worktree', 'add'], stdout: '' }]);
await workspace.createWorktree('DEMO-1');
expect(repository.getTask('DEMO-1')?.worktreePath).toBe('/repo/.work-manager/DEMO-1');

await environment.startService('DEMO-1', 'web');
expect(repository.getService('DEMO-1', 'web')?.status).toBe('running');
expect((await doctor.check('DEMO-1')).ok).toBe(true);
```

- [x] **Step 2: 运行测试确认失败**

Run: `pnpm --filter @work-manager/core test --run test/workspace-service.test.ts test/environment-service.test.ts test/doctor-service.test.ts`

Expected: FAIL，适配器尚未定义。

- [x] **Step 3: 实现安全适配器**

`CommandRunner.run(argv, { cwd })` 不使用 shell。worktree 目录固定在注册仓库内的受控 `.work-manager/<taskId>`，分支名由受限 slug 模板生成。服务用 `spawn` 记录 PID、端口、健康检查 URL 和错误，只检查 PID 与可选 HTTP URL；停止仅终止指定服务。doctor 输出数据库、产物、分支/worktree、Issue、服务的事实和 `suggestedCommand`。

- [x] **Step 4: 验证多服务互不干扰**

Run: `pnpm --filter @work-manager/core test --run test/workspace-service.test.ts test/environment-service.test.ts test/doctor-service.test.ts`

Expected: PASS；停止 `web` 不影响 `api`，路径越界和失败命令均留下事件。

### Task 5: 实现 GitHub/GitLab Issue 适配器与幂等重试

**Files:**
- Create: `packages/core/src/issue-service.ts`
- Create: `packages/core/src/github-issue-provider.ts`
- Create: `packages/core/src/gitlab-issue-provider.ts`
- Create: `packages/core/test/issue-service.test.ts`

**Interfaces:**
- Consumes: `CommandRunner`、项目 `issue.provider` 和 `TaskRepository`。
- Produces: `IssueProvider.validateProject()`、`createIssue()`、`getIssue()`、`attachIssue()`、`IssueService`。

- [x] **Step 1: 为两种平台接口一致性写失败测试**

```ts
for (const provider of [githubProvider, gitlabProvider]) {
  const issue = await provider.createIssue({ repository: 'group/repo', title: '登录页', body: '...' });
  expect(issue).toMatchObject({ number: expect.any(Number), url: expect.stringMatching(/^https:/) });
}
```

- [x] **Step 2: 运行测试确认失败**

Run: `pnpm --filter @work-manager/core test --run test/issue-service.test.ts`

Expected: FAIL，提供方接口尚未实现。

- [x] **Step 3: 实现提供方和关联规则**

GitHub 使用 `gh auth status`、`gh issue create --repo ... --title ... --body ... --json number,url`；GitLab 使用 `glab auth status`、`glab issue create --repo ... --title ... --description ... --output json`。均通过参数数组调用并解析 JSON；`none` 返回稳定 `ISSUE_DISABLED`。创建成功立即持久化 `issue_provider`、编号和 URL，重试先读取已持久化字段避免再次创建。

- [x] **Step 4: 验证认证失败与已有 Issue 关联**

Run: `pnpm --filter @work-manager/core test --run test/issue-service.test.ts`

Expected: PASS；测试断言命令参数不含令牌，认证失败可恢复且带建议命令。

### Task 6: 提供 JSON 优先的 `wm` CLI 与端到端本地闭环

**Files:**
- Create: `packages/cli/package.json`
- Create: `packages/cli/src/main.ts`
- Create: `packages/cli/src/json-response.ts`
- Create: `packages/cli/src/container.ts`
- Create: `packages/cli/test/cli.test.ts`
- Create: `projects/demo.yaml`
- Modify: `package.json`

**Interfaces:**
- Consumes: 所有 Core 服务。
- Produces: `wm project validate`、`wm task create/retry/progress/doctor/list/show/pause/resume/complete`、`wm task attach-issue`、`wm env start/stop/status`。

- [x] **Step 1: 写 CLI 黑盒失败测试**

```ts
const created = await runWm(['task', 'create', '--project', 'demo', '--title', '闭环任务', '--type', 'feature', '--priority', 'high', '--json']);
expect(created.json).toMatchObject({ ok: true, data: { task: { id: 'DEMO-1', status: 'ready' } } });

const progress = await runWm(['task', 'progress', 'DEMO-1', '--current', '实现中', '--next', '运行测试', '--json']);
expect(progress.json.data.task.nextAction).toBe('运行测试');
```

- [x] **Step 2: 运行测试确认失败**

Run: `pnpm --filter @work-manager/cli test --run test/cli.test.ts`

Expected: FAIL，CLI 包和命令还不存在。

- [x] **Step 3: 实现命令与稳定 JSON 响应**

响应固定为 `{ ok: true, data }` 或 `{ ok: false, error: { code, message, recoverable, suggestedCommand } }`。非 JSON 模式仅渲染同一响应的人类摘要；所有写操作传入事件操作者 `cli`。提供 `demo.yaml`（`issue.provider: none`、可选 `web` 服务）以运行完全离线闭环。

- [x] **Step 4: 验证真实本地 CLI 流程**

Run: `pnpm wm task create --project demo --title "闭环任务" --type feature --priority high --create-worktree --json && pnpm wm task progress DEMO-1 --current "实现中" --next "运行测试" --json && pnpm wm task doctor DEMO-1 --json`

Expected: 三条命令均返回 `ok: true`；实际 Git worktree 使用临时测试仓库或明确的样例仓库，绝不修改用户未注册仓库。

### Task 7: 创建最小 Tauri/React 桌面端并接入受控 CLI

**Files:**
- Create: `apps/desktop/package.json`
- Create: `apps/desktop/vite.config.ts`
- Create: `apps/desktop/src/main.tsx`
- Create: `apps/desktop/src/api/wm.ts`
- Create: `apps/desktop/src/pages/BoardPage.tsx`
- Create: `apps/desktop/src/pages/TaskDetailPage.tsx`
- Create: `apps/desktop/src/components/TaskCard.tsx`
- Create: `apps/desktop/src/components/OperationFeedback.tsx`
- Create: `apps/desktop/src-tauri/Cargo.toml`
- Create: `apps/desktop/src-tauri/src/lib.rs`
- Create: `apps/desktop/src-tauri/tauri.conf.json`
- Create: `apps/desktop/src/test/board.test.tsx`
- Create: `apps/desktop/src/test/detail.test.tsx`

**Interfaces:**
- Consumes: CLI JSON 契约，`invoke('wm_command', { args })`。
- Produces: 看板/详情 UI、受控命令白名单和显式加载/成功/失败状态。

- [x] **Step 1: 为看板和详情操作写失败测试**

```tsx
render(<BoardPage tasks={[activeTask, doneTask]} />);
expect(screen.getByText('下一步：运行测试')).toBeInTheDocument();
expect(screen.queryByText(doneTask.title)).not.toBeInTheDocument();

render(<TaskDetailPage task={activeTask} onStartService={vi.fn()} />);
await user.click(screen.getByRole('button', { name: '启动 web' }));
expect(onStartService).toHaveBeenCalledWith('DEMO-1', 'web');
```

- [x] **Step 2: 运行 UI 测试确认失败**

Run: `pnpm --filter @work-manager/desktop test --run`

Expected: FAIL，因为 React 页面和组件不存在。

- [x] **Step 3: 实现界面与 Tauri 边界**

默认看板展示 `in_progress`、`blocked`、`ready`，支持项目/状态/优先级/文本筛选；卡片展示标题状态、下一步、项目优先级、更新时间和阻塞/服务摘要。详情展示概览、产物入口、资源、服务和事件。Rust 层只接受列出的 `wm` 子命令，强制附加 `--json`，无 shell 执行；UI 仅提供复制上下文、Finder 打开 worktree、打开 URL、服务启停、暂停/恢复/完成。

- [x] **Step 4: 验证前端与桌面构建**

Run: `pnpm --filter @work-manager/desktop test --run && pnpm --filter @work-manager/desktop build && pnpm tauri build --config apps/desktop/src-tauri/tauri.conf.json`

Expected: 单元测试和前端构建 PASS；Tauri 构建在已安装 macOS 工具链的环境中通过。

### Task 8: 端到端验证、错误恢复与安全回归

**Files:**
- Create: `packages/core/test/e2e-flow.test.ts`
- Create: `docs/verification/2026-07-17-mvp-verification.md`
- Modify: `README.md`

**Interfaces:**
- Consumes: Tasks 1–7 的 CLI、Core 和桌面端 UI。
- Produces: 可重复运行的离线验收记录与使用说明。

- [x] **Step 1: 写端到端失败测试**

```ts
it('creates, resumes and completes a task without duplicating external resources', async () => {
  const first = await app.create({ projectId: 'demo', createWorktree: true });
  fakeGit.failNext('worktree add');
  const retried = await app.retry(first.task.id);
  expect(retried.task.id).toBe(first.task.id);
  expect(fakeGit.calls('worktree add')).toHaveLength(2);
  expect(app.events(first.task.id).some((event) => event.type === 'operation_failed')).toBe(true);
});
```

- [x] **Step 2: 运行失败测试确认前置能力缺口**

Run: `pnpm --filter @work-manager/core test --run test/e2e-flow.test.ts`

Expected: 在 Task 1–7 未完成前 FAIL；完成后 PASS。

- [x] **Step 3: 补齐测试和文档**

覆盖 GitHub/GitLab 命令替身、服务局部停止、doctor 不一致项、路径逃逸、JSON 错误契约与 App 筛选/操作反馈。README 说明安装、项目配置、离线 demo、数据库位置和“默认保留资源”限制；验证记录列出实际运行命令和结果，不记录任何凭证。

- [x] **Step 4: 执行发布前验证**

Run: `pnpm test && pnpm build && pnpm wm task list --json`

Expected: 所有自动化测试和构建通过；CLI 返回合法 JSON；验证记录明确标注 Tauri 打包是否受本机 Xcode/Rust 环境限制。

## 自检

- 设计中的核心基础、CLI、worktree、多服务、双 Issue、桌面端、doctor 和部分失败重试均有对应任务。
- 不包含云同步、远程 push/PR、资源删除、终端启动或进程守护等超出 V1 范围的功能。
- 所有跨任务接口均在任务说明中给出，所有测试命令均可从 workspace 根目录运行。
- 计划不自动提交任何内容，遵循仓库约束。
