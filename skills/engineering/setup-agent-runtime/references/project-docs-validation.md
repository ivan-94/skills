# Project Docs and Validation

Agent Runtime 改造完成后，目标项目必须让后续 Agent 不依赖聊天上下文也能使用、调试和清理 sandbox。

## `AGENTS.md` Entry

把长说明放到 docs，`AGENTS.md` 只放强约束和入口。

````markdown
### Agent Runtime

Do not run tests, builds, HAT, or browser acceptance directly on the host machine or in the shared human Dev Container when an agent is leading the work.

Use an independent worktree plus Agent Runtime:

```bash
.agent/bin/agent init --id check-my-task --worktree .
.agent/bin/agent up --id check-my-task
.agent/bin/agent exec --id check-my-task -- <test-or-build-command>
.agent/bin/agent down --id check-my-task
```

Agent Runtime is managed by `.agent/bin/agent`; see `docs/agent-runtime-cli.md`.

Cleanup is part of finishing the task:

```bash
.agent/bin/agent clean --id check-my-task --all
```

Use `down` only when intentionally preserving state for a short follow-up. Before handing work back, either clean the sandbox or state which `--id` is still running and why. Do not silently delete dirty worktrees or failure evidence.
````

如果仓库已有中文 AGENTS，就用中文；如果已有英文 AGENTS，就跟随项目语言。

## `docs/agent-runtime-cli.md` Outline

建议结构：

```markdown
# Agent Runtime CLI Reference

## Runtime Model

Human Runtime:
  .devcontainer/docker-compose.base.yml + .devcontainer/docker-compose.dev.yml

Agent Runtime:
  .devcontainer/docker-compose.base.yml + .devcontainer/docker-compose.agent.yml

State:
  .agent/runs/<id>/
  .agent/worktrees/<id>/

## Commands

### init
### up
### exec
### start / stop
### migrate
### wait
### status
### logs
### down
### clean

## Common Workflows

### Compile or Unit Test
### HAT / Browser Acceptance
### Debug a Failed Sandbox

## Cleanup Policy

## External Dependencies
```

每个命令至少写：

- 用途。
- 示例。
- 是否有副作用。
- 失败时下一步看哪里。

`up` 必须明确写出是否会自动 migration。

## `.gitignore`

最小忽略：

```gitignore
.agent/runs/
.agent/worktrees/
.agent/**/*.env
.agent/**/logs/
.agent/**/artifacts/
```

不要忽略 `.agent/bin/agent` 或 `.agent/runtime.yml`。

## Validation Checklist

默认 CLI+Compose smoke：

```bash
.agent/bin/agent --help
.agent/bin/agent init --id smoke-agent-runtime --worktree .
.agent/bin/agent status --id smoke-agent-runtime --json
.agent/bin/agent up --id smoke-agent-runtime
.agent/bin/agent exec --id smoke-agent-runtime -- pwd
.agent/bin/agent down --id smoke-agent-runtime
.agent/bin/agent clean --id smoke-agent-runtime --all
```

如果 `up` 太重或依赖缺失，至少完成：

```bash
.agent/bin/agent init --id smoke-agent-runtime --worktree .
.agent/bin/agent status --id smoke-agent-runtime --json
docker compose --env-file .agent/runs/smoke-agent-runtime/agent.env \
  -p "$(jq -r .composeProject .agent/runs/smoke-agent-runtime/manifest.json)" \
  -f .devcontainer/docker-compose.base.yml \
  -f .devcontainer/docker-compose.agent.yml \
  config
```

记录无法执行 `up` 的具体原因：Docker 不可用、缺少 secret、镜像构建失败、依赖服务不可访问、migration 不安全等。

可选完整业务 smoke：

```bash
.agent/bin/agent start --id smoke-agent-runtime
.agent/bin/agent wait --id smoke-agent-runtime
.agent/bin/agent status --id smoke-agent-runtime --json
.agent/bin/agent logs --id smoke-agent-runtime --service app
```

## Review Checklist

实现后自查：

- `AGENTS.md` 告诉 Agent 不要在宿主或人类 Dev Container 里跑自动检查。
- `docs/agent-runtime-cli.md` 覆盖全部 CLI 命令和 cleanup 语义。
- `runtime.yml` 的 service ids、ports、URLs、health、logs 与项目实际一致。
- human dev Compose 仍可用，固定端口和 container name 未被 agent overlay 破坏。
- agent Compose 无固定 `container_name`，无固定 host port，使用 `${WORKTREE_PATH}`。
- `.agent/runs/` 和 `.agent/worktrees/` 被忽略。
- `status --json` 不含 secret。
- `clean --all` 不会悄悄删除用户手写代码或未保存证据。

## Source Manifest for Persistent Artifacts

如果本次改造同时产出 PRD、issue、HAT 指南、review 报告、PR 正文或显式交接文档，这些持久化产物必须包含 Source Manifest：

```markdown
## Source Manifest

### Sources
- ...

### Produced artifacts
- ...

### Key decisions
- ...

### Verification evidence
- ...

### Open questions / risks
- ...
```

Skill 文件本身不强制每页都写 Source Manifest；但对外交接产物必须能让下一位 Agent 回读原始来源。
