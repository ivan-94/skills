# Compose Patterns

Agent Runtime 推荐把人类 Dev Container 和 Agent sandbox 拆成三层 Compose 文件。

## File Layout

```text
.devcontainer/
  docker-compose.base.yml
  docker-compose.dev.yml
  docker-compose.agent.yml
  Dockerfile
```

- `base`：共享 build/image、依赖服务、默认 env、healthcheck。
- `dev`：人类开发 overlay，固定 container name、固定端口、VS Code attach 友好 volume。
- `agent`：Agent overlay，动态 worktree mount、动态 host port、隔离 volume、logs/artifacts mount。

如果项目已有别的命名，可以保留，但文档和 `.agent/runtime.yml` 必须明确最终文件组合。

## Base Layer

`base` 放可被人类和 Agent 共享的服务定义。

```yaml
services:
  app:
    build:
      context: ..
      dockerfile: .devcontainer/Dockerfile
    command: sleep infinity
    environment:
      TZ: Asia/Shanghai
    depends_on:
      mysql:
        condition: service_healthy
      redis:
        condition: service_healthy
    stdin_open: true
    tty: true

  mysql:
    image: mysql:8.0
    healthcheck:
      test: ["CMD", "mysqladmin", "ping", "-h", "localhost"]

  redis:
    image: redis:7-alpine
```

不要在 base 写人类固定 `container_name` 或固定 host ports。

## Human Dev Overlay

`dev` 保留人类开发便利。

```yaml
services:
  app:
    container_name: project-dev
    volumes:
      - ..:/workspace:cached
      - maven-cache:/root/.m2
      - npm-cache:/root/.npm
      - node-modules:/workspace/web/node_modules
    ports:
      - "9000:9000"
      - "1024:1024"
    environment:
      WORKSPACE_DIR: /workspace
      LOG_DIR: /workspace/logs

volumes:
  maven-cache:
  npm-cache:
  node-modules:
```

这层可以使用固定 container name 和固定端口，因为它服务单个人类开发会话。

## Agent Overlay

`agent` 使用 `.agent/runs/<id>/agent.env` 注入变量。

```yaml
services:
  app:
    build:
      context: ${WORKTREE_PATH:?WORKTREE_PATH is required}
      dockerfile: .devcontainer/Dockerfile
    env_file:
      - path: ${WORKTREE_PATH:?WORKTREE_PATH is required}/.env
        required: false
      - path: ${WORKTREE_PATH:?WORKTREE_PATH is required}/.env.local
        required: false
      - path: ${WORKTREE_PATH:?WORKTREE_PATH is required}/.env.hat
        required: false
    volumes:
      - ${WORKTREE_PATH:?WORKTREE_PATH is required}:/workspace:cached
      - ${AGENT_LOG_DIR:?AGENT_LOG_DIR is required}:/agent/logs
      - ${AGENT_ARTIFACT_DIR:?AGENT_ARTIFACT_DIR is required}:/agent/artifacts
      - ${MAVEN_CACHE_VOLUME:-project-agent-maven-cache}:/root/.m2
      - ${NPM_CACHE_VOLUME:-project-agent-npm-cache}:/root/.npm
      - node-modules:/workspace/web/node_modules
    environment:
      AGENT_ID: ${AGENT_ID:?AGENT_ID is required}
      WORKSPACE_DIR: /workspace
      LOG_DIR: /agent/logs
    ports:
      - "${WEB_HOST_PORT:?WEB_HOST_PORT is required}:9000"
      - "${UI_HOST_PORT:?UI_HOST_PORT is required}:1024"

volumes:
  node-modules:
  mysql-data:
  redis-data:
```

原则：

- 不写 `container_name`，让 Compose project namespace 隔离容器。
- 不写固定 host port，全部来自 `agent.env`。
- 工作区来自 `${WORKTREE_PATH}`，不要 mount 当前宿主仓库。
- logs/artifacts 挂到 `.agent/runs/<id>/`。
- 下载缓存可共享；业务状态和安装产物默认按 sandbox 隔离。

## Cache and State Policy

默认：

- 共享：Maven local repository、Gradle cache、npm/pnpm/yarn package download cache、Docker build cache。
- 隔离：MySQL/Postgres data、Redis data、MQ data、Elasticsearch data、`node_modules`、generated files、logs、artifacts。

`node_modules` 默认隔离是为了避免不同 worktree、lockfile 或 Node 版本互相污染。若项目非常大且确认安全，可以在计划中单独说明共享策略和风险。

## Port Policy

推荐由 `.agent/bin/agent init` 负责端口：

- 从 `id` hash 生成确定性起点。
- 对 `runtime.yml` 中每个暴露服务分配一个 host port。
- 冲突时向后寻找空闲端口。
- 写入 `.agent/runs/<id>/agent.env` 和 manifest。
- URL 由 manifest 使用最终端口渲染。

避免默认使用 Docker `0:port` 随机端口；它会让 `up` 前 URL 不可知，也让 HAT/browser agent 需要额外反查 Compose。

## Migration Policy

默认 `up` 后自动执行 migration：

```text
compose up -d --build
wait dependency health
.agent-runtime/bin/project migrate up
```

要求：

- 文档和 CLI help 明确 `up` 有 DB side effect。
- migration 必须幂等，或至少能安全判断已应用。
- `migrate status` 能只读展示 applied/pending/missing。
- 若项目不能安全自动迁移，将例外写入计划、`AGENTS.md` 和 `docs/agent-runtime-cli.md`。

## Secret Policy

- Compose 可以读取 `${WORKTREE_PATH}/.env`、`.env.local`、`.env.hat`，但这些文件通常不提交。
- manifest/status 不复制 env 内容。
- docs 不写真实 token、cookie、password、DB URL。
- 示例使用占位值或说明从 env 注入。

## Sharge-Style Example Mapping

Sharge 案例的结构可作为迁移参考：

```text
.devcontainer/docker-compose.base.yml
.devcontainer/docker-compose.dev.yml
.devcontainer/docker-compose.agent.yml
.agent/bin/agent
docs/agent-runtime-cli.md
AGENTS.md
```

通用化时要替换：

- `eye-admin`、`eye-api`、`eye-ui` -> 目标项目自己的 service ids。
- `9000/9100/1024` -> 目标项目服务端口。
- Maven/npm cache -> 目标项目包管理器 cache。
- MySQL/Redis -> 目标项目实际依赖服务。
- `.devcontainer/project.sh` -> `.agent-runtime/bin/project`，必要时由后者转调已有脚本。
