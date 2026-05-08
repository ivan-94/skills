---
name: create-pr
description: Create or update a GitHub Pull Request with a human-facing implementation report, issue closing linkage, TDD/test summary, existing HAT summary, and reviewer notes. Use after implementation, TDD, or HAT when the user wants to open a PR, prepare a PR body, update an existing PR, link an issue with Closes/Fixes semantics, or summarize delivery progress for human reviewers.
---

# Create PR

Create PR is the delivery closeout skill after implementation, `/tdd`, and optional `/hat-run`. It turns the current branch into a human-readable GitHub PR with honest verification status, issue linkage, and reviewer context.

## Boundary

- Only support GitHub via `gh` CLI in the first version.
- Default to actually creating or updating a PR, but always show a PR plan and wait for user confirmation before external writes.
- Do not truly close issues. Use PR body closing keywords like `Closes #123` only when the issue is clearly fully implemented and user confirms.
- Do not default to commit, stage, rebase, pull, force push, or issue comments.
- Do not run HAT. Only collect existing HAT conclusions from context or reports.
- Do not search the issue tracker for likely issues. Infer issue only from current context, user input, branch/commit references, and upstream artifacts already in the repo.
- If no PR can be created because `gh` is missing, unauthenticated, or repo is not GitHub, output a title/body draft and manual steps.

## Human Progress

Report concise progress to the user at these points:

- Start: branch/diff, issue, tests, HAT, and PR target will be checked.
- After discovery: issue evidence, base/head, commit/dirty state, verification gaps.
- Before tests: which issue test-plan commands will run.
- PR plan: title, body summary, base/head, draft/ready, closing keyword, push/create/update actions.
- During push/create/update: short status.
- Completion: PR URL or draft, verification summary, blockers, reviewer notes.

## Discovery

Gather facts before drafting:

- `git status --short`, current branch, upstream, local commits vs base, and whether the branch has an open PR.
- GitHub remote and `gh auth status` / repo availability.
- Candidate base branch: repo default branch via `gh repo view --json defaultBranchRef`, then common branches (`main`, `master`, `develop`) if needed.
- Existing PR template: `.github/pull_request_template.md` or `.github/PULL_REQUEST_TEMPLATE/*`.
- Related issue evidence from context, user input, branch name, commit messages, HAT metadata, or local PRD/issue docs already referenced by upstream work.
- TDD/test evidence from context first.
- HAT evidence from context first, then relevant `hats/*/reports/*/summary.md` / `results.json` if present.
- Preflight risks: dirty worktree, staged/unstaged split, untracked files, secret-looking files, `.env`, keys, conflict markers, debug artifacts, large logs/screenshots, TODO/BLOCKED markers.

If the current branch is a base branch (`main`, `master`, `develop`, `trunk`) and there are implementation changes, recommend creating `issue/<slug>` and wait for confirmation. Use issue number/title for the slug when possible.

## Issue Rules

- If context already contains issue content, use it; do not reread.
- If only issue number/link is known and the issue body is not in context, read the issue with `gh issue view <number> --comments` before finalizing PR body or closing semantics.
- If no issue identifier is known, ask the user for one or proceed without closing keyword if they say none.
- Use `Closes #123` / `Fixes #123` only when the change fully implements the issue.
- Use `Related to #123` / `Refs #123` for partial work, supporting work, or uncertainty.
- Never call `gh issue close`, edit labels, or comment on issues unless the user explicitly asks and confirms the exact action.

## TDD And Tests

Build the TDD/test report in this order:

1. Use TDD/test conclusions already in context.
2. If missing and the issue contains a test plan, run the issue test-plan commands.
3. If the issue test plan is absent or unclear, run only relevant project test commands inferred from the diff and existing test entrypoints.
4. Do not restart the full `/tdd` workflow, design new tests, or add tests unless the user explicitly asks.
5. If a command cannot run because of missing services/env/dependencies, record `Not run` or `Blocked` with the reason.

The PR body must distinguish:

- Tests that passed.
- Tests that failed.
- Tests not run and why.
- TDD conclusions from context versus tests run by this skill.

## HAT Summary

Only collect existing HAT conclusions:

- Use HAT conclusions already in context first.
- If relevant HAT reports exist, summarize the latest matching report path, overall status, P0/P1/P2 counts, manual items, blocked items, and failures.
- If only `hat-prepare` exists with no report, write `HAT: prepared, not run`.
- If no HAT appears relevant, write `HAT: not found` or `HAT: not required` based on context.
- If multiple reports may match, list candidates in the PR plan and ask the user to choose.
- If HAT status is `FAIL`, `BLOCKED`, or `ERROR`, default the PR to Draft.

Do not paste long HAT logs, screenshots lists, or raw stdout into the PR body. Link relative report paths such as `hats/.../reports/YYYYMMDD-HHMMSS/summary.md`.

## PR Plan Gate

Before pushing or creating/updating anything, show a plan and wait for confirmation.

The plan must include:

- Head branch and base branch.
- Whether a push is needed and the exact remote branch.
- Existing PR detection and whether this is create or update.
- Draft versus ready recommendation and why.
- PR title.
- PR body outline.
- Issue linkage and exact closing/reference keyword.
- TDD/test summary and any commands to run first.
- HAT summary path/status if any.
- Preflight risks and dirty worktree status.
- Actions that will not be taken, such as no issue closing, no force push, no HAT run, no extra lint/typecheck unless in issue test plan.

If the user asks only for a PR draft, stop after the plan/body draft.

## Create Or Update

- Require at least one commit on the head branch relative to base. If none, stop and explain there is no PR diff.
- If uncommitted changes exist, do not auto-commit. Explain whether they will be excluded from the PR or ask whether the user wants help committing them.
- If push is needed, push only after plan confirmation. Use normal push or `git push -u origin <branch>`; never force push by default.
- If an open PR already exists for the current branch, do not create a duplicate. Offer an update plan and use `gh pr edit` only after confirmation.
- If no PR exists, create with `gh pr create`.
- Prefer repo PR template when present. If absent, use the default template below.
- Use GitHub draft state for draft PRs; do not add `[WIP]` to the title.
- After create/update, read CI/checks once if available. Do not wait for CI unless the user explicitly asks.

## Default PR Body

Follow project PR template if present. Otherwise use the language that matches the repo or user; default Chinese is acceptable for Chinese projects.

```md
## 概要
- ...

## 实现说明
- ...

## TDD / 测试
- ...

## HAT 验收
- ...

## 关联 Issue
Closes #123

## 给 Reviewer 的说明
- ...
```

Use English headings if the existing project template is English:

```md
## Summary
- ...

## Implementation
- ...

## TDD / Tests
- ...

## HAT
- ...

## Issue
Closes #123

## Notes for reviewers
- ...
```

## Draft Or Ready

Default to Draft unless the delivery evidence is strong.

Ready for review when:

- Implementation is committed.
- Required issue test plan or relevant tests pass.
- Existing HAT, if required/present, has no P0 failures or blockers.
- No known `BLOCKED`, unresolved manual release blocker, or severe preflight risk remains.

Draft when:

- Tests are missing, failed, or blocked.
- HAT is required but missing, or HAT status is `FAIL`, `BLOCKED`, `ERROR`, `MANUAL_REQUIRED`, or `RISK_FOUND`.
- There are unresolved TODO/BLOCKED notes that matter to release.
- User wants discussion first.

The user can override Draft/Ready, but the PR body must stay honest.

## Completion

Final response should include:

- PR URL, or title/body draft if not created.
- Draft/Ready state.
- Base/head branch and whether push happened.
- Linked issue and closing/reference keyword.
- TDD/test summary.
- HAT summary.
- CI/checks status if read.
- Remaining blockers or not-run items.
- Reviewer notes.
