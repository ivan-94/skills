---
name: cross-review
description: Run a real read-only cross-agent code review by invoking the opposite CLI: Codex calls Claude Code, Claude Code calls Codex. Use when the user asks for cross review, 交叉 review, Claude/Codex mutual review, or an independent agent review with P0/P1/P2 findings.
---

# Cross Review

Cross Review gets an independent code review from the other coding agent by actually invoking its CLI. It is not a self-review, not a prompt draft, and not an implementation pass.

## Core Contract

- Must invoke the opposite CLI:
  - Codex calls `claude`.
  - Claude Code calls `codex`.
- The reviewer must be read-only.
- The reviewer must not modify files.
- The caller must not fall back to reviewing the code itself if cross-review fails.
- The reviewer decides the review scope from the task context, repo state, and artifacts available in the workspace.
- The caller may gather whatever context is useful, but this skill does not require a fixed preflight checklist.
- Save the prompt, command metadata, raw output, stderr, exit code, and duration for every run.

## CLI Invocation

### Codex Calling Claude Code

Use Claude Code's non-interactive mode:

```bash
claude -p "$PROMPT"
```

Keep the run read-only:

- Do not use `--dangerously-skip-permissions`.
- Deny editing tools when supported, such as `Edit`, `Write`, `MultiEdit`, and `NotebookEdit`.
- Prefer read-only tools and commands.
- If read-only operation cannot be reasonably guaranteed, stop and report failure.

Example shape:

```bash
claude -p "$PROMPT" \
  --disallowedTools Edit Write MultiEdit NotebookEdit
```

Use stricter tool allowlists when the local Claude Code version and project setup make that practical.

### Claude Code Calling Codex

Use Codex's non-interactive mode:

```bash
codex exec --sandbox read-only --ask-for-approval never "$PROMPT"
```

Keep the run read-only:

- Do not use `--dangerously-bypass-approvals-and-sandbox`.
- Use `--sandbox read-only`.
- Use `--ask-for-approval never` so Codex cannot escalate into writes.
- If read-only operation cannot be guaranteed, stop and report failure.

## Prompt The Reviewer

Tell the reviewer the rules and provide the task context it needs. Do not dump the entire conversation by default.

Include:

- The reviewer role, for example: "You are Claude Code being invoked by Codex for a read-only cross-review."
- The current task or issue being solved.
- Important implementation context the caller knows.
- Test, lint, build, HAT, or manual verification results already run.
- Relevant issue, PRD, design doc, report, commit, or artifact paths.
- Known risks, uncertainty, or areas the caller especially wants checked.
- The severity rules from this skill.
- The no-P3 policy from this skill.
- A direct instruction not to modify files.

Avoid:

- Full chat history unless it is necessary for the review.
- Secrets, tokens, private credentials, or unnecessary personal context.
- Long defensive explanations of why the implementation is correct.
- Duplicating large artifacts already available by path or URL.

The reviewer should independently inspect the workspace and decide what to review. The caller should not force a base branch, staged-only diff, working-tree-only diff, commit range, or path filter unless the user explicitly requested that scope.

## Severity Levels

Only actionable issues belong in findings.

`P0` blocks merge or release:

- Data loss.
- Security vulnerability.
- Production outage or crash.
- Broken core user or business flow.
- Build or test system completely unusable for the change.
- Severe correctness issue with high confidence.

`P1` should be fixed before merge:

- Clear bug or behavioral regression.
- Permission, state, concurrency, or boundary-condition error.
- Important compatibility issue.
- Important missing test for changed behavior.
- Failure mode likely to affect real users or operators.

`P2` is worth fixing:

- Maintainability issue with concrete future cost.
- Local design issue that makes the code harder to evolve.
- Smaller test gap.
- Incomplete error handling.
- Plausible performance risk.
- Ambiguous behavior that should be made explicit.

## No P3 Policy

Do not use `P3`.

Cross-review is for correctness, delivery risk, maintainability risk, and meaningful test gaps. `P3` creates noise and makes independent review less useful.

Do not report:

- Pure style preferences.
- Naming preferences, unless the name causes real ambiguity or violates a project convention.
- Generic "could be cleaner" refactors.
- Formatting issues that project tooling handles automatically.
- Micro-optimizations with no clear impact.
- Compliments, praise, or general commentary as findings.
- Speculative concerns without a concrete failure mode or cost.

If the reviewer has non-blocking context that does not meet `P0`/`P1`/`P2`, it can go in notes, not findings.

## Reviewer Commands

The reviewer may run read-only commands when useful. It is not required to run tests.

- Static inspection is acceptable.
- Existing test results supplied by the caller can be used as context.
- If the reviewer runs commands, it should report what it ran and what happened.
- Tests may write caches, snapshots, coverage, databases, or logs, so they are not required by this skill.
- The reviewer must preserve the read-only constraint.

## Logging

For every run, create a report under:

```text
.scratch/cross-review/YYYYMMDD-HHMMSS-{reviewer}.md
```

Use local time for the timestamp. Create `.scratch/cross-review/` if needed.

The report should include:

- Timestamp.
- Caller agent.
- Reviewer CLI.
- Current working directory.
- Command shape, with secrets redacted.
- Prompt sent to the reviewer, with secrets redacted.
- Duration.
- Exit code.
- Timeout status, if any.
- Raw stdout.
- Raw stderr.

Redact secrets from prompts, commands, outputs, and logs when they are obvious. Do not intentionally place tokens, API keys, passwords, or private credentials in the prompt.

## Failure Behavior

Default timeout: 10 minutes.

Treat these as cross-review failure:

- Opposite CLI is missing.
- Non-interactive mode is unavailable.
- Read-only mode cannot be reasonably guaranteed.
- The CLI exits non-zero.
- The run times out.
- The reviewer output is empty or not a meaningful review.

On failure:

- Save the log, including partial stdout/stderr if available.
- Tell the user cross-review did not complete.
- Do not invent findings.
- Do not perform a self-review as fallback.
- Suggest the concrete reason to retry, such as installing the CLI, authenticating it, or rerunning after fixing permissions.

## Final Response

After a successful cross-review, report:

- Which reviewer CLI ran.
- The log path.
- The review result, preserving the reviewer's meaning.
- Any caller notes separately, clearly marked as caller notes.

The caller may organize the review for readability, but must not silently remove `P0`/`P1` findings, downgrade severity, or attribute its own judgment to the reviewer.

If the caller disagrees with a reviewer finding, say so separately and explain why.
