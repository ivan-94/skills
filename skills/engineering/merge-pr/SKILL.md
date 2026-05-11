---
name: merge-pr
description: Merge a ready GitHub PR through gh CLI with isolated worktrees, conservative conflict handling, required tests, merge queue support, and post-merge target-branch verification. Use when the user asks to merge a PR, merge the current branch PR, resolve merge conflicts before merging, enqueue a PR, or verify a PR after merge.
---

# Merge PR

Merge PR is a merge-operator skill for PRs that are already ready to merge. It does not replace PR review, approval, delivery, or CI. It prepares and performs the merge through GitHub, then verifies the real target branch.

## Boundary

- Only support GitHub PRs through `gh` CLI.
- The final merge must use `gh pr merge`; never complete the merge by pushing a local `git merge` result to the base branch.
- Default to preparing the merge plan, resolving safe blockers, and stopping for explicit user confirmation before the real merge.
- Do not do general PR review; only review conflict-resolution changes made by this skill.
- Do not bypass branch protection, dismiss reviews, skip checks, admin-merge, force push, edit protection rules, manually push to base, auto-revert, or merge multiple PRs at once.

## Inputs

Support PR number, PR URL, and current-branch PR requests such as `merge this PR`. If the PR is not explicit, infer it with `gh pr view` / `gh pr status`. If discovery is missing or ambiguous, stop and ask.

## Discovery

Before changing anything, gather `gh` availability/auth/repo identity, default branch, allowed merge methods, repo rules, current worktree status, existing worktrees, PR head/base refs, writable status, and project test or merge-gate rules from `AGENTS.md`, `CLAUDE.md`, PR test plan, CI config, package scripts, Makefile, README, or project docs.

Read PR state with `gh pr view <pr> --json number,title,state,isDraft,baseRefName,headRefName,headRepository,baseRepository,isCrossRepository,maintainerCanModify,mergeStateStatus,reviewDecision,statusCheckRollup,mergeable`.

Block immediately if `gh` is missing, unauthenticated, the repo is not GitHub, the PR is closed, the PR is Draft, required reviews/checks are not satisfied, branch protection blocks the user, or the PR cannot be identified.

## Worktree Isolation

- Do not resolve conflicts, update branches, or run merge experiments in the user's current worktree.
- Use `git worktree list --porcelain` and prefer an existing clean worktree for the PR head branch or a path clearly matching `pr-<number>` / `merge-pr-<number>`.
- If none exists, create one under a repo-sibling path such as `<repo>.worktrees/pr-<number>`.
- Stop if a reused worktree has unrelated dirty changes. Default to keeping worktrees; only remove ones created by this run when the user explicitly asks and they are clean.

## Fork PRs

Same-repo PRs may receive low-risk conflict-fix commits. Fork PRs default to read-only verification and a merge plan. Only push conflict fixes to a fork when `maintainerCanModify` and actual push access are confirmed. If the fork is not writable, report the required author update or a patch summary; do not push to base or an integration branch as a workaround.

## Conflict Handling

If the PR is already mergeable, do not update the PR branch just to be tidy. If GitHub requires the PR branch to be updated or conflicts must be resolved:

- Prefer merging latest base into PR head. Do not default to rebase. Never force push unless the user explicitly confirms that exact operation.
- Automatically resolve only low-risk conflicts: regenerated lockfiles, generated snapshots, import/order/format conflicts, independent code blocks, or docs/changelog append conflicts.
- Stop for human intervention on business-logic conflicts, migrations, schemas, APIs, auth, permissions, billing, infra, deployment, data loss, contradictory tests, or any case the agent cannot explain confidently.
- After resolving conflicts, create a clear commit such as `Resolve merge conflicts for PR #123` and push normally when the branch is writable.
- Review only the conflict-resolution commit and conflict areas, checking for conflict markers, broken generated files, semantic surprises, and lockfile anomalies.
- Run the required relevant tests after conflict resolution. Any failure blocks the merge.

## Test Gates

- If project merge-gate commands are clear, use them.
- After conflict resolution, run affected lint/typecheck/test commands and any generate/build/install checks implied by changed lockfiles or generated files.
- Before the real merge, ensure required GitHub checks and project-required local checks are satisfied.
- If no reliable merge gate can be found, stop and ask. Do not invent a light command and treat it as sufficient.
- If the full gate is expensive, show it and ask before downgrading to smoke or selected tests.

## Merge Plan Gate

Before calling `gh pr merge`, show a plan and wait for explicit confirmation. Include:

- PR number/title, base/head, same-repo or fork, and writable status.
- Worktree path, PR state, review/check/branch-protection status, and mergeability.
- Merge method recommendation: repo/PR default unless the user specified merge, squash, or rebase.
- Whether merge queue or auto-merge will be used.
- Conflict-resolution commits pushed by this skill, tests run, tests still required, and accepted risks.
- The exact `gh pr merge` command shape, without secrets.

## Merge Execution

- Use repo/PR default merge method unless the user explicitly specifies a method or GitHub requires a queue/auto-merge path.
- If queueing is required, use the GitHub-supported path such as `gh pr merge --auto` when appropriate. Report `queued` / `auto-merge enabled`; do not claim the PR is merged until GitHub reports it merged.
- If base changes between plan and execution, refresh PR state and repeat required checks before merging.
- Never bypass GitHub by pushing a local merge result to the target branch.

## Post-Merge Verification

- Use an isolated target-branch worktree, fetch, and checkout the latest remote base branch.
- Confirm the target branch contains the merged PR result.
- Run the project merge gate on the real target branch by default.
- Downgrade to smoke only when project docs say so or the user explicitly accepts the risk.
- If post-merge verification cannot run, the final status cannot be `MERGED_AND_VERIFIED`.

## Statuses

- `MERGED_AND_VERIFIED`: `gh pr merge` completed and target-branch verification passed.
- `MERGED_WITH_POST_MERGE_FAILURE`: merge completed, but post-merge verification failed or could not run.
- `QUEUED_OR_AUTO_MERGE_ENABLED`: GitHub queue/auto-merge is active, but the PR is not yet merged.
- `BLOCKED`: merge did not happen because of conflicts, permissions, Draft state, required gates, test failures, unclear merge gate, dirty worktree, or unresolved risk.

## Completion

Final response must include:

- Final status, PR URL/number, base/head, and merge method or queue state.
- Worktree paths, conflict-resolution summary, and pushed commits, if any.
- Tests/checks run before merge and after merge, plus target branch SHA verified after merge.
- Any blockers, post-merge failures, accepted risks, and recommended revert/fix-forward next steps.
