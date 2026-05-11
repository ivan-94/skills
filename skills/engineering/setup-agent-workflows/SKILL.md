---
name: setup-agent-workflows
description: 为多智能体工程协作搭建可选的项目级工作流编排文档。在仓库需要共享的智能体工作流地图、交接/来源清单规则，或关于 PRD、issue、HAT、review、PR 链的持久化约定时使用。
---

# 搭建智能体工作流（Setup Agent Workflows）

为长期运行或多智能体工程工作搭建可选的项目级工作流指引。本技能不替代也不依赖 `/setup-matt-pocock-skills`；它增加一份任意智能体在产出持久化产物或向下游交接前都可阅读的共享工作流地图与交接策略。

## 流程

### 1. 探索

起草前先检视仓库：

- 仓库根目录下已有的智能体说明文件，尤其是 `AGENTS.md` 与 `CLAUDE.md`。
- 已有的 `docs/agents/` 下文件。
- README、包文档及可见的工作流约定。
- 当前技能列表、README 或插件元数据中可用的技能。
- 项目文档所使用的主要语言。

若不存在 `AGENTS.md` 或 `CLAUDE.md`，询问要创建哪一个。若已存在一个或两个，用同一段简短的「活跃指针」更新每一个已有文件。

### 2. 起草

起草下列项目文档：

```text
docs/agents/
  workflows.md
  handoff-policy.md
```

生成文档时使用仓库文档所使用的主要语言。详细规则放在 `docs/agents/*.md`；根目录的智能体说明文件保持简短。

`workflows.md` 应包含分层的推荐链路：

- 澄清：`/grill-me` 或 `/grill-with-docs` -> 可选 `/prototype` -> `/to-prd`。
- 规划：`/to-prd` -> `/to-issues` -> `/triage`。
- 交付和实现：
  + 常规: `/tdd` -> `/cross-review` -> `/hat-prepare`。
  + 内置研发流程 Skill `/deliver-issue`: 这个 Skill 会协调 `/tdd` -> `/cross-review` -> `/hat-prepare` -> 提交 -> Draft PR + `HAT-Ready`。
- 缺陷：`/triage` 或缺陷报告 -> `/diagnose` -> 回归修复 -> `/cross-review` -> `/create-pr`。
- 架构：`/zoom-out` -> `/improve-codebase-architecture` -> `/grill-with-docs` -> `/to-prd` 或 `/to-issues`。
- 验收准备和执行：
 + 常规流程：`/hat-prepare` 或 `/hat-run`。
 + Agent 批量执行：`/hat-dispatch` -> 隔离 worker -> `/hat-run` -> PR 评论与标签更新。
 + 仓库基础设施改造：
   - 前端 HAT 友好化改造： `/hat-frontend-friendly` 
   - 后端 HAT 友好化改造： `/hat-backend-friendly`
- 跨智能体连续性：持久化产物保留可重读的来源引用。

`handoff-policy.md` 应为跨智能体持久化产物规定必需的**来源清单（Source Manifest）**，适用于：

- PRD。
- Issue 或智能体简报。
- HAT 指南与 HAT 报告。
- PR 正文。
- 交叉 review 或代码审查报告。
- 显式交接文档。

来源清单必须包含：

- `Sources` —— 原始文件、issue/PR URL、规格、评论、讨论、追踪、日志或截图等，供下一位智能体重读。
- `Produced artifacts` —— 本步骤产出的路径或 URL。
- `Key decisions` —— 在此做出的决策，附足够上下文，避免无意重开争论。
- `Verification evidence` —— 命令、测试、报告、HAT 结果、review 日志，或明确说明未执行的原因。
- `Open questions / risks` —— 未决事项、阻塞项、已知风险，以及建议的下一步工作流。

将该策略规定为**持久化产物**的硬性要求，而非每次简短聊天回复都要遵守。

### 3. 展示与确认

向用户展示：

- 要新增或更新的智能体说明段落。
- 计划写入的 `docs/agents/workflows.md` 内容。
- 计划写入的 `docs/agents/handoff-policy.md` 内容。

除非用户明确说要立即应用本搭建，否则先征求确认再写入。

### 4. 写入

创建或更新 `docs/agents/workflows.md` 与 `docs/agents/handoff-policy.md`。

在每个已有的根目录智能体说明文件中，新增或更新一节简明内容：

```markdown
## Agent workflows

在创建 PRD、issue、HAT 产物、审查报告、PR，或将工作交给其他智能体之前，请先阅读 `docs/agents/workflows.md` 与 `docs/agents/handoff-policy.md`。持久化产物必须保留其来源清单（Source Manifest），以便下游智能体重读原始来源，而非仅依赖摘要。
```

若已有等价章节，就地更新，勿追加重复段落。不要覆盖与用户撰写的无关内容。

### 5. 完成

汇报已写入的文件与当前可用的一致工作流约定。说明本搭建为可选，且独立于 `/setup-matt-pocock-skills`。
