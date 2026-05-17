---
name: cross-review
description: "Run a real read-only dual-track code review: invoke the opposite CLI for external cross-review and run a same-environment self-review subagent in parallel when possible. Use when the user asks for cross review, 交叉 review, Claude/Codex mutual review, self-review plus cross-review, or an independent review with P0/P1/P2 findings."
---

# Cross Review

Cross Review gets two independent read-only code reviews from the same review brief:

- External cross-review by actually invoking the opposite coding agent CLI.
- Self-review by launching a same-environment review subagent from the caller side.

Both tracks must complete successfully. This is not a prompt draft and not an implementation pass.

## Core Contract

- Must invoke the opposite CLI:
  - Codex calls `claude`.
  - Claude Code calls `codex`.
- Must also run a same-environment self-review subagent:
  - Codex launches a Codex subagent.
  - Claude Code launches a Claude Code subagent/task.
- Prefer running the external review and self-review in parallel. If the host environment cannot run them concurrently, run them sequentially.
- Both reviewers must be read-only.
- Both reviewers must not modify files.
- Both reviewers must receive the same review brief, with only the reviewer role adjusted.
- Both reviewers decide the review scope from the task context, repo state, and artifacts available in the workspace.
- The caller may gather whatever context is useful, but this skill does not require a fixed preflight checklist.
- The caller must not fall back to reviewing the code itself if either track fails.
- The caller must merge the external review and self-review into one combined result with source attribution.
- For the external CLI run, save the prompt, command metadata, raw output, stderr, exit code, and duration.

## CLI Invocation

This section covers the external review track. It must use the opposite CLI.

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
codex -a never exec --sandbox read-only "$PROMPT"
```

Keep the run read-only:

- Do not use `--dangerously-bypass-approvals-and-sandbox`.
- Use `--sandbox read-only`.
- Use `-a never` before the `exec` subcommand so Codex cannot ask to escalate permissions.
- Equivalent config-override shape, useful in scripts:

  ```bash
  codex exec --sandbox read-only -c 'approval_policy="never"' "$PROMPT"
  ```

- If read-only operation cannot be guaranteed, stop and report failure.

## Self-Review Invocation

Launch a same-environment review subagent from the caller side:

- Codex should fork a subagent for self-review.
- Claude Code should use its subagent/task mechanism for self-review.
- The subagent must be instructed to act as an independent read-only reviewer.
- The subagent must not modify files.
- The subagent should receive the shared review brief, not the full chat history by default.
- The subagent should not rely on caller judgment, implementation rationale, or defensive explanations.
- If no same-environment subagent/task mechanism is available, treat the whole cross-review as failed.

Self-review does not need the same raw command log as the external CLI run. Its findings still must appear in the final merged result with clear source attribution.

## Prompt The Reviewers

Create one shared review brief, then send it to both reviewers with only the reviewer role adjusted. Do not dump the entire conversation by default.

Include:

- The reviewer role:
  - External example: "You are Claude Code being invoked by Codex for a read-only external cross-review."
  - Self-review example: "You are a same-environment self-review subagent. Review independently and do not rely on caller judgment."
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

The reviewers should independently inspect the workspace and decide what to review. The caller should not force a base branch, staged-only diff, working-tree-only diff, commit range, or path filter unless the user explicitly requested that scope.

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

If a reviewer has non-blocking context that does not meet `P0`/`P1`/`P2`, it can go in notes, not findings.

## Reviewer Commands

Reviewers may run read-only commands when useful. They are not required to run tests.

- Static inspection is acceptable.
- Existing test results supplied by the caller can be used as context.
- If a reviewer runs commands, it should report what it ran and what happened.
- Tests may write caches, snapshots, coverage, databases, or logs, so they are not required by this skill.
- Each reviewer must preserve the read-only constraint.

## Logging

For every external CLI run, create a report under:

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

The same-environment self-review subagent does not need a separate raw command log, but its findings must be preserved in the final response.

## Merge The Reviews

After both tracks finish, merge the findings into one combined review result:

- Preserve every `P0`, `P1`, and `P2` finding from both reviewers.
- Attribute each finding to `external`, `self`, or `both`.
- If both reviewers report the same issue, merge it into one finding, mark the source as `both`, and use the higher severity.
- If reviewers assign different severities to the same issue, preserve the difference, for example `external P1, self P2`.
- If only one reviewer reports an issue, keep it with that source. Absence from the other reviewer is not a disagreement by itself.
- If reviewers directly conflict, such as one calling behavior a bug and the other calling it intended, put the conflict in `Disagreements`.
- Caller judgments may be included, but they must be clearly marked as caller judgment and must not be attributed to either reviewer.
- Do not silently remove `P0` or `P1` findings, downgrade severity, or blur the source of a finding.

## Failure Behavior

Default timeout: 15 minutes.

Treat these as cross-review failure:

- Opposite CLI is missing.
- Same-environment self-review subagent/task mechanism is unavailable.
- Non-interactive mode is unavailable.
- Read-only mode cannot be reasonably guaranteed.
- The CLI exits non-zero.
- Either review track exits non-zero or otherwise fails.
- Either review track times out.
- Either reviewer output is empty or not a meaningful review.
- The caller cannot produce a merged result with source attribution.

On failure:

- Save the external CLI log, including partial stdout/stderr if available.
- Tell the user cross-review did not complete.
- Do not invent findings.
- Do not treat a single successful track as a successful cross-review.
- Suggest the concrete reason to retry, such as installing the CLI, authenticating it, enabling subagents, or rerunning after fixing permissions.

## Final Response

After a successful cross-review, report:

- Which reviewer CLI ran.
- The external CLI log path.
- That the self-review subagent also completed.
- A merged review result with source attribution for each finding.
- Any disagreements between reviewers.
- Any caller notes separately, clearly marked as caller notes.

The caller may organize the review for readability, but must not silently remove `P0`/`P1` findings, downgrade severity, or attribute its own judgment to either reviewer.

If the caller disagrees with a reviewer finding, say so separately and explain why.
