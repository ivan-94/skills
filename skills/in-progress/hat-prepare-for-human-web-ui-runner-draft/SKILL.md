---
name: hat-prepare-for-human
description: 基于已有 /hat-prepare 产物生成一次性人类验收 Web UI runner，将 guide.md/prepare.sh 转成开发者可点击执行、可记录结果的本地验收向导界面。Use when a user wants a human-friendly HAT runner, mentions hat-prepare-for-human, or wants developers to run manual acceptance from an existing HAT guide.
---

# HAT Prepare For Human

`hat-prepare-for-human` 是 `/hat-prepare` 之后的流程。它读取已有 HAT 目录，把 `guide.md`、`prepare.sh`、项目运行入口和验收清单转换成一次性本地 Web UI runner, 这是一个向导程序，方便人类开发者启动环境、准备数据、执行 P0/P1/P2 验收并记录结果。

默认产物写入同一个 HAT 目录：

```text
hats/YYYYMMDD-title/
  guide.md
  prepare.sh
  hat-human.py|js|ts
  human-results.jsonl
```

## 输入

- 用户指定 HAT 目录或 `guide.md` 时，基于该目录生成。
- 未指定时，扫描当前 repo 的 `hats/*/guide.md`；只有一个可自动选择，多个则让用户指定。
- 必须基于已有 `/hat-prepare` 产物：读取 `guide.md`，并在存在时复用 `prepare.sh`。
- 读取 repo 的 `README*`、`AGENTS.md`/`CLAUDE.md`、`HAT.md`、`.agent/`、package/runtime 配置、已有 seed/account/start 脚本，理解如何把 HAT 转成可点击 UI。

## 工作流

1. **Discovery**(强制 Fan out 一个小规模的探索 Agent 来完成这个步骤, 详细探索确保有足够的信息来生成向导)
   - 探索被验收原始业务需求，以及相关实现文件（如果有 Source Manifest, 要详细探索），了解需求背景和实现情况，方便确定验收的目标和访问。
   - 定位 HAT 目录，读取 `guide.md`、`prepare.sh`、`HAT.md` 等验收文件。确定要验收的范围和目标。
   - 探测项目现有 runtime、framework、脚本、agent runtime、服务 URL、seed/账号准备入口。
   - 解析验收账号、准备步骤、P0/P1/P2 checklist、外部服务和阻塞项。

2. **技术选型**
   - 单文件 runner cli。
   - 不额外安装项目之外的依赖。
   - 探索项目依赖，优先复用项目已有 runtime、framework 和 helper。 比如 fastapi, express.js, 这样代码会更简洁。
   - 若没有合适依赖可复用，再使用语言标准库。
   - 选择能方便启动本地 Web UI、执行 prepare/runtime/action、写入 `human-results.jsonl` 的方案。

3. **先计划，后生成**
   - 生成文件前必须先输出实现计划，并等待用户确认。
   - 计划至少列出：
      - 验收的目标和范围和实现情况。
      - 选中的 HAT 目录；`guide.md`/`prepare.sh`；探测到的 runtime/framework/agent runtime；runner 技术选型和理由和 tradeoff；准备写入的文件；
      - UI 中的 prepare steps、accounts、P0/P1/P2 cases、actions/methods；验证命令等详细步骤规划。

4. **生成 runner**
   - 文件名前缀固定为 `hat-human`，扩展名随技术选型变化。
   - runner 内嵌或生成结构化 HAT spec；运行时可直接渲染 UI。
   - 从 `guide.md` 提取 case id、priority、title、preconditions、steps、expected、evidence hints；格式不规整时保留原文片段作为 UI fallback。
   - 再次运行时默认更新同名 runner；如果用户要求保留历史，再生成带版本后缀的副本。

5. **验证**
   - 生成后运行对应技术栈的语法/解析检查，例如 `python -m py_compile hats/.../hat-human.py`、`node --check hats/.../hat-human.js`、`deno check hats/.../hat-human.ts`。
   - 最终回复列出 runner 路径、基于的 guide、技术选型、结果文件、验证命令和启动命令。

## Agent Runtime

如果项目支持 agent runtime，runner 优先围绕 agent runtime 工作：

- 从 `.agent/`、`AGENTS.md`/`CLAUDE.md`、`HAT.md`、runtime manifest、runtime 启动脚本中发现入口。
- 环境启动、seed、账号准备、health check、验收辅助命令优先在 agent runtime 内执行。
- UI 展示 runtime 状态、启动、停止、日志、服务 URL 等简单管理能力。
- 验收动作调用 runtime 暴露的服务、端口、命令或容器环境。

## UI 参考

```text
+--------------------------------------------------------------------------------+
| HAT Human Runner: <feature/title>                         Status: Preparing    |
| Guide: hats/20260516-feature/guide.md                     Results: jsonl       |
+--------------------------------------------------------------------------------+
| Runtime / Environment                                                          |
| [Start runtime] [Stop] [Health check] [Open app]                               |
| Runtime: running / stopped / unknown        App: http://localhost:3000         |
| Logs: last 20 lines...                                                         |
+--------------------------------------------------------------------------------+
| Prepare                                                                        |
| 1. Environment start          [Run] [Pass] [Fail]                              |
| 2. Seed data                  [Run] [Pass] [Fail]                              |
| 3. Accounts                   [Prepare] [Edit manual account]                  |
| 4. Health check               [Run check]                                      |
+--------------------------------------------------------------------------------+
| Accounts                                                                       |
| Role          Username / Source               Status        Action             |
| Admin         hat-admin@example.com / seed     ready         [Use]              |
| User          manual                           missing       [Edit]             |
+--------------------------------------------------------------------------------+
| P0 Fast-Fail Acceptance                                                        |
| [P0-001] Login works                                      passed               |
|   Preconditions: ...                                                           |
|   Steps: [Open URL] 1. ... 2. ...                                              |
|   Expected: ...                                                                |
|   Evidence / notes: [.................................................]        |
|   [Pass] [Fail] [Blocked] [Skipped]                                            |
|                                                                                |
| [P0-002] Core workflow completes                         locked until P0-001   |
+--------------------------------------------------------------------------------+
| P1 / P2 Acceptance                                                             |
| [P1-001] Edge case A                                      not-started          |
| [P2-001] Exploratory check B                              skipped              |
+--------------------------------------------------------------------------------+
| Recent Events                                                                  |
| 15:30 prepare.seed passed                                                      |
| 15:34 HAT-P0-001 failed: login redirected unexpectedly                         |
+--------------------------------------------------------------------------------+
```

| 界面尽量使用中文


## UI 行为

- Prepare 区包含环境启动、seed、账号准备、health check 等步骤。
- Accounts 区展示角色、账号来源、租户/权限、状态和准备/编辑动作；密码和 secret 只显示来源或占位。
- P0 串行 fast-fail；前置步骤或前一个 P0 未完成时，后续 P0 不启用。
- P1/P2 在准备完成后独立执行，互不阻塞。
- case 状态使用 `not-started`、`running`、`passed`、`failed`、`blocked`、`skipped`。
- 每个 case 展示 Preconditions、Steps、Expected、Evidence/notes，并提供 Pass、Fail、Blocked、Skipped；Fail/Blocked 可填写原因。

## Action 类型

- `open_url`：打开页面链接。
- `manual`：人工说明。
- `command`：执行固定命令。
- `http`：发起固定 HTTP 请求。
- `form_http`：表单输入后请求。
- `copy_command`：展示可复制命令。
- `check`：健康检查或只读检查。
- `method`：runner 内部定制方法，封装 SQL、Celery/队列任务、seed、内部函数调用、项目特定验收辅助能力。

`method` 用于服务没有公开接口但验收需要触发内部能力的场景。它可以调用项目已有命令，也可以在 runner 内实现项目专用 helper，并在 UI 中以按钮或表单暴露给开发者。

## 结果记录

结果固定写入 `human-results.jsonl`：

- append-only，每行 JSON。
- 记录 session、prepare step、runtime 操作、command/http/method 执行、case 标记、原因、evidence、时间戳。
- 后续 agent 可直接读取该文件生成报告、定位失败原因或辅助修复。
