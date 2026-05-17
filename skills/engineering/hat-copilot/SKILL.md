---
name: hat-copilot
description: 基于已有 /hat-prepare 产物进行人类验收副驾驶：先制定计划，确认后由 Agent 自动完成环境/数据/检查等准备，并逐步引导人类完成 P0/P1/P2 验收，持续维护 human-report.md。Use after hat-prepare when the user wants an AI-assisted human acceptance session, HAT copilot, 人类验收副驾驶, or guided manual acceptance.
---

# HAT Copilot

`hat-copilot` 是 `/hat-prepare` 之后的交互式人类验收副驾驶。它读取已有 HAT 产物，组织验收流程，自动完成可辅助的准备和检查，并引导人类判断功能是否满足需求期望。

最高原则：

> Process can be automated; acceptance judgment belongs to the human.

Agent 负责导航、准备、解释、辅助定位和维护报告。验收结论由人类给出；UI、产品体验和业务符合性的判断由人类执行和确认。

## 输入

- 用户指定 HAT 目录或 `guide.md` 时，基于该目录执行。
- 未指定时，扫描当前 repo 的 `hats/*/guide.md`；只有一个可自动选择，多个则让用户指定。
- 读取已有 `/hat-prepare` 产物：`guide.md`、`prepare.sh`、项目级 `HAT.md`（如果存在）和 HAT 目录中已有的 `human-report.md`。
- 读取项目说明和运行入口：`README*`、`AGENTS.md`/`CLAUDE.md`、Dev Container、`.agent/`、`package.json`、`docker-compose*`、`Makefile`、env example、seed/account/start 脚本。
- 若找不到 HAT 产物，引导用户先运行 `hat-prepare`。

## 工作流

1. **Discovery**
   - 理解本次 HAT 的来源、验收目标、实现背景、P0/P1/P2 checklist、账号、数据、环境和阻塞项。
   - 如果已有 `human-report.md`，先读取进度，识别已完成、失败、阻塞、待复测和下一步。
   - 探测可用执行环境，并按优先级选择：Dev Container > Agent Runtime > Host。

2. **先计划，后执行**
   - 正式验收前输出简洁计划，并等待用户确认。
   - 计划包含：
     - HAT source 和验收范围。
     - 选中的执行环境，以及环境启动、prepare、检查会在哪里执行。
     - Agent 会自动完成的准备动作。
     - 人类需要亲自验证的 UI/体验/业务步骤。
     - P0/P1/P2 执行顺序。
     - `human-report.md` 路径和续跑策略。

3. **维护报告**
   - 在 HAT 目录创建或更新 `human-report.md`。
   - 报告同时作为验收 todo list 和最终报告。
   - 每完成一个阶段或 case，就更新 checklist、结果、关键现象、失败原因和下一步。

4. **准备环境**
   - 优先在 Dev Container 中启动服务、执行 `prepare.sh`、seed、账号准备、health check 和辅助命令。
   - 没有合适 Dev Container 时，优先使用 Agent Runtime。
   - 最后使用宿主机已有脚本和依赖。
   - 每个自动化动作都要透明：执行前说明目的、入口或命令；执行后说明结果和对下一步的影响。

5. **引导验收**
   - P0 按顺序执行，失败或阻塞时进入 fast-fail：记录现象，引导修复/复测/结束报告/用户确认后继续。
   - P1/P2 在准备完成后可独立验收，逐项收集人类结论。 注意，一次只能执行一项。
   - UI 和体验步骤由人类操作；Agent 提供链接、账号、输入值、步骤、预期结果和判断标准。
   - 后端、CLI、HTTP、只读数据查询、日志检查、队列/任务触发等辅助过程由 Agent 尽量执行，并把结果解释给人类确认。

6. **收敛报告**
   - 全部目标项完成、失败、阻塞或跳过后，整理 `human-report.md`。
   - 报告说明本次范围、环境、数据/账号准备、P0/P1/P2 结果、失败项、阻塞项、复测项和建议 follow-up。

## Case 引导格式

每个 case 使用稳定结构，避免验收过程说散：

```text
Case: P0-001 <title>
Goal: 这一步验证什么需求或风险
Preconditions: 当前需要满足什么
I will do: Agent 会先做哪些准备或检查
You do: 人类需要执行哪些操作
Expected: 人类应该看到或确认什么
Please reply: passed / failed / blocked / skipped + 说明
```

用户反馈后，立即更新 `human-report.md`。失败或阻塞时，追问最少必要信息：实际现象、期望差异、截图/日志/错误信息（如有）、是否继续定位或先结束报告。

## `human-report.md`

推荐结构：

```md
# HAT Copilot Report

## Scope

## Progress
- [ ] Environment
- [ ] Data and accounts
- [ ] P0 acceptance
- [ ] P1/P2 acceptance
- [ ] Final summary

## Environment

## Acceptance Cases

### P0
- [ ] P0-001 ...
  - Status:
  - Human result:
  - Notes:
  - Next:

### P1

### P2

## Follow-ups
- [ ] ...
```

报告保持可读和可续跑：记录人类结论、关键证据、简短辅助动作摘要和下一步。长日志、完整命令输出和大段响应使用路径或简短摘录引用。

## 代码修复切换

`hat-copilot` 的默认目标是验收和报告。遇到失败时先记录可复现信息、影响和当前判断；用户要求修复时，说明将切换到实现/修复流程，修复后回到当前 case 复测并更新报告。

## 完成回复

最终回复列出：

- `human-report.md` 路径。
- 验收总状态。
- P0/P1/P2 结果概览。
- 失败、阻塞和待复测项。
- 建议下一步。
