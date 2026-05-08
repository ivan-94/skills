---
name: deliver-issue
description: Implement GitHub issues through TDD and cross-review, prepare HAT artifacts, then create a Draft PR labeled HAT-Ready. Use when the user wants an issue delivered up to a HAT-ready pull request, with TDD, independent cross-review, HAT preparation, commit, and PR creation orchestrated as one workflow.
---

# Deliver Issue

Deliver Issue is the implementation-chain orchestrator for GitHub issues. It takes one or more issues from implementation through TDD, independent cross-review, HAT preparation, commit, and a Draft PR marked `HAT-Ready`.

It does **not** run HAT. HAT execution belongs to a later workflow that scans PRs labeled `HAT-Ready`, reads the HAT paths from the PR body, and runs `/hat-run`.

## Boundary

- Only support GitHub issues in the first version.
- If `gh` is missing, unauthenticated, or the repo is not GitHub, stop and explain the missing prerequisite.
- Support multiple GitHub issues in one PR when the user provides them. All linked issues must meet their completion criteria.
- Use `/tdd` for implementation and verification.
- Use `/cross-review` after TDD is green.
- Use `/hat-prepare` after TDD and cross-review have passed the blocking gate.
- Use `/create-pr` for the final PR creation/update rules, but override its HAT behavior: this skill creates a Draft PR with prepared HAT artifacts, not an already-run HAT result.
- Do not run `/hat-run`.
- Do not truly close issues. Use PR body closing keywords such as `Closes #123`; GitHub closes issues only after merge.
- Do not force push, rebase, pull, edit issue labels, close issues, or comment on issues unless the user explicitly asks and confirms.
- Do not create or remove HAT lifecycle labels other than adding `HAT-Ready` after confirmation.

## Human Progress

Report concise progress to the user at these points:

- Start: issue(s), branch, dirty worktree, `gh` availability, and required gates will be checked.
- After discovery: issue scope, test plan presence, current implementation state, branch status, and risks.
- Before implementation: TDD plan and vertical slice order.
- After TDD: test result summary and next cross-review step.
- After cross-review: P0/P1/P2 summary, log path, and whether another TDD loop is required.
- Before HAT preparation: HAT source and mode assumptions that need confirmation.
- Before commit: exact files or change groups to include.
- PR plan: Draft state, `HAT-Ready` label action, HAT paths, issue closing keywords, and push/create/update actions.
- Completion: PR URL or blocked state, branch, linked issues, TDD result, cross-review result, HAT prepare paths, and remaining risks.

## Discovery

Gather facts before changing code:

- Current branch, upstream, base branch, commits versus base, and `git status --short`.
- GitHub remote, `gh auth status`, repo identity, and whether an open PR already exists for the current branch.
- Issue content for every provided GitHub issue with `gh issue view <number> --comments`.
- Issue test plan. If any issue lacks a clear test plan, stop and ask the user to add or provide one.
- Acceptance criteria. If unclear, `/hat-prepare` may later draft a checklist, but `/hat-run` is out of scope.
- Existing relevant tests, scripts, package commands, docs, `AGENTS.md` / `CLAUDE.md`, `HAT.md`, and prior `hats/` entries.
- Existing uncommitted changes. If present, list them and ask whether they belong to this delivery before continuing.

If the current branch is a base branch (`main`, `master`, `develop`, `trunk`) and implementation work is needed, recommend creating `issue/<slug>` and wait for confirmation. Use issue number/title for the slug when possible.

## Required Gates

Always stop for user confirmation before:

- Creating or switching to a new `issue/<slug>` branch.
- Starting the TDD implementation plan.
- Continuing with an initially dirty worktree.
- Running HAT preparation if the environment mode, data needs, or acceptance source are ambiguous.
- Staging and committing changes.
- Pushing, creating, updating, or labeling a PR.
- Creating the `HAT-Ready` label if it does not exist.

## Implementation State Machine

Default flow:

```text
GitHub issue(s)
  -> discovery
  -> TDD implementation
  -> cross-review
  -> if P0: TDD fix -> cross-review
  -> hat-prepare
  -> commit
  -> create/update Draft PR
  -> add HAT-Ready label
```

### TDD

- Follow `/tdd`: plan first, then vertical red-green-refactor slices.
- For multiple issues, merge scope and dependencies first, then work issue-by-issue or behavior-by-behavior in vertical slices.
- Tests must verify behavior through public interfaces.
- If tests do not pass, stop. Do not proceed to cross-review, HAT preparation, commit, or PR.
- If the issue's test plan is absent, stop instead of guessing.

### Cross-review Loop

- Run `/cross-review` after TDD is green.
- If cross-review fails because the opposite CLI is missing, times out, exits non-zero, or cannot guarantee read-only mode, stop. Do not self-review as fallback.
- If cross-review reports any `P0`, return to TDD, fix the P0, rerun relevant tests, and rerun cross-review.
- Repeat the P0 loop at most three times. After three failed P0 review rounds, stop and report the latest review log, remaining P0 findings, and current implementation state.
- `P1` and `P2` findings do not block `HAT-Ready`, but they must be written into the PR body or reviewer notes with the cross-review log path.
- Do not silently downgrade, omit, or relabel reviewer findings.

### HAT Preparation

- Run `/hat-prepare` only after TDD is green and cross-review has no P0.
- Generate or update a single combined HAT for the whole PR scope, even when multiple issues are linked.
- HAT preparation must produce usable `guide.md` and `prepare.sh`.
- If HAT preparation is blocked or incomplete, stop. Do not create a `HAT-Ready` PR.
- Do not execute `prepare.sh prepare` unless `/hat-prepare` specifically needs a low-risk verification and the user confirms.
- Do not run `/hat-run`.

### Commit

- The commit should include implementation, tests, and HAT prepare artifacts.
- Do not auto-stage or auto-commit. Show the commit plan and wait for confirmation.
- Avoid mixing unrelated dirty-worktree changes into the commit.
- Use a concise issue-oriented commit message. For multiple issues, mention the primary issue and summarize the combined scope.

## PR Rules

- Create or update a Draft PR by default.
- The Draft PR means: implementation chain complete, HAT artifacts prepared, HAT execution pending.
- Add `HAT-Ready` after the PR is created or updated and the user confirms the label action.
- If `HAT-Ready` does not exist, ask the user whether to create it; do not silently create labels.
- PR body must include:
  - linked issues with `Closes #123` for every delivered issue;
  - TDD/test summary;
  - cross-review summary and log path;
  - unresolved P1/P2 findings, if any;
  - HAT prepare status;
  - HAT guide path and prepare script path;
  - clear note that HAT has not run yet;
  - reviewer notes and remaining risks.
- Do not read or wait for CI/checks after creating or updating the PR.
- Do not remove `HAT-Ready`; later HAT workflows own label consumption and replacement.

## Default PR Body Additions

When the project has no stronger template, include these sections in Chinese:

```md
## 概要
- ...

## 实现说明
- ...

## TDD / 测试
- ...

## Cross Review
- Reviewer: ...
- Log: .scratch/cross-review/...
- P0: none
- P1/P2: ...

## HAT 准备
- Status: prepared
- Guide: hats/.../guide.md
- Prepare: hats/.../prepare.sh
- Note: HAT 尚未执行。本 PR 已标记 `HAT-Ready`，等待后续 HAT workflow 执行。

## 关联 Issue
Closes #123

## 给 Reviewer 的说明
- ...
```

Use the repository's PR template when present, but preserve the same information.

## Completion

Final response should include:

- PR URL, or the exact blocked reason if no PR was created.
- Draft status and `HAT-Ready` label status.
- Base/head branch and whether a push happened.
- Linked issue closing keywords.
- TDD/test summary.
- Cross-review summary and log path.
- HAT guide and prepare script paths.
- Remaining P1/P2 risks or unresolved manual notes.
