---
name: hat-run
description: 执行 HAT（Hand Acceptance Test，手工验收测试）：读取 /hat-prepare 产物，按 P0/P1/P2 执行可自动化验收步骤，调用 prepare.sh info/prepare，生成中文 summary.md、results.json、logs.md 和 artifacts。Use when user mentions hat-run, 执行 HAT, 自动化验收, UAT run, acceptance run, or wants an agent to run an existing HAT guide.
---

# HAT Run

HAT Run 在 `/hat-prepare` 的产物基础上执行 agent 辅助验收。它只读取既有验收计划，负责环境检查、执行可自动化步骤、验证预期结果、产出报告和可选 cleanup。

## 输入边界

- 只认 `/hat-prepare` 产物，不现场生成或改写验收清单。
- 默认查找当前 repo 下的 `hats/*/guide.md`；若只有一个，询问是否执行；若多个，让用户指定；若没有，停止并提示先运行 `/hat-prepare`。
- `guide.md` 缺失：停止。
- checklist 缺失或不可解析：停止，不临场创造清单。
- `prepare.sh` 缺失：可以继续做只读/人工报告，但环境准备状态标 `BLOCKED`。
- `.env.hat.example` 缺失不阻塞；repo root 的 `.env.hat` 只有在 `guide.md` 或 `prepare.sh info` 表明需要 env 时才阻塞。
- 执行前读取 repo root `HAT.md`（如果存在），作为项目级 HAT 策略和通用记忆层；不存在不阻塞，只在 dry-run plan 中轻量标注。

## 项目级 HAT 策略

`HAT.md` 可以描述项目通用策略：如何登录、验证码如何处理、浏览器 E2E 如何执行、服务依赖如何检查、`.env.hat` 如何加载、报告如何保存，以及后续前端/后端实现如何变得 HAT-friendly。

策略优先级：

1. 用户本轮明确指令
2. 本次 `guide.md`
3. repo root `HAT.md`
4. `hat-run` 默认规则

`guide.md` 优先于 `HAT.md`。`HAT.md` 不用于生成 checklist，也不能覆盖本次 HAT 的验收范围。若存在冲突，在 dry-run plan 和报告中记录最终采用的策略；涉及 prepare、cleanup、共享 DB 写入、停服务、验证码绕过、删除真实数据等高风险动作时，仍必须显式确认。

## 默认安全策略

- 默认只执行 `prepare.sh info`，不默认执行 `prepare.sh prepare`。
- `prepare.sh prepare` 可能创建 DB、跑迁移、seed 或写 fork/attach 环境，必须在 dry-run plan 中说明并得到用户确认。
- fork/attach 永远不自动 prepare，除非用户明确确认。
- cleanup 只通过 `prepare.sh cleanup` 执行，默认不执行；共享环境或 fork/attach 需要二次确认。
- DB 验收默认只读查询；造数据交给 `prepare.sh prepare`，不要直接运行 `INSERT/UPDATE/DELETE` 修环境。
- 不写 secret 到报告、日志、截图或 JSON；URL/token/DB 连接必须脱敏。

## 工作流

1. **定位 HAT**
   - 解析用户给的 HAT 目录、guide 路径或自然语言范围。
   - 若未指定，扫描 `hats/*/guide.md` 并让用户选择。
   - 读取 repo root `HAT.md`（如果存在）、`guide.md`、`prepare.sh`、repo root `.env.hat.example` 和必要的 `.env.hat` 状态。

2. **解析计划**
   - 读取 metadata、mode、环境信息、验收账号、数据需求、通过标准。
   - 解析 P0/P1/P2 checklist；不要改写 checklist。
   - 默认执行范围：P0+P1。P0 fail-fast，P1 collect-all，P2 默认 `SKIPPED`。
   - 支持用户自然语言控制范围：只跑 P0、跑 P0+P1、包含 P2、只跑某个场景、resume 上次、cleanup only。

3. **生成 dry-run plan**
   - 默认先输出执行计划并等待确认，除非用户明确说“直接跑”。
   - 计划必须列出 HAT 目录、`HAT.md` 是否存在、mode、prepare 策略、执行范围、场景自动化映射、不会做的事。
   - 若 `guide.md` 和 `HAT.md` 策略冲突，列出 `Policy conflicts` 和最终采用策略。
   - 非交互或 CI 场景使用安全默认：不 prepare、不 cleanup、P0+P1、P0 fail-fast。

4. **环境检查**
   - 执行 `prepare.sh info`，解析 `HAT_PREPARE_SUMMARY`。
   - 若 summary 显示 `prepared`，可以继续。
   - 若显示 `blocked` / `not-run` / `syntax-checked` / `unknown`，说明缺口并询问是否执行 `prepare.sh prepare`。
   - 只有实际 summary 证明准备成功，才更新 latest prepare status。

5. **执行验收**
   - 先执行 P0；任一 P0 为 `FAIL` / `BLOCKED` / `ERROR` 时停止后续 P0，不继续 P1/P2，除非用户要求继续收集。
   - P1 不 fail-fast，尽量执行完并收集风险。
   - P2 默认跳过；用户要求探索时执行，主要输出 notes。
   - 无法可靠自动化的场景标 `MANUAL`，集中写入 `# HUMAN MANUAL`，默认不边跑边问用户。

6. **写报告与 guide 轻写回**
   - 每次运行创建 `reports/YYYYMMDD-HHMMSS/`。
   - 写中文 `summary.md`、`logs.md`，英文枚举状态，机器可读 `results.json`。
   - `summary.md` 必须包含 `HAT-friendly 改造建议`，记录本次真实执行暴露出的可复用改造方向；保持项目相关和原则性，不硬编码通用解决方案。这些建议不影响通过状态，除非它们导致 `FAIL` / `BLOCKED`。
   - 更新 `guide.md` 的 latest run、report path、overall status 和 execution log；不要改 checklist。
   - 如果产生高价值可复用经验，可追加到 `HAT.md` 的 learnings 自动区；没有自动区时只在报告里给更新建议，不直接改策略正文。

## 验证类型映射

只执行可解释、可回放的映射；不足以映射时标 `MANUAL` 或 `BLOCKED`，不要猜。

- `api`：有 method、URL、request、expected status 或 response 字段；可用 `curl` + `jq`。
- `browser`：有页面入口、操作步骤、可观察 UI 结果；优先 browser-use / in-app browser，其次项目已有 Playwright/Puppeteer；不临时安装浏览器依赖。
- `db`：有 SQL 或明确表/字段/schema version 检查；用 `psql` / `mysql` 等只读查询。
- `cli`：有命令、参数、expected stdout/stderr/exit code；直接执行并比对。
- `log`：有日志路径/服务名/关键词/正则；用 `grep` / `tail` 等只读检查。
- `manual`：体验、文案、视觉、真实第三方账号、支付、邮件人工确认，或 guide 细节不足。

每个自动场景的报告必须写：原始步骤、自动化映射、执行命令或工具动作、实际观察、断言结果、artifacts。

## 状态枚举

场景状态：

- `PASS`：自动验收或人工确认通过。
- `FAIL`：执行完成但结果不符合预期。
- `BLOCKED`：缺环境、账号、数据、服务、权限或命令失败，无法判断。
- `MANUAL`：需要人工判断或工具无法可靠执行。
- `SKIPPED`：因范围、优先级、前置失败或用户选择跳过。
- `ERROR`：`hat-run` 自身异常，如解析失败、报告写入失败、浏览器工具崩溃。

总状态折算：

- 有 `ERROR`：`ERROR`
- 有 P0 `FAIL`：`FAIL`
- 有 P0 `BLOCKED`：`BLOCKED`
- P0 全部 `PASS`，但有 `MANUAL`：`MANUAL_REQUIRED`
- P0 全部 `PASS`，P1 有 `FAIL` / `BLOCKED`：`RISK_FOUND`
- P0/P1 自动可执行项通过，剩余 P2 未跑或 manual：`PASS_WITH_NOTES`
- 全部目标项通过：`PASS`

报告正文用中文，状态枚举保持英文大写。

## 报告目录

每次执行创建一个时间目录：

```text
hats/YYYYMMDD-title/
  reports/
    YYYYMMDD-HHMMSS/
      summary.md
      results.json
      logs.md
      artifacts/
        screenshot_HAT-P0-001.png
        response_HAT-P0-002.json
        db_HAT-P1-001.txt
```

- run-id 只用本地日期+时间：`YYYYMMDD-HHMMSS`。
- `summary.md`：中文人类可读报告，必须包含 `# HUMAN MANUAL`；如果报告引用截图等图片 artifacts，必须使用 Markdown 图片语法 `![描述](artifacts/xxx.png)` 呈现，方便直接预览，不只写纯路径或普通链接。
- `results.json`：机器可读结果，不含 secrets，不塞巨大 stdout/stderr。
- `logs.md`：执行过程、命令、时间、stdout/stderr 摘要、工具错误。
- `artifacts/`：截图、API 响应、DB 输出、临时执行脚本、浏览器动作记录等。

## `results.json` 最小 schema

```json
{
  "run_id": "20260507-153012",
  "run_scope": "P0+P1",
  "run_type": "new",
  "hat_dir": "hats/20260507-title",
  "source": "...",
  "mode": "blank",
  "started_at": "...",
  "finished_at": "...",
  "overall_status": "MANUAL_REQUIRED",
  "prepare": {
    "ran_info": true,
    "ran_prepare": false,
    "status": "prepared"
  },
  "scenarios": [
    {
      "id": "HAT-P0-001",
      "priority": "P0",
      "title": "...",
      "verification_type": "browser",
      "status": "MANUAL",
      "duration_ms": 1234,
      "artifacts": ["artifacts/screenshot_HAT-P0-001.png"],
      "notes": "..."
    }
  ]
}
```

## 浏览器证据

- 每个 `browser` 场景至少保存一张最终状态截图。
- 失败时额外保存 failure 截图。
- 关键多步流程可保存 `_step-1`、`_step-2`。
- 截图前避免捕获 secret/token；若页面包含敏感信息，先脱敏或标注未截图。
- 如果浏览器工具不可用，标 `MANUAL` 并在 `# HUMAN MANUAL` 写建议截图点。

## Resume

- 第一版支持轻量 resume，默认仍新建 run。
- 若最新 `results.json` 的 overall 为 `ERROR` / `BLOCKED` / `MANUAL_REQUIRED`，可让用户选择 resume。
- resume 复用 run 目录，跳过已 `PASS` 场景，继续 `BLOCKED` / `MANUAL` / `SKIPPED` / `ERROR`。
- 重试 artifacts 使用后缀，如 `_retry-2`，保留旧结果摘要。
- 如果 `guide.md` 已更新或 source changed，默认新建 run，不 resume。

## guide.md 写回

- 可以写 latest run id、latest report path、overall status、run timestamp、每个场景结果简表。
- 可以追加 `<!-- HAT:MANUAL execution-log -->` 执行记录。
- 如果没有可写区块，可以在文末追加 `## HAT Run History`。
- 不改 P0/P1/P2 checklist、不改 expected results、不补写新场景、不覆盖人工区。

## HAT.md 经验积累

`HAT.md` 是项目级通用记忆层。`hat-run` 可以在执行后追加真实经验，但只能写入 learnings 自动区，不默认修改策略正文。

推荐区块：

```md
## 经验积累
<!-- HAT:BEGIN learnings -->
<!-- HAT:END learnings -->
```

经验条目格式：

```md
### 2026-05-08 - RuoYi 登录验证码
- Source: hats/20260508-xxx/reports/20260508-153012
- Applies to: admin login, local/dev only
- Problem: 图形验证码导致浏览器登录不稳定。
- Guidance: 优先使用测试登录接口或 token 注入；MATH 验证码可通过 captchaImage + Redis 查询答案。
- Confidence: medium
- Review by: TODO
```

规则：

- 每次 run 最多追加 3-5 条高价值经验。
- 只写可复用问题，不写一次性失败。
- 必须包含 `Source`、`Applies to`、`Problem`、`Guidance`、`Confidence`。
- 涉及安全绕过、验证码、权限、生产保护或真实数据时，保留 `Review by: TODO`。
- 如果新经验和旧经验冲突，不自动覆盖旧经验，追加冲突说明并提示用户整理。
- 如果 `HAT.md` 缺失或没有 learnings 自动区，不创建、不强改；在 `summary.md` 的 `HAT-friendly 改造建议` 中输出建议。

## HAT-friendly 改造建议

报告中的改造建议应基于本次真实执行困难，指向下一次如何更容易验收。保持原则性和项目相关，不硬编码通用解决方案；让 agent 根据 `HAT.md`、`guide.md` 和项目实现选择合适做法。

## 完成回复

最终回复保持简洁，列出 HAT 目录、run-id、report 路径、overall status、P0/P1/P2 统计、`# HUMAN MANUAL` 数量、失败或阻塞的首要原因，以及是否执行了 prepare/cleanup。
