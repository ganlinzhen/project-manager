# 双层 Harness Engineering 设计

## 目标

让 Codex 能稳定维护工作管理器产品，也让由模板初始化出的用户工作目录成为安全、可诊断的数据操作环境。任务删除采用可恢复归档，不删除 SQLite、工件或审计事件。

## 两层边界

- 产品工程 Harness：根级协作规则、统一验证、跨 Core/CLI/Tauri/UI 的契约测试和 CI。
- 用户工作目录 Harness：模板版本清单、Codex 操作规约、受控 CLI 入口和工作区诊断。
- 初始化契约：Tauri 复制模板时写入运行时桥接信息；工作区只通过该入口改变任务数据。

## 任务归档

`tasks` 增加 `archived_at` 与 `archived_reason`。归档不改变 `status`，默认列表排除 `archived_at IS NOT NULL` 的任务；`--archived` 可查询，恢复只清除归档字段。归档与恢复均写入 append-only 事件。

## 工作目录数据规约

SQLite 只能被 Core/CLI/App 写入，`data/artifacts/` 只能由任务服务维护；Codex 不得手改二者。模板中的项目 YAML 是配置入口，变更后必须校验。受控入口返回 JSON，调用方必须检查 `ok`，再以 `task show` 或 `task doctor` 验证。

## 非目标

不永久删除任务、不自动提交/推送、不访问真实远程平台、不建立全局 CLI 安装，也不以 Demo 绕过真实项目验证。
