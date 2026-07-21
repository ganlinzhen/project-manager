# 工作管理仓库模板与 Demo 项目 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (- [ ]) syntax for tracking.

**Goal:** 提供可复制的工作管理仓库模板，并让 mode: demo 项目在不连接真实外部资源时展示可操作的本地示例任务。

**Architecture:** 项目配置增加默认值为 real 的模式字段，真实项目继续走既有严格校验。CLI 在 demo 模式跳过外部校验，运行时通过独立的种子服务向现有 SQLite 与工件服务写入一次性示例数据；桌面端透传项目模式并显示演示边界。

**Tech Stack:** TypeScript、Zod、Vitest、SQLite、YAML、React、Tauri。

## Global Constraints

- Node.js 不低于 22.13，包管理器使用 pnpm 10。
- 真实项目的仓库、Git、Issue 和服务校验不得改变或放宽。
- mode: demo 不创建真实 Git 分支、worktree、Issue 或开发进程。
- 所有用户可见文本、注释和模板文档使用简体中文。
- 不自动提交、推送或创建 PR。

---

## 文件结构

- packages/core/src/domain.ts：定义项目模式并将其透传到项目配置对象。
- packages/core/src/config.ts：解析 mode，默认 real。
- packages/core/src/demo-seed.ts：只负责 demo 项目的一次性任务与 Markdown 工件初始化。
- packages/core/src/index.ts：导出种子服务。
- packages/core/test/core.test.ts：覆盖配置模式和种子幂等性。
- packages/cli/src/main.ts：初始化 demo 数据、返回 demo 校验结果并禁止 demo 外部资源操作。
- packages/cli/test/cli.test.ts：覆盖 CLI 演示校验、示例数据和外部操作拒绝。
- apps/desktop/src/types.ts：为任务详情项目元数据添加 mode。
- apps/desktop/src/pages/TaskDetailPage.tsx：展示演示标识，并使 demo 服务操作不可用。
- apps/desktop/src/test/ui.test.tsx：覆盖 demo 标识与禁用提示。
- templates/work-manager：可复制的工作管理仓库与 Demo 配置、Codex 约定、规范文档。

### Task 1: 项目模式和 Demo 种子服务

**Files:**
- Modify: packages/core/src/domain.ts
- Modify: packages/core/src/config.ts
- Create: packages/core/src/demo-seed.ts
- Modify: packages/core/src/index.ts
- Modify: packages/core/test/core.test.ts

**Interfaces:**
- Consumes: TaskRepository、TaskService、ArtifactService、ProjectConfig。
- Produces: ProjectMode = real | demo、ProjectConfig.mode、seedDemoProjects(runtime)。

- [ ] **Step 1: 写入失败测试，固定配置模式与种子效果。**

~~~ts
it('未声明模式时使用 real，声明 demo 时保留 demo', async () => {
  expect((await loadProjectConfig(realConfigPath)).mode).toBe('real');
  expect((await loadProjectConfig(demoConfigPath)).mode).toBe('demo');
});

it('只为没有任务的 demo 项目初始化四条工件完整的示例任务', async () => {
  await seedDemoProject(project, taskService, repository);
  expect(repository.listTasks({ projectId: 'demo' })).toHaveLength(4);
  await expect(readFile(path.join(managerRoot, 'data', 'artifacts', 'DEMO-1', 'requirements.md'), 'utf8')).resolves.toContain('演示');
  await seedDemoProject(project, taskService, repository);
  expect(repository.listTasks({ projectId: 'demo' })).toHaveLength(4);
});
~~~

- [ ] **Step 2: 运行失败测试。**

运行：pnpm --filter @work-manager/core test --run packages/core/test/core.test.ts

预期：测试失败，原因是 mode 或 seedDemoProject 尚不存在。

- [ ] **Step 3: 最小实现模式和种子。**

~~~ts
export type ProjectMode = 'real' | 'demo';

export interface ProjectConfig {
  mode: ProjectMode;
  // 保留其余既有字段
}

const projectSchema = z.object({
  // 保留其余既有字段
  mode: z.enum(['real', 'demo']).default('real')
});
~~~

Demo 种子只在 project.mode 等于 demo 且该项目没有任务时运行。创建四条固定任务，覆盖 ready、in_progress、blocked、done，并用 ArtifactService 创建完整工件。直接使用已有仓储状态迁移；不要新增只服务于 demo 的 TaskService 公共方法。任何种子写入失败都应抛错。

- [ ] **Step 4: 运行 Core 测试。**

运行：pnpm --filter @work-manager/core test --run packages/core/test/core.test.ts

预期：退出码为 0，模式默认值、demo 模式和种子幂等性通过。

### Task 2: CLI 的 demo 校验、初始化与外部操作保护

**Files:**
- Modify: packages/cli/src/main.ts
- Modify: packages/cli/test/cli.test.ts

**Interfaces:**
- Consumes: ProjectConfig.mode、demo 种子服务、既有 Runtime。
- Produces: demo 校验响应和 DEMO_EXTERNAL_OPERATION_FORBIDDEN 错误。

- [ ] **Step 1: 写入失败 CLI 测试。**

~~~ts
it('demo 项目跳过外部校验并初始化展示任务', async () => {
  const config = await demoRuntime();
  const validation = await run(['project', 'validate', 'demo', '--json'], config);
  expect(validation).toMatchObject({
    ok: true,
    data: { valid: true, skippedChecks: ['repository', 'git', 'branch', 'services', 'issue'] }
  });
  const tasks = await run(['task', 'list', '--all', '--json'], config);
  expect(tasks).toMatchObject({
    ok: true,
    data: { tasks: expect.arrayContaining([expect.objectContaining({ projectId: 'demo' })]) }
  });
});

it('demo 项目拒绝创建 worktree', async () => {
  const response = await run(
    ['task', 'create', '--project', 'demo', '--title', '不连接真实仓库', '--create-worktree', '--json'],
    await demoRuntime()
  );
  expect(response).toMatchObject({ ok: false, error: { code: 'DEMO_EXTERNAL_OPERATION_FORBIDDEN' } });
});
~~~

- [ ] **Step 2: 运行失败测试。**

运行：pnpm --filter @work-manager/cli test --run packages/cli/test/cli.test.ts

预期：demo 校验会访问占位仓库路径而失败，且外部操作尚未受保护。

- [ ] **Step 3: 最小实现运行时初始化和模式分支。**

在 executeCli 创建 Runtime 后调用 demo 种子。对 project validate，若项目为 demo，直接返回下列数据且不调用 access、git、Issue 或服务校验：

~~~ts
{
  project,
  issue: { provider: 'none', accessible: true },
  services: [],
  skippedChecks: ['repository', 'git', 'branch', 'services', 'issue'],
  valid: true
}
~~~

在 task create 带 create-worktree 或 create-issue、task retry、env start、env stop 进入相应服务前，若目标项目为 demo，抛出：

~~~ts
Object.assign(new Error('演示项目不连接真实仓库或外部服务'), {
  code: 'DEMO_EXTERNAL_OPERATION_FORBIDDEN'
});
~~~

保留列表、详情、进展、暂停、恢复、完成、重开和读取工件等纯本地操作。

- [ ] **Step 4: 运行 CLI 测试。**

运行：pnpm --filter @work-manager/cli test --run packages/cli/test/cli.test.ts

预期：退出码为 0；原有真实 Git worktree、服务和 doctor 测试继续通过。

### Task 3: 桌面端 Demo 反馈与安全边界

**Files:**
- Modify: apps/desktop/src/types.ts
- Modify: apps/desktop/src/pages/TaskDetailPage.tsx
- Modify: apps/desktop/src/test/ui.test.tsx

**Interfaces:**
- Consumes: CLI task show 返回的 project.mode。
- Produces: 详情页的演示标签、说明文字和不可操作的服务区块。

- [ ] **Step 1: 写入失败 UI 测试。**

~~~tsx
it('演示项目显示连接边界且不提供服务启动操作', () => {
  render(
    <TaskDetailPage
      detail={{ ...detail, project: { id: 'demo', name: 'Demo', mode: 'demo' } }}
      pendingAction={null}
      feedback={null}
      onBack={vi.fn()}
      onAction={vi.fn()}
    />
  );
  expect(screen.getByText('演示项目')).toBeInTheDocument();
  expect(screen.getByText('演示项目不连接真实仓库或开发服务。')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: '启动 web' })).not.toBeInTheDocument();
});
~~~

- [ ] **Step 2: 运行失败测试。**

运行：pnpm --filter @work-manager/desktop test --run apps/desktop/src/test/ui.test.tsx

预期：失败信息包含找不到“演示项目”。

- [ ] **Step 3: 最小实现模式透传和安全提示。**

~~~ts
project: {
  id: string;
  name: string;
  mode?: 'real' | 'demo';
  repositoryPath?: string;
  issue?: { provider: string };
};
~~~

在 TaskDetailPage 中计算 isDemo。isDemo 为真时显示“演示项目”标签和“演示项目不连接真实仓库或开发服务。”，以同一位置的说明文本替换服务启动/停止按钮。保持复制上下文、暂停、恢复、完成和工件阅读操作不变。

- [ ] **Step 4: 运行桌面 UI 测试。**

运行：pnpm --filter @work-manager/desktop test --run apps/desktop/src/test/ui.test.tsx

预期：退出码为 0；既有服务控制测试和新增 demo 测试通过。

### Task 4: 可复制模板与规范文档

**Files:**
- Create: templates/work-manager/README.md
- Create: templates/work-manager/AGENTS.md
- Create: templates/work-manager/projects/demo.yaml
- Create: templates/work-manager/project-rules/demo.md
- Create: templates/work-manager/docs/工作管理仓库规范.md
- Create: templates/work-manager/data/artifacts/.gitkeep

**Interfaces:**
- Consumes: 已实现的 mode: demo 和既有 projects/*.yaml 约定。
- Produces: 一个可复制、可配置且包含可展示 demo 项目的目录。

- [ ] **Step 1: 建立模板 README 和根级协作约定。**

README 写明：复制模板、在桌面设置中填写复制后根目录、运行 pnpm wm project validate demo --json；同时说明 demo 是本地 mock 数据。AGENTS.md 写明：按项目处理需求前读取 project-rules/<项目 ID>.md；规则缺失时先确认，再进行 Git、发布或外部操作。

- [ ] **Step 2: 建立 demo 项目和项目规则示例。**

~~~yaml
id: demo
name: Demo 演示项目
taskPrefix: DEMO
mode: demo
repositoryPath: /__work-manager-demo__/repository
defaultBranch: main
issue:
  provider: none
development:
  services: {}
~~~

project-rules/demo.md 示范项目定位、分支命名、合并前验证、部署方式和禁止事项；每项都标记为 mock，不可照搬到生产。

- [ ] **Step 3: 编写工作管理仓库规范。**

规范定义目录职责、项目 YAML 与项目规则文档边界、规则优先级、任务工件路径、命名规则和新增真实项目的最小步骤。明确真实项目使用 mode: real 或省略 mode，且必须通过真实校验。

- [ ] **Step 4: 使用临时副本验证模板。**

运行：template_root=$(mktemp -d)/work-manager && cp -R templates/work-manager "$template_root" && WM_MANAGER_ROOT="$template_root" WM_PROJECTS_DIR="$template_root/projects" WM_DATABASE_PATH="$template_root/work-manager.db" pnpm wm task list --all --json

预期：JSON 响应 ok 为 true，包含四条 projectId 为 demo 的任务；不访问真实仓库路径。

### Task 5: 全量验证与交付检查

**Files:**
- Verify: 所有本次修改文件

**Interfaces:**
- Consumes: Tasks 1–4。
- Produces: 可复现的测试与模板加载证据。

- [ ] **Step 1: 运行类型检查。**

运行：pnpm typecheck

预期：退出码为 0。

- [ ] **Step 2: 运行完整测试。**

运行：pnpm test

预期：退出码为 0，Core、CLI 与桌面测试全部通过。

- [ ] **Step 3: 构建全部包。**

运行：pnpm build

预期：退出码为 0。

- [ ] **Step 4: 检查工作区变更与模板内容。**

运行：git diff --check && git status --short && find templates/work-manager -type f | sort

预期：无空白错误，列出六类模板文件；不执行 git add、git commit、git push 或创建 PR。

