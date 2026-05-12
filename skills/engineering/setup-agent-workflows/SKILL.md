---
name: setup-agent-workflows
description: 为多智能体工程协作搭建可选的项目级或用户级工作流编排文档。在仓库或用户目录需要共享智能体工作流地图、交接/来源清单规则，或关于 PRD、issue、HAT、review、PR 链的持久化约定时使用。
---

# 搭建智能体工作流（Setup Agent Workflows）

为长期运行或多智能体工程工作搭建可选的工作流指引。本技能不替代也不依赖 `/setup-matt-pocock-skills`；它增加一份任意智能体在产出持久化产物或向下游交接前都可阅读的共享工作流地图与交接策略。默认推荐写入用户目录，以便与多人协作项目隔离；也可按用户确认写入本地项目，形成仓库共享约定。

## 流程

### 1. 确认写入位置

起草前先向用户确认写入位置，并推荐**用户目录**：

- **用户目录（推荐）**：写入 `~/.agents/docs/agents/workflows.md` 与 `~/.agents/docs/agents/handoff-policy.md`，并更新 `~/.claude/CLAUDE.md` 与 `~/.codex/AGENTS.md` 的简短指针。此模式用于跨项目共享个人偏好，并与多人协作项目隔离。
- **本地项目**：写入当前仓库的 `docs/agents/workflows.md`、`docs/agents/handoff-policy.md`，并更新仓库根目录已有的 `AGENTS.md` / `CLAUDE.md` 指针。此模式用于团队希望共享同一套仓库工作流约定。

确认后，将后续流程中的变量设为：

| 模式 | `<docs-root>` | `<pointer-files>` |
| --- | --- | --- |
| 用户目录 | `~/.agents/docs/agents` | `~/.claude/CLAUDE.md`、`~/.codex/AGENTS.md` |
| 本地项目 | `docs/agents` | 仓库根目录已有的 `AGENTS.md` / `CLAUDE.md` |

若选择本地项目且仓库根目录没有 `AGENTS.md` 或 `CLAUDE.md`，询问要创建哪一个；若已有一个或两个，只更新已有文件。

### 2. 探索

根据已选位置检视上下文：

- 用户目录：检查 `~/.agents/docs/agents/`、`~/.claude/CLAUDE.md`、`~/.codex/AGENTS.md`，并参考当前对话语言。
- 本地项目：检查仓库根目录智能体说明文件、已有 `docs/agents/`、README、包文档、可见工作流约定、技能列表、项目文档语言。

### 3. 起草

起草 `<docs-root>/workflows.md` 与 `<docs-root>/handoff-policy.md`。用户目录模式使用用户当前对话或既有用户级文档的主要语言；本地项目模式使用仓库文档的主要语言。`<pointer-files>` 只放简短指针。

`workflows.md` 包含分层推荐链路：

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

`handoff-policy.md` 为跨智能体持久化产物规定必需的**来源清单（Source Manifest）**，适用于：

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

指针章节使用同一模板，写入时将 `<docs-root>` 替换为实际路径：

```markdown
## Agent workflows

在创建 PRD、issue、HAT 产物、审查报告、PR，或将工作交给其他智能体之前，请先阅读 `<docs-root>/workflows.md` 与 `<docs-root>/handoff-policy.md`。持久化产物必须保留其来源清单（Source Manifest），以便下游智能体重读原始来源，而非仅依赖摘要。
```

### 4. 展示与确认

向用户展示：

- 已确认的写入位置：本地项目或用户目录。
- `<docs-root>/workflows.md` 与 `<docs-root>/handoff-policy.md` 的计划内容。
- `<pointer-files>` 中要新增或更新的指针章节。

除非用户明确说要立即应用本搭建，否则先征求确认再写入。

### 5. 写入

- 创建或更新 `<docs-root>/workflows.md` 与 `<docs-root>/handoff-policy.md`。
- 创建或更新 `<pointer-files>` 中的 `## Agent workflows` 章节。
- 若已有等价章节，就地更新，勿追加重复段落。
- 保留用户撰写的无关内容。
- 用户目录模式不修改当前仓库的 `docs/agents/`、`AGENTS.md` 或 `CLAUDE.md`，除非用户另外明确要求。

### 6. 完成

汇报已写入的文件与当前可用的一致工作流约定。说明本搭建为可选，且独立于 `/setup-matt-pocock-skills`。
