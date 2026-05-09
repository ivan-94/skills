---
name: setup-agent-workflows
description: Sets up optional project-level workflow orchestration docs for multi-agent engineering work. Use when a repo needs shared agent workflow maps, handoff/source-manifest rules, or durable conventions for PRD, issue, HAT, review, and PR chains.
---

# Setup Agent Workflows

Set up optional project-level workflow guidance for long-running or multi-agent engineering work. This skill does not replace or depend on `/setup-matt-pocock-skills`; it adds a shared workflow map and handoff policy that any agent can read before producing durable artifacts or passing work downstream.

## Process

### 1. Explore

Inspect the repo before drafting:

- Existing agent instruction files at the repo root, especially `AGENTS.md` and `CLAUDE.md`.
- Existing `docs/agents/` files.
- README, package docs, and visible workflow conventions.
- Available skills from the current skill list, README, or plugin metadata.
- The apparent language of the project docs.

If no `AGENTS.md` or `CLAUDE.md` exists, ask which one to create. If one or both exist, update every existing file with the same short active pointer.

### 2. Draft

Draft these project docs:

```text
docs/agents/
  workflows.md
  handoff-policy.md
```

Use the repo's apparent documentation language for generated docs. Keep detailed rules in `docs/agents/*.md`; keep root agent instruction files short.

`workflows.md` should include layered recommended chains:

- Clarification: `/grill-me` or `/grill-with-docs` -> optional `/prototype` -> `/to-prd`.
- Planning: `/to-prd` -> `/to-issues` -> `/triage`.
- Delivery: `/deliver-issue`, which coordinates `/tdd` -> `/cross-review` -> `/hat-prepare` -> commit -> Draft PR + `HAT-Ready`.
- HAT: `/hat-dispatch` -> isolated worker -> `/hat-run` -> PR comment and label update.
- Bugs: `/triage` or bug report -> `/diagnose` -> regression fix -> `/cross-review` -> `/create-pr`.
- Architecture: `/zoom-out` -> `/improve-codebase-architecture` -> `/grill-with-docs` -> `/to-prd` or `/to-issues`.
- Frontend acceptance: `/hat-frontend-friendly` -> `/hat-prepare` or `/hat-run`.
- Cross-agent continuity: durable artifacts preserve rereadable source references.

`handoff-policy.md` should define a required Source Manifest for durable cross-agent artifacts:

- PRDs.
- Issues or agent briefs.
- HAT guides and HAT reports.
- PR bodies.
- Cross-review or code-review reports.
- Explicit handoff documents.

The Source Manifest must include:

- `Sources` — original files, issue/PR URLs, specs, comments, discussions, traces, logs, or screenshots the next agent should reread.
- `Produced artifacts` — paths or URLs created by this step.
- `Key decisions` — decisions made here, with enough context to avoid re-litigating them accidentally.
- `Verification evidence` — commands, tests, reports, HAT results, review logs, or explicit not-run reasons.
- `Open questions / risks` — unresolved decisions, blocked items, known risks, and the next recommended workflow step.

Make the policy mandatory for durable artifacts, not for every small chat response.

### 3. Present and confirm

Show the user:

- The agent instruction block to add or update.
- The planned contents of `docs/agents/workflows.md`.
- The planned contents of `docs/agents/handoff-policy.md`.

Ask for confirmation before writing unless the user explicitly asked you to apply the setup immediately.

### 4. Write

Create or update `docs/agents/workflows.md` and `docs/agents/handoff-policy.md`.

In each existing root agent instruction file, add or update one concise section:

```markdown
## Agent workflows

Before creating PRDs, issues, HAT artifacts, review reports, PRs, or handing work to another agent, read `docs/agents/workflows.md` and `docs/agents/handoff-policy.md`. Durable artifacts must preserve their Source Manifest so downstream agents can reread original sources instead of relying on summaries.
```

If an equivalent section already exists, update it in place instead of appending a duplicate. Do not overwrite unrelated user-authored content.

### 5. Done

Report the files written and the workflow conventions now available. Mention that this setup is optional and independent of `/setup-matt-pocock-skills`.
