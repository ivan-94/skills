---
name: hat-dispatch
description: Dispatch HAT runs for GitHub PRs labeled HAT-Ready. Use when the user wants to scan ready-to-HAT pull requests, fan out sub-agents in isolated worktrees, run existing HAT guides, post HAT result comments, and move HAT labels.
---

# HAT Dispatch

HAT Dispatch scans GitHub pull requests that are ready for acceptance testing, fans out one sub-agent per PR, runs `/hat-run` in isolated worktrees, and writes the HAT result back to each PR.

It is the follow-up workflow after `/deliver-issue`. It does not implement fixes, run TDD, or execute HAT in the current worktree.

## Boundary

- Only support GitHub PRs through `gh` in the first version.
- Default selection is open PRs with the `HAT-Ready` label.
- Draft PRs are eligible.
- The current worktree is only for scanning, dispatching, summarizing, and writing GitHub comments/labels.
- Never run HAT directly in the current worktree.
- Each PR must run in its own worktree or checkout under `.scratch/hat-dispatch/pr-<number>/`.
- Do not trigger repairs, TDD, commits, pushes, issue edits, or implementation changes.
- Do not edit old PR comments. Add a new comment for every dispatch result.
- Do not write secrets to comments, summaries, logs, or labels.
- Do not silently create labels. If a target label does not exist, include that in the dispatch plan and wait for confirmation before creating it.

## Invocation

Supported forms:

- Default: scan all open PRs with `HAT-Ready`.
- Specific PRs: run only the user-provided PR numbers, such as `#123 #124`.
- Dry run / list only: list the queue and planned actions, then stop.
- Prepare allowed by default: workers may run `prepare.sh prepare` according to `/hat-run` safety rules unless the user explicitly disables prepare at invocation time.

If `gh` is missing, unauthenticated, or the repo is not GitHub, stop and report the missing prerequisite.

## Discovery

Before spawning workers:

- Check `gh auth status` and repo identity.
- Read PR numbers, titles, labels, draft state, head refs, head SHAs, and authors.
- For default mode, query open PRs with `HAT-Ready`.
- For specific PRs, verify each PR is open and note whether it has `HAT-Ready`.
- Detect old HAT result labels: `HAT-Passed`, `HAT-Blocked`, `HAT-Needs-Human`.
- Inspect PR body for likely HAT paths, but do not require them. Missing paths are worker-discovered or reported as `BLOCKED`.
- Decide each worktree path: `.scratch/hat-dispatch/pr-<number>/`.
- If a worktree already exists, compare the recorded or checked-out head SHA to the PR head SHA and decide whether to reuse, fetch/reset, or recreate.

## Dispatch Plan Gate

Always present a dispatch plan and wait for confirmation before spawning workers or writing to GitHub.

The plan must include:

- PR number, title, draft state, head ref, and head SHA.
- Current HAT labels and old result labels.
- Worktree path.
- Whether HAT guide/prepare paths were visible in the PR body.
- Whether `prepare.sh prepare` is allowed.
- Which PRs will be dispatched, skipped, or only listed.
- External writes that will happen: PR comments and label changes.
- Missing labels that require creation confirmation.

Fan-out concurrency is not hardcoded. The executing agent chooses how many sub-agents to spawn based on resource risk, local services, ports, DB usage, and task count.

## Worktree Rules

- Use independent worktrees or checkouts, one per PR.
- The worker must run against the PR head SHA that was recorded in the dispatch plan.
- Default path: `.scratch/hat-dispatch/pr-<number>/`.
- Worktrees and reports are kept by default for later inspection.
- Cleanup happens only when the user explicitly asks.
- If the PR head SHA changes during execution, the result is stale and must not change final labels.

## Worker Prompt Contract

Give each sub-agent a focused prompt. Include only the PR-specific context it needs.

```text
You are running HAT for PR #<number> in an isolated worktree.

Rules:
- Work only inside <worktree-path>.
- Verify the checkout is at PR head SHA <head-sha>.
- Read the PR body if available, repo HAT.md if present, and the HAT guide/prepare artifacts in the worktree.
- Find the relevant hats/.../guide.md and hats/.../prepare.sh. Prefer paths from the PR body; otherwise discover them in the repo.
- Run /hat-run against the prepared HAT artifacts.
- Do not implement fixes, edit product code, commit, push, or comment on GitHub.
- Do not run prepare.sh prepare unless prepare is allowed in the dispatch plan: <true|false>.
- If prepare is not allowed and the HAT requires it, mark the run BLOCKED with the reason.
- Redact secrets from every report and returned summary.

Return a structured result with:
- pr_number
- pr_title
- start_head_sha
- worktree_path
- guide_path
- prepare_path
- prepare_allowed
- prepare_executed
- overall_status
- p0_count, p1_count, p2_count
- manual_count
- manual_summary
- fail_or_block_reason
- report_dir
- summary_path
- results_json_path
- logs_path
- artifact_highlights
- notes_for_pr_comment
```

The worker must preserve `/hat-run` outputs:

```text
hats/.../reports/YYYYMMDD-HHMMSS/
  summary.md
  results.json
  logs.md
  artifacts/
```

If `results.json` or `summary.md` is missing or cannot be parsed, the main agent treats the PR as `HAT-Blocked` with reason `hat-run report missing/unparseable`.

## HAT Execution Defaults

- Workers use existing repo/worktree files: `HAT.md`, `guide.md`, `prepare.sh`, `.env.hat.example`, and local `.env.hat` if present.
- Do not ask for secrets during fan-out.
- Missing env, accounts, services, HAT artifacts, or explicitly disabled prepare required by the HAT should become `BLOCKED`.
- Default `/hat-run` scope follows the `hat-run` skill: P0+P1, P0 fail-fast, P2 skipped unless the user requested otherwise.
- Default prepare behavior: run `prepare.sh info`, and run `prepare.sh prepare` when `/hat-run` determines it is needed and allowed by its safety rules.
- If invocation explicitly disables prepare, workers must not run `prepare.sh prepare`; if the HAT requires it, report `BLOCKED`.

## Stale Head Protection

Before writing a PR comment or changing labels, reread the PR head SHA.

If it differs from the worker's `start_head_sha`:

- Mark the result as stale in the dispatch summary.
- Add a PR comment explaining that HAT ran against an older head SHA.
- Do not add a result label.
- Do not remove `HAT-Ready`.
- Do not remove old result labels.

## Result Mapping

Use `results.json` first, then `summary.md` for human details.

Map `overall_status` to labels:

- `PASS`, `PASS_WITH_NOTES` -> `HAT-Passed`
- `RISK_FOUND`, `MANUAL_REQUIRED` -> `HAT-Needs-Human`
- `BLOCKED`, `FAIL`, `ERROR` -> `HAT-Blocked`

After a non-stale result is processed:

- Remove `HAT-Ready`.
- Remove old result labels: `HAT-Passed`, `HAT-Blocked`, `HAT-Needs-Human`.
- Add the new mapped result label.

If a mapped target label does not exist, ask for confirmation before creating it. Do not silently create labels.

## PR Comment

Every processed PR gets a new comment. Start exactly with:

```md
> This was generated by AI during HAT dispatch.
```

Keep the comment concise. Do not paste the full HAT summary.

Include:

- Overall status.
- Result label.
- Report path.
- P0/P1/P2 counts.
- `HUMAN MANUAL` count and the top manual item, if any.
- Primary `FAIL` / `BLOCKED` reason, if any.
- Important artifact paths.
- Next step recommendation.
- Stale head notice, if applicable.

Example shape:

```md
> This was generated by AI during HAT dispatch.

## HAT Result
- Overall: `MANUAL_REQUIRED`
- Label: `HAT-Needs-Human`
- Report: `hats/20260508-title/reports/20260508-153012/summary.md`
- Counts: P0 `3/3 PASS`, P1 `1 MANUAL`, P2 `SKIPPED`
- Human manual: 1 item, browser visual confirmation required
- Artifacts: `hats/.../reports/.../artifacts/`

## Next Step
Human confirmation is required before this PR can be considered HAT-passed.
```

## Final Summary

After dispatch completes, report:

- `scanned`, `dispatched`, `skipped`, `stale`, and `updated` counts.
- One line per PR: number, title, overall status, result label, report path, comment URL if available.
- PRs not executed and why.
- Failures or blockers requiring user action.
- Whether any labels were missing or created.

## Safety Notes

- Treat `HAT-Ready` as a re-run signal. If a PR has old HAT result labels and `HAT-Ready`, plan to rerun and replace old labels after a non-stale result.
- Keep fan-out worker prompts minimal and PR-specific.
- Do not ask users for secrets in the middle of fan-out.
- Redact obvious tokens, passwords, DB URLs, cookies, and API keys.
- If a worker fails unexpectedly, preserve its worktree and logs, mark that PR `HAT-Blocked`, and explain the failure in the PR comment.
