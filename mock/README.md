# 开发 Mock

此目录只存放 `Project-Manager` 产品仓库的开发与手动验证样例，不是用户实际使用的工作管理仓库。

- `projects/`：本机开发用项目配置样例；
- `data/artifacts/`：运行样例任务时生成的 Markdown 工件，具体任务目录被 Git 忽略。

实际使用时，桌面应用会从 `templates/work-manager` 创建或复制一份独立的工作管理仓库；任务数据应写入那份独立目录，而不是本目录。
