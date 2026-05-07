---
name: hat-prepare
description: 准备 HAT（Hand Acceptance Test，手工验收测试）：为已完成或接近完成的变更生成验收环境说明、手工验收清单、数据需求和幂等 prepare.sh。Use after TDD/implementation when user mentions HAT, 手工验收, 人工验收, UAT, QA 验收, acceptance checklist, or wants to verify a PRD/Issue/PR from the user's perspective.
---

# HAT Prepare

HAT 是 TDD 之后、人工验收之前的准备技能。它验证“用户视角的完整路径”，补足自动化测试不容易覆盖的真实环境、历史数据、权限、迁移和外部服务边界。

目标产物默认写到当前项目 git root 下：

```text
./
  hats/YYYYMMDD-{prd-or-issue-title}/
    guide.md
    prepare.sh
  .env.hat.example   # 仅当需要外部环境变量时，在 repo root 生成
```

## 边界

- 默认实际生成 HAT 产物，不只给建议。
- 不默认执行高风险操作：共享/生产 DB 写入、attach/fork 迁移、破坏性 cleanup、外部系统写回。
- 不替代 `/tdd`、`/diagnose`、`/to-prd`、`/to-issues`。若实现还没完成，生成草案并标记 `blocked: implementation not ready`。
- 若用户要求执行脚本，先确认目标环境、写入权限、迁移权限和 cleanup 范围。

## 工作流

1. **Discovery**
   - 读取用户给的 PRD/Issue/PR/inline 描述。若给 GitHub/Linear 编号或链接且工具可用，自动读取；写回评论必须用户明确要求。
   - 探索项目约定：`README`、`AGENTS.md`/`CLAUDE.md`、`CONTEXT.md`、`docs/agents`、已有 `hats/`。
   - 搜索运行和数据入口：`package.json`、`docker-compose*`、`Makefile`、`.env.example`、migration 目录、seed 脚本、测试命令。
   - 如果是 PR/diff，重点看 schema/migration、auth/permission、用户入口、后台任务、webhook/payment/email、数据破坏性变化。
   - 读取 TDD 后新增/修改的测试作为参考，但不要把自动化测试照抄成 HAT 清单。

2. **先给 Discovery 摘要，再盘问**
   - 输出 Source、Implementation status、Related tests。
   - 推荐 `blank` / `fork` / `attach`，说明原因。
   - 列出发现的 app start command、DB/migration command、seed command、env examples、existing hats。
   - 列出风险：数据迁移、共享环境写入、auth/roles、外部服务。
   - 只问当前阻塞生成的最少问题。不要让用户在没有探索结果时凭空选择环境模式。

3. **确认环境模式**
   - `blank`：全新 feature 或不依赖历史数据；起临时 DB，执行全量迁移，seed 最小验收数据。
   - `fork`：需要历史数据兼容；复制现有 DB 后跑增量迁移。
   - `attach`：已有专用验收环境；连接后确认 schema/数据是否最新，必要时跑增量迁移。
   - 只支持用户确认的一种 mode，不生成三套复杂分支。

4. **生成或更新 HAT 目录**
   - 默认用 `git rev-parse --show-toplevel` 找 repo root；非 git repo 使用当前目录。
   - 目录名为 `hats/YYYYMMDD-{slug}`。slug 来自 PRD/Issue/PR 标题、用户任务名或 `hat-{number}`；中文可保留，空格和标点转 `-`，重复则加 `-2`。
   - 同源 PRD/Issue/PR 默认更新已有 HAT；用户明确要求快照时才新建。
   - 更新 `guide.md` 时保留人工填写区；可覆盖自动生成区。

5. **生成 `prepare.sh`**
   - 脚本必须幂等、`set -euo pipefail`、支持 `prepare` / `cleanup` / `info`。
   - 只实现已确认 mode 的可执行路径。
   - 不默认启动长期运行的 app/server；可以准备临时 DB，并打印 app 启动命令和 URL。
   - 缺少环境变量时在 repo root 生成 `.env.hat.example`，不生成真实 `.env.hat`。
   - `prepare.sh` 默认从 repo root 读取 `.env.hat`；若项目已有其他 env 约定，可兼容读取但要在 `guide.md` 写清楚。
   - 简单 seed/helper 尽量写进 `prepare.sh`；复杂时才放额外脚本，并由 `prepare.sh` 统一入口调用。
   - cleanup 默认只清理 HAT 自己创建、带稳定前缀的数据；破坏性操作必须由显式变量授权。

6. **验证**
   - 每次生成/更新 `prepare.sh` 后必须跑 `bash -n hats/.../prepare.sh`，失败则修复。
   - 有 `shellcheck` 就运行；没有则记录 `shellcheck: not available`，不阻塞。
   - 不默认执行 `prepare.sh prepare`；blank 低风险或用户明确确认后才执行。

## `guide.md` 必须包含

- Metadata：source URL/编号、创建/更新时间、repo root、mode、选择原因。
- 准备状态：`not-run`、`syntax-checked`、`blocked`、`prepared`、`needs-refresh`。
- 环境信息：执行环境、DB 信息（脱敏）、schema/version、迁移命令、app URL、启动命令。
- 阻塞项：缺少的 env、账号、权限、外部服务、迁移确认。
- 验收账号表：角色、账号、来源、权限/租户、用途、状态；探索得到就填，得不到标 `TODO: 用户提供`。
- 验收数据需求：seed 数据、历史数据样本、外部服务 sandbox、cleanup 策略。
- 数据迁移检查：当前/目标 schema version、旧数据样本、回滚/cleanup 注意事项、未执行项或风险。
- 验收清单：按 P0/P1/P2 分级，每个场景包含 Preconditions、Steps、Expected、Evidence、Notes。
- 验收执行方式：入口、主要工具、辅助工具、agent notes、必须人工判断的步骤。
- 通过标准：所有 P0 通过；P1 无阻塞发布问题；P2 探索性；迁移无未解释异常；cleanup 策略明确。
- 执行记录模板：时间、执行人、场景、结果、证据、备注。

## 可更新区约定

在 `guide.md` 中使用区块标记保护人工内容：

```md
<!-- HAT:BEGIN metadata -->
<!-- HAT:END metadata -->

<!-- HAT:MANUAL notes -->
<!-- HAT:ENDMANUAL notes -->

<!-- HAT:BEGIN checklist -->
<!-- HAT:END checklist -->
```

`HAT:BEGIN/END` 可由技能更新；`HAT:MANUAL/ENDMANUAL` 必须保留。

## `prepare.sh` 摘要块

脚本末尾打印稳定摘要，方便人和后续 `/hat-run` 复用。不得打印密钥，DB URL 必须脱敏。

```text
HAT_PREPARE_SUMMARY
mode=blank
status=prepared
app_url=http://localhost:3000
database=hat_local
schema_version=unknown
seed_records=users:2
cleanup=./prepare.sh cleanup
guide=./guide.md
END_HAT_PREPARE_SUMMARY
```

## 敏感信息

- 只在 repo root 生成 `.env.hat.example`，不写真实 `.env.hat` 或 secret。
- `guide.md` 只记录变量名和用途，不记录 secret 值。
- 打印 token 时显示 `<set>` 或脱敏片段。
- fork/attach 指向共享环境时，默认禁止写入和破坏性 cleanup，除非用户显式授权。

## 完成回复

最终回复保持简洁，列出 guide、prepare script、status、mode、下一步命令和阻塞项。如果执行过脚本，附上摘要块关键字段；如果只做 Discovery，说明尚未生成文件及原因。
