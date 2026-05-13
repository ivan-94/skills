---
name: setup-agent-runtime
description: 为已有 Docker Compose 或 Dev Container 项目搭建适合并发 Agent 开发、HAT、browser acceptance 和自动检查的隔离运行环境，同时保留人类开发体验。Use when the user wants an Agent Runtime, isolated worktrees, dynamic Compose sandboxes, `.agent/bin/agent`, `.agent/bin/project`, devcontainer-to-agent-runtime refactoring, or concurrent agent execution environments.
---

# Setup Agent Runtime

为已有 Compose/devcontainer 项目搭建 Agent Runtime。目标是让 Agent 使用独立 git worktree、独立 Docker Compose project、动态端口、可发现 manifest、统一 logs/artifacts 和可清理 sandbox 来运行检查、HAT、browser acceptance 和并发开发；人类开发者继续使用固定端口、固定 container name、VS Code attach 友好的 Dev Container。

本 skill 默认会改项目代码，但必须先只读探索并输出实现计划，等待用户确认后再写文件。用户明确要求“直接实现”时，仍先做简短探索。

## 边界

- v1 只默认支持已有 Docker Compose 或 Dev Container 的项目；不要从零替项目发明开发环境。
- 默认交付模板化落地，不使用黑盒生成器，不依赖全局机器工具。
- 默认提交项目内协议文件：`.agent/bin/agent`、`.agent/bin/project`、`.agent/runtime.yml`、Compose overlays、`docs/agent-runtime-cli.md`、`AGENTS.md` 入口。
- 默认忽略运行态：`.agent/runs/`、`.agent/worktrees/`、logs、artifacts、generated env/manifest。
- 不把 secret 写入 manifest、status、docs、PR/HAT 报告；真实 secret 留在 `.env*` 或用户注入环境中。
- 不破坏人类 Dev Container。人类 runtime 保留固定端口和容器名；Agent runtime 使用动态端口、隔离 Compose project 和独立状态。
- Sharge 风格结构是 canonical example，但服务名如 `admin/api/ui`、MySQL、Redis、Maven、npm 都只是示例，不能硬编码到通用项目。

## Discovery

先探索能从仓库确定的信息，不要让用户凭空提供。

- 定位 repo root，读取 `AGENTS.md`、`CLAUDE.md`、`README*`、`HAT.md`、`docs/` 中的运行和验收约定。
- 读取 `.devcontainer/`、`docker-compose*`、`Dockerfile*`、`devcontainer.json`、`.env.example`、`.env.*.example`。
- 识别人类开发入口：Compose 文件组合、固定端口、container name、VS Code attach、volume、cache、post-create/post-start。
- 识别服务表：长期业务服务、依赖服务、端口、URL path、health endpoint、日志路径、启动/停止/等待命令。
- 识别 worker/queue/scheduler 服务：是否有无端口的后台 worker、定时任务、队列消费者，以及它们的日志和诊断入口。
- 识别迁移/seed/cleanup：migration 脚本、schema 初始化、测试数据准备、DB/Redis/MQ 依赖。
- 识别缓存和状态：Maven/Gradle/npm/pnpm/yarn cache、`node_modules`、数据库卷、Redis 数据、artifacts。
- 检查是否已有 `.agent/`、`.scratch/agent-*`、HAT 产物或项目级 agent 文档。

多候选服务无法判断时，只问真正阻塞的问题，并给出推荐默认。

## Plan Gate

实现前给用户一个短计划。计划必须 decision complete，至少包含：

- 将新增/修改的文件，以及哪些路径会写入 `.gitignore`。
- Compose 分层：base/dev/agent 文件名、服务继承关系、人类 runtime 保留点、Agent runtime 隔离点。
- `.agent/runtime.yml` 的服务表：service id、container port、host env var、URL、health、log name。
- CLI 命令面：`init/up/exec/start/stop/migrate/wait/status/logs/down/clean` 如何映射到项目命令。
- 可选扩展命令：是否需要 `compile`、`debug`、`mysql/psql`、`celery/queue`、`make-migration` 等项目辅助入口。
- `up` 是否自动迁移；默认是自动迁移，并在计划和文档中明确 DB side effect。
- cache/state 策略：哪些 cache 共享，哪些数据卷和安装产物按 sandbox 隔离。
- 验证命令：默认至少覆盖 help、init、status --json、up、安全 exec、down、clean。

需要协议细节时读取 [runtime-contract.md](references/runtime-contract.md)。需要 Compose 分层和缓存策略时读取 [compose-patterns.md](references/compose-patterns.md)。需要项目文档和验证模板时读取 [project-docs-validation.md](references/project-docs-validation.md)。

## Implementation

按目标项目已有风格落地，不照搬示例命名。

1. **搭建项目协议**
   - 新增 `.agent/runtime.yml` 声明静态契约。
   - 新增或更新 `.agent/bin/agent` 作为宿主机 sandbox 管理 CLI。
   - 新增或更新 `.agent/bin/project` 作为容器内业务运行协议；可以转调已有 devcontainer 脚本。
   - 更新 `.gitignore`，提交协议文件，忽略 `.agent/runs/` 和 `.agent/worktrees/`。

2. **拆 Compose 层**
   - 推荐 `.devcontainer/docker-compose.base.yml`、`.devcontainer/docker-compose.dev.yml`、`.devcontainer/docker-compose.agent.yml`。
   - base 放共享 build/image/依赖服务默认配置。
   - dev overlay 保留人类开发固定 container name、固定端口、VS Code 友好 volume。
   - agent overlay 使用 `${WORKTREE_PATH}`、`${AGENT_LOG_DIR}`、`${AGENT_ARTIFACT_DIR}`、动态端口和隔离卷。

3. **实现 CLI 行为**
   - `init` 注册已有 worktree 或 `--from-ref` 创建 `.agent/worktrees/<id>`。
   - `init` 分配端口、写 `.agent/runs/<id>/agent.env` 和 `manifest.json`。
   - `up` 使用 isolated Compose project 启动 sandbox，并默认运行 migration。
   - `exec` 只跑一次性命令；`start/stop/wait` 走容器内长期业务服务协议。
   - `status --json` 输出机器可读 manifest 和 compose 状态。
   - `logs` 既支持 Docker service logs，也支持项目 process logs。
   - `clean` 清理 sandbox Docker state；`--all` 可清理 run dir 和 CLI 创建的 worktree。
   - 项目诊断价值高时，添加可选辅助命令，例如 DB client、queue CLI、debug server、compile、migration authoring。

4. **写项目文档**
   - `AGENTS.md` 只放强约束和最短命令入口，指向 `docs/agent-runtime-cli.md`。
   - `docs/agent-runtime-cli.md` 写 runtime model、命令 reference、常见 workflow、cleanup 和故障排查。
   - 文档明确：Agent 默认不在宿主机或人类 Dev Container 里跑 tests/build/HAT/browser acceptance。

## Validation

默认执行 CLI+Compose smoke，而不是强制完整业务启动：

- `.agent/bin/agent --help` 或每个子命令 help 能读懂。
- `init --id <safe-id> --worktree .` 能生成 env/manifest，`status --json` 可解析且无 secret。
- `up` 能启动 Compose sandbox 并完成默认 migration；若项目明确不支持本地 Docker，说明阻塞原因。
- `exec --id <safe-id> -- <safe read-only command>` 能在 app container 中运行。
- `down` 成功停止 sandbox，`clean --all` 清理不需要的容器、卷、run dir 和自动 worktree。

如果完整业务启动风险低，可以额外跑 `start`、`wait` 和 URL smoke；不要把它作为所有项目的 v1 硬门槛。

## Completion

最终回复保持简洁，列出：

- 新增/修改文件。
- Agent Runtime 的默认命令入口和 state 路径。
- 人类 Dev Container 是否保持兼容。
- 共享 cache 与隔离 state 的策略。
- 验证命令和结果；未执行的验证要说明原因。
- 若保留了 sandbox 证据，说明 `--id`、路径和原因；否则确认已清理。
