# Agent Runtime Contract

本文定义项目内 Agent Runtime 的最小协议。实现时按目标项目调整命名和命令，但保持行为可发现、可重复、可清理。

## Tracked vs Runtime State

提交到仓库：

```text
.agent/
  bin/agent
  bin/project
  runtime.yml
.devcontainer/
  docker-compose.base.yml
  docker-compose.dev.yml
  docker-compose.agent.yml
docs/agent-runtime-cli.md
AGENTS.md
```

忽略运行态：

```text
.agent/runs/
.agent/worktrees/
.agent/**/*.env
.agent/**/logs/
.agent/**/artifacts/
```

`runtime.yml` 是项目静态契约；`.agent/runs/<id>/manifest.json` 是单次 sandbox 动态事实。不要把 manifest 当配置源。

## `.agent/runtime.yml`

推荐字段：

```yaml
runtime:
  name: project-agent
  compose_project_prefix: project-agent
  worktrees_dir: .agent/worktrees
  runs_dir: .agent/runs
  compose_files:
    - .devcontainer/docker-compose.base.yml
    - .devcontainer/docker-compose.agent.yml
  app_service: app
  workspace_dir: /workspace
  project_command: .agent/bin/project

caches:
  shared:
    maven: project-agent-maven-cache
    npm: project-agent-npm-cache
  isolated:
    - mysql-data
    - redis-data
    - node-modules

services:
  admin:
    container_port: 9000
    host_env: ADMIN_HOST_PORT
    url: http://127.0.0.1:{port}/admin
    health: http://localhost:9000/admin/health
    process_log: admin.log
  ui:
    container_port: 1024
    host_env: UI_HOST_PORT
    url: http://127.0.0.1:{port}/
    health: http://localhost:1024/
    process_log: ui.log
  mysql:
    container_port: 3306
    host_env: MYSQL_HOST_PORT
    url: 127.0.0.1:{port}
    docker_service: mysql
  worker:
    docker_service: worker
    command: queue worker
    log_name: docker:worker
```

字段要求：

- `services` 必须显式声明端口、URL、health 和日志映射；不要靠 Agent 猜。
- 没有端口的 worker/scheduler 服务也要显式声明 `docker_service`、启动意图和日志入口，例如 Celery、Sidekiq、queue worker、cron/beat。
- `{port}` 使用最终分配的 host port 渲染。
- `host_env` 用于写入 `.agent/runs/<id>/agent.env`，再由 Compose agent overlay 读取。
- `runtime.project_command` 使用 `.agent/bin/project`，与宿主机 CLI 一起放在 `.agent/bin/` 下。
- secret 不进入 `runtime.yml` 示例或 manifest；只引用 `.env*`、env file 或外部 secret 管理。

## CLI Commands

`.agent/bin/agent` 是宿主机 CLI。所有命令都要求显式 `--id`，不要从当前目录猜 sandbox。

### `init`

支持：

```bash
.agent/bin/agent init --id hat-pr-17 --worktree .agent/worktrees/pr-17
.agent/bin/agent init --id review-main --from-ref main
```

行为：

- 校验 `--id` 只含安全字符。
- `--worktree` 注册已有 git worktree。
- `--from-ref` 创建 `.agent/worktrees/<id>` detached worktree，并在 manifest 记录 `createdWorktree: true`。
- 从 `id` hash 得到确定性端口起点，冲突时寻找空闲端口。
- 写 `.agent/runs/<id>/agent.env`、`manifest.json`、`logs/`、`artifacts/`。
- 重复 init 同一 id 和同一 worktree 应成功返回；同一 id 指向不同 worktree 应报错。

### `up`

```bash
.agent/bin/agent up --id hat-pr-17
```

行为：

- 创建共享下载缓存卷。
- 使用 `docker compose --env-file .agent/runs/<id>/agent.env -p <composeProject> -f ... up -d --build`。
- 等待依赖服务 health。
- 默认执行容器内 migration：`/workspace/.agent/bin/project migrate up`。
- 文档和 help 必须说明 `up` 有 DB side effect。

### `exec`

```bash
.agent/bin/agent exec --id hat-pr-17 -- mvn test
.agent/bin/agent exec --id hat-pr-17 -- bash -lc "npm run build"
```

行为：

- 只用于一次性 compile/test/lint/build/debug 命令。
- 在 `app_service` 容器内以 workspace 为 cwd 执行。
- 不启动长期服务；长期服务必须走 `start`。

### `start` / `stop` / `migrate` / `wait`

映射到容器内协议：

```bash
.agent/bin/project start [all|service-id]
.agent/bin/project stop [all|service-id]
.agent/bin/project migrate up|status
.agent/bin/project wait [all|service-id]
```

要求：

- `start` 幂等：先停止目标进程，再启动。
- `stop` 对不存在的进程返回成功。
- `wait` 使用 service health endpoint，不靠固定 sleep。
- scopes 使用 `runtime.yml` 的 service ids。

### `status`

```bash
.agent/bin/agent status --id hat-pr-17
.agent/bin/agent status --id hat-pr-17 --json
```

`--json` 输出 manifest 加 compose ps 摘要。manifest 推荐字段：

```json
{
  "id": "hat-pr-17",
  "composeProject": "project-agent-hat-pr-17",
  "worktree": "/abs/path/.agent/worktrees/hat-pr-17",
  "createdWorktree": true,
  "runDir": "/abs/path/.agent/runs/hat-pr-17",
  "envFile": "/abs/path/.agent/runs/hat-pr-17/agent.env",
  "composeFiles": [
    "/abs/path/.devcontainer/docker-compose.base.yml",
    "/abs/path/.devcontainer/docker-compose.agent.yml"
  ],
  "ports": {
    "admin": 19017,
    "ui": 11017
  },
  "urls": {
    "admin": "http://127.0.0.1:19017/admin",
    "ui": "http://127.0.0.1:11017/"
  },
  "logs": "/abs/path/.agent/runs/hat-pr-17/logs",
  "artifacts": "/abs/path/.agent/runs/hat-pr-17/artifacts"
}
```

不要输出 secret、cookie、token、完整 DB URL 或 `.env` 内容。

### `logs`

支持两类日志：

```bash
.agent/bin/agent logs --id hat-pr-17 --service app
.agent/bin/agent logs --id hat-pr-17 --process admin
```

- `--service` 转发 Docker Compose service logs。
- `--process` 读取 `.agent/runs/<id>/logs/<process_log>`。
- log 文件不存在时给出可行动错误：先 `start`、检查 `status`、或查看 service logs。

### `down` / `clean`

```bash
.agent/bin/agent down --id hat-pr-17
.agent/bin/agent clean --id hat-pr-17
.agent/bin/agent clean --id hat-pr-17 --all
```

- `down` 停容器和网络，保留 volumes、run dir、logs、artifacts。
- `clean` 删除 sandbox Docker state 和隔离 volumes，保留共享下载缓存。
- `clean --all` 还删除 run dir；若 manifest 记录 `createdWorktree: true`，也删除 CLI 创建的 worktree。
- 若 worktree 有未提交变更或失败证据，不能悄悄删除；保留并向用户说明，或先获得确认。

## Container Project Command

`.agent/bin/project` 在容器内运行，负责业务进程，不负责 Docker Compose。

必备命令：

```bash
.agent/bin/project start [all|service-id]
.agent/bin/project stop [all|service-id]
.agent/bin/project migrate up|status
.agent/bin/project wait [all|service-id]
.agent/bin/project status
```

约定：

- `WORKSPACE_DIR` 默认 `/workspace`。
- `LOG_DIR` 默认 `/agent/logs`；agent Compose overlay 将其挂到宿主 `.agent/runs/<id>/logs`。
- 启动长期进程时写 pid 和 log，例如 `$LOG_DIR/admin.pid`、`$LOG_DIR/admin.log`。
- 停止逻辑应按 pid、工作目录、端口三层兜底，保证 `start` 可重复执行。
- 可以复用已有 devcontainer 脚本，但对外协议路径保持 `.agent/bin/project`。

## Optional Project Commands

基础命令之外，可以按项目添加高价值辅助入口，帮助 Agent 少记连接细节、少污染宿主机：

```bash
.agent/bin/agent compile --id check-my-task
.agent/bin/agent debug --id check-my-task [service-id]
.agent/bin/agent mysql --id check-my-task -- -e "select 1"
.agent/bin/agent psql --id check-my-task -- -c "select 1"
.agent/bin/agent celery --id check-my-task -- inspect ping
.agent/bin/agent queue --id check-my-task -- status
.agent/bin/agent make-migration --worktree . -m add_example_table
```

设计原则：

- Optional commands 必须仍通过 sandbox 容器执行，不直接连宿主机或共享 Dev Container。
- DB/queue 命令可以内置 sandbox service、database、app name 等非 secret 默认值；真实 secret 仍从容器环境注入。
- `debug` 可以暴露 debugpy、JDWP、Node inspector 等调试端口，但 host port 仍由 `init` 动态分配并写入 manifest。
- `make-migration` / autogenerate 应创建临时 sandbox，先应用已有迁移，再生成 diff，结束后默认清理；提供 `--keep` 仅用于保留失败现场。
- 文档中把这些命令标为项目扩展，不要让没有对应栈的项目照抄。
