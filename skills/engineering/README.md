# Engineering

Skills I use daily for code work.

## User-invoked

Reachable only when you type them (`disable-model-invocation: true`).

- **[ask-matt](./ask-matt/SKILL.md)** — Ask which skill or flow fits your situation. A router over the user-invoked skills in this repo.
- **[grill-with-docs](./grill-with-docs/SKILL.md)** — Grilling session that also builds your project's domain model, sharpening terminology and updating `CONTEXT.md` and ADRs inline.
- **[triage](./triage/SKILL.md)** — Move issues through a state machine of triage roles.
- **[improve-codebase-architecture](./improve-codebase-architecture/SKILL.md)** — Scan a codebase for deepening opportunities, present them as a visual HTML report, then grill through whichever one you pick.
- **[setup-matt-pocock-skills](./setup-matt-pocock-skills/SKILL.md)** — Configure this repo for the engineering skills (issue tracker, triage labels, domain doc layout). Run once per repo.
- **[to-issues](./to-issues/SKILL.md)** — Break any plan, spec, or PRD into independently-grabbable issues using vertical slices.
- **[to-prd](./to-prd/SKILL.md)** — Turn the current conversation into a PRD and publish it to the issue tracker.
- **[prototype](./prototype/SKILL.md)** — Build a throwaway prototype — a runnable terminal app for state/logic questions, or several toggleable UI variations.

## Model-invoked

Model- or user-reachable (rich trigger phrasing so the model can reach for them).

- **[agent-context-audit](./agent-context-audit/SKILL.md)** — 审计新 Agent 会话的上下文来源、指令冲突、运行/测试认知、HAT 引导和交接规则。
- **[create-pr](./create-pr/SKILL.md)** — Create or update a GitHub PR with issue linkage, TDD/test evidence, existing HAT results, and reviewer-facing delivery notes.
- **[cross-review](./cross-review/SKILL.md)** — Invoke the opposite CLI for a read-only independent code review: Codex calls Claude Code, Claude Code calls Codex, with P0/P1/P2 findings and no P3 noise.
- **[deliver-issue](./deliver-issue/SKILL.md)** — Deliver GitHub issues through TDD, cross-review, HAT preparation, and a Draft PR labeled `HAT-Ready`.
- **[diagnosing-bugs](./diagnosing-bugs/SKILL.md)** — Disciplined diagnosis loop for hard bugs and performance regressions: reproduce → minimise → hypothesise → instrument → fix → regression-test.
- **[hat-dispatch](./hat-dispatch/SKILL.md)** — Dispatch HAT runs for GitHub PRs labeled `HAT-Ready`, using isolated sub-agents and PR label/comment writeback.
- **[hat-backend-friendly](./hat-backend-friendly/SKILL.md)** — Diagnose backend services for Agent-friendly HAT readiness, with a Chinese doctor-style report and low-intrusion improvement plan.
- **[hat-prepare](./hat-prepare/SKILL.md)** — Prepare HAT (hand acceptance testing) after TDD by generating an environment guide, acceptance checklist, data needs, and an idempotent `prepare.sh`.
- **[hat-run](./hat-run/SKILL.md)** — Run an existing HAT guide by checking the prepared environment, executing automatable acceptance steps, and writing reports with evidence.
- **[hat-frontend-friendly](./hat-frontend-friendly/SKILL.md)** — Add a `window.__hat` frontend control surface so HAT/browser agents can use discoverable business actions instead of brittle component DOM clicks.
- **[merge-pr](./merge-pr/SKILL.md)** — Merge a ready GitHub PR through `gh` CLI with isolated worktrees, conservative conflict handling, required tests, merge queue support, and post-merge target-branch verification.
- **[setup-agent-runtime](./setup-agent-runtime/SKILL.md)** — Set up an Agent Runtime for Compose/devcontainer projects, with isolated worktrees, dynamic ports, project-local sandbox CLI, docs, and cleanup-safe validation.
- **[setup-agent-workflows](./setup-agent-workflows/SKILL.md)** — Set up optional project-level workflow maps and Source Manifest handoff rules for long-running or multi-agent engineering work.
- **[tdd](./tdd/SKILL.md)** — Test-driven development with a red-green-refactor loop. Builds features or fixes bugs one vertical slice at a time.
- **[domain-modeling](./domain-modeling/SKILL.md)** — Actively build and sharpen a project's domain model — challenge terms, stress-test with scenarios, update `CONTEXT.md` and ADRs inline.
- **[codebase-design](./codebase-design/SKILL.md)** — Shared discipline and vocabulary for designing deep modules: small interfaces, clean seams, testable through the interface.
