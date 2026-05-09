# Agent Board v1 Spec

## 1. Purpose

Agent Board is a local web app launched from a CLI inside a Git project. It reads the current project's GitHub repository, builds configurable Issue and Pull Request boards, and lets users launch local agent workflows from selected cards.

The app is not just a GitHub board. Its core job is to turn repository state into runnable local agent prompts, then open an interactive terminal session using Codex CLI, Claude Code CLI, or a custom runner.

## 2. Product Principles

- Start simple: one GitHub repository per project.
- Prefer strong defaults over an empty configuration screen.
- Make lanes, labels, and actions configurable.
- Keep Issue and PR views separate.
- Never auto-create labels or mutate GitHub silently.
- Treat agent execution as an interactive TUI session, not a background job.
- Store project workflow configuration in the repo, but store run history locally.

## 3. Non-Goals for v1

- No multi-repo source/fork model.
- No Linear, GitLab, Jira, or local markdown issue tracker.
- No automatic label creation on startup.
- No background execution of Codex or Claude.
- No parsing Issue or PR comments to infer workflow state.
- No hosted SaaS mode.
- No multi-user collaboration.
- No terminal output capture in the web UI.
- No Windows/Linux terminal launch guarantee in v1, though the launcher should be structured for future support.

## 4. Technology

- Runtime: Bun.
- UI: React.
- Delivery: local CLI starts a localhost web server.
- GitHub access: `gh` CLI for v1.
- Git access: local `git` CLI.
- Terminal launch: local OS command, macOS first.

Initial app location:

```text
apps/agent-board/
  package.json
  src/
    cli/
    server/
    web/
    shared/
  docs/
    spec-v1.md
```

The current repository does not need to become a full monorepo for v1. `apps/agent-board/package.json` can be self-contained.

## 5. CLI Startup Flow

Command:

```bash
bun run agent-board
```

or, once packaged:

```bash
agent-board
```

Startup sequence:

1. Locate Git root with `git rev-parse --show-toplevel`.
2. Read Git remotes with `git remote -v`.
3. Parse GitHub repository URLs from remotes.
4. Choose the first GitHub repository found.
5. Load `.agent-board.yml` from Git root if present.
6. If no config exists, use the built-in default workflow template in memory.
7. Check local runner availability with `which codex` and `which claude`.
8. Start local web server.
9. Open browser to the local app.

If no GitHub remote is found, the CLI should fail with a clear message:

```text
No GitHub remote found in this git repository.
```

If `gh` is unavailable or unauthenticated, the app can still start, but the board should show a setup error state with remediation instructions.

## 6. Repository Discovery

v1 deliberately uses one canonical repository.

Discovery rule:

```text
Use the first GitHub repo found in git remote output order.
```

Examples of supported remote URL formats:

```text
git@github.com:owner/repo.git
https://github.com/owner/repo.git
https://github.com/owner/repo
```

The app must not automatically switch to a second remote if the first repo has Issues disabled, missing labels, or weak permissions. Predictability is more important than clever fallback.

The detected repo should be shown clearly in the UI header:

```text
owner/repo
```

## 7. GitHub Data Model

The server reads GitHub data through `gh`.

Required repo metadata:

- nameWithOwner
- url
- defaultBranchRef
- viewerPermission
- hasIssuesEnabled, if available
- labels

Issue fields:

- number
- title
- url
- state
- labels
- assignees
- author
- createdAt
- updatedAt

PR fields:

- number
- title
- url
- state
- isDraft
- labels
- author
- headRefName
- baseRefName
- reviewDecision, if available
- createdAt
- updatedAt

State inference must use:

- GitHub labels
- GitHub native fields such as assignees, draft state, and review decision

State inference must not use:

- Issue comments
- PR comments
- PR body text
- HAT guide paths in PR body

Those deeper details can be added later in card detail views.

## 8. Board Model

There are separate boards for Issues and Pull Requests.

Shared model:

```ts
type Board = {
  id: string;
  title: string;
  itemType: "issue" | "pullRequest";
  lanes: Lane[];
};

type Lane = {
  id: string;
  title: string;
  query: LaneQuery;
  actions: Action[];
};

type LaneQuery = {
  labelsAll?: string[];
  labelsAny?: string[];
  labelsNone?: string[];
  includeUnlabeled?: boolean;
  noAssignee?: boolean;
  isDraft?: boolean;
  reviewDecisionAny?: string[];
};

type Action = {
  id: string;
  title: string;
  promptTemplate: string;
  runner?: string;
  confirmBeforeRun?: boolean;
};
```

All actions support multiple selected cards. v1 must not attempt to infer single-select versus multi-select from the prompt template.

## 9. Default Workflow Template

If `.agent-board.yml` does not exist, the app uses a built-in default template based on the agent workflow used by this project.

### 9.1 Issue Board

Board:

```text
Issues
```

Lanes:

```text
Inbox
Needs Info
Ready For Agent
Ready For Human
```

Lane mapping:

```text
Inbox:
  - open issues with no workflow state label
  - or label needs-triage

Needs Info:
  - label needs-info

Ready For Agent:
  - label ready-for-agent

Ready For Human:
  - label ready-for-human
```

Issue workflow state labels:

```text
needs-triage
needs-info
ready-for-agent
ready-for-human
wontfix
```

Issue actions for v1:

```text
Inbox:
  - 分诊
    prompt: /triage 对以下 Issue 进行分诊：{{refs}}

Ready For Agent:
  - Deliver
    prompt: /deliver-issue {{refs}}

  - TDD
    prompt: /tdd {{ref}}

Needs Info:
  - no default actions

Ready For Human:
  - no default actions
```

### 9.2 Pull Request Board

Board:

```text
Pull Requests
```

Lanes:

```text
Initial
HAT Ready
HAT Needs Human
HAT Blocked
HAT Passed
```

Lane mapping:

```text
Initial:
  - open PRs with no HAT lifecycle label

HAT Ready:
  - label HAT-Ready

HAT Needs Human:
  - label HAT-Needs-Human

HAT Blocked:
  - label HAT-Blocked

HAT Passed:
  - label HAT-Passed
```

HAT lifecycle labels:

```text
HAT-Ready
HAT-Needs-Human
HAT-Blocked
HAT-Passed
```

PR actions for v1:

```text
HAT Ready:
  - 执行 HAT
    prompt: /hat-dispatch {{refs}}

Initial:
  - no default actions

HAT Needs Human:
  - no default actions

HAT Blocked:
  - no default actions

HAT Passed:
  - no default actions
```

## 10. Missing Labels

The app must detect labels referenced by the active config that do not exist in the repository.

Behavior:

- Do not create missing labels automatically.
- Show missing labels in a non-blocking setup panel.
- Lanes that depend on missing labels still render, but may be empty.
- Provide a future "Initialize labels" action, but v1 may ship this as disabled or planned.

If implemented, "Initialize labels" must show a confirmation plan before any GitHub write:

```text
Will create N labels in owner/repo.
No issues or pull requests will be modified.
```

## 11. Issues Disabled

If the selected GitHub repo has Issues disabled:

- Keep the Issue board visible.
- Render Issue lanes in a disabled empty state.
- Continue loading and rendering the Pull Request board.

Example UI copy:

```text
Issues are disabled for owner/repo.
```

The app must not auto-switch to another remote to find Issues.

## 12. Project Configuration

Project config path:

```text
.agent-board.yml
```

This file owns workflow configuration:

- boards
- lanes
- lane label mappings
- actions
- prompt templates

It should be safe to commit to the repo.

Example:

```yaml
version: 1

boards:
  - id: issues
    title: Issues
    itemType: issue
    lanes:
      - id: inbox
        title: Inbox
        query:
          labelsAny: [needs-triage]
          includeUnlabeled: true
        actions:
          - id: triage
            title: 分诊
            promptTemplate: "/triage 对以下 Issue 进行分诊：{{refs}}"

      - id: ready-for-agent
        title: Ready For Agent
        query:
          labelsAll: [ready-for-agent]
        actions:
          - id: deliver
            title: Deliver
            promptTemplate: "/deliver-issue {{refs}}"
          - id: tdd
            title: TDD
            promptTemplate: "/tdd {{ref}}"

  - id: pull-requests
    title: Pull Requests
    itemType: pullRequest
    lanes:
      - id: hat-ready
        title: HAT Ready
        query:
          labelsAll: [HAT-Ready]
        actions:
          - id: hat-dispatch
            title: 执行 HAT
            promptTemplate: "/hat-dispatch {{refs}}"
```

If no `.agent-board.yml` exists:

- Use the default template in memory.
- Show a banner:

```text
Using default Agent Board workflow. Save .agent-board.yml to customize this project.
```

v1 can include a "Save config" action that writes the current default template to `.agent-board.yml`.

## 13. User Configuration

User config is for local machine preferences, not workflow semantics.

Planned path:

```text
~/.agent-board/config.yml
```

v1 may start without requiring this file.

Future user config owns:

- runner command overrides
- preferred runner
- terminal app
- terminal launch behavior

Project config must not store machine-specific paths unless explicitly configured by the user.

## 14. Runner Model

Built-in runners:

```text
Codex
Claude Code
Custom
```

Runner detection:

```bash
which codex
which claude
```

Runner model:

```ts
type Runner = {
  id: string;
  label: string;
  command: string;
  args: string[];
  detected: boolean;
};
```

Default runner definitions:

```yaml
runners:
  codex:
    label: Codex
    command: codex
    args: ["{{prompt}}"]

  claude:
    label: Claude Code
    command: claude
    args: ["{{prompt}}"]
```

Codex and Claude Code are interactive TUI programs. Therefore:

- Do not pipe prompts through stdin by default.
- Pass the prompt through argv or configured args.
- Preserve terminal stdin for the TUI.

Custom runner may expose command and args editing in the Run Dialog or settings.

## 15. Prompt Template Variables

Prompt templates support at least:

```text
{{refs}}
{{ref}}
{{count}}
{{itemsJson}}
```

Variable behavior:

```text
{{refs}}
  All selected refs joined with spaces.
  Example: #12 #13 #14

{{ref}}
  First selected ref.
  Example: #12

{{count}}
  Number of selected cards.
  Example: 3

{{itemsJson}}
  JSON string of selected item metadata.
```

Issue refs use:

```text
#123
```

PR refs also use:

```text
#456
```

The action does not enforce whether a prompt uses `{{ref}}` or `{{refs}}`.

## 16. Run Dialog

When a user clicks an action:

1. Render prompt from selected cards and action template.
2. Open Run Dialog.
3. Let user edit prompt.
4. Let user choose runner.
5. Show working directory.
6. Start terminal session when user clicks Run.

Run Dialog fields:

- selected action title
- selected refs
- runner selector
- prompt text area
- cwd display
- Cancel button
- Run button

Default cwd:

```text
git root
```

v1 does not need a cwd selector. It should display cwd so the user can verify context before launching.

## 17. Terminal Session Launcher

The app creates a local run script and opens it in Terminal.

macOS v1 behavior:

```text
1. Create script under ~/.agent-board/runs/<repo-id>/<run-id>.sh
2. chmod +x
3. open -a Terminal <script>
```

Script shape:

```bash
#!/usr/bin/env bash
set -euo pipefail

cd "/absolute/git/root"

codex "/triage 对以下 Issue 进行分诊：#159 #158"

exec "${SHELL:-/bin/zsh}" -l
```

Important:

- The launched CLI must remain interactive.
- The script must not consume stdin with a heredoc or pipe for built-in TUI runners.
- `exec "$SHELL" -l` keeps the terminal open after the runner exits.
- Prompt and args must be shell-escaped safely.

Future terminal support:

- iTerm2
- WezTerm
- Kitty
- Linux terminal emulators
- Windows Terminal

## 18. Run History

Run history is local-only.

Path:

```text
~/.agent-board/runs/<repo-id>/
```

`repo-id` should be filesystem-safe, for example:

```text
owner__repo
```

For each run:

```text
YYYYMMDD-HHMMSS-<action-id>.json
YYYYMMDD-HHMMSS-<action-id>.sh
```

Run JSON fields:

```ts
type RunRecord = {
  id: string;
  startedAt: string;
  repo: string;
  gitRoot: string;
  boardId: string;
  laneId: string;
  actionId: string;
  actionTitle: string;
  selectedRefs: string[];
  selectedItems: unknown[];
  runnerId: string;
  command: string;
  args: string[];
  prompt: string;
  scriptPath: string;
};
```

v1 does not need to capture terminal output, exit code, or workflow completion status.

## 19. Server API

Proposed local API:

```text
GET  /api/project
GET  /api/boards
POST /api/actions/render
POST /api/runs
POST /api/config/save
```

### GET /api/project

Returns:

- git root
- detected repo
- repo URL
- viewer permission
- issues enabled state
- missing labels
- runner detection status
- config source: `project` or `default`

### GET /api/boards

Returns rendered boards:

- boards
- lanes
- cards in each lane
- action definitions
- loading/error states

### POST /api/actions/render

Input:

- board id
- lane id
- action id
- selected item ids

Returns:

- selected refs
- rendered prompt
- default runner
- cwd

### POST /api/runs

Input:

- runner id
- prompt
- cwd
- board/lane/action context
- selected items

Behavior:

- write run JSON
- write run script
- open terminal

Returns:

- run id
- script path
- opened: true/false
- error if terminal launch failed

### POST /api/config/save

Behavior:

- write current workflow config to `.agent-board.yml`

This endpoint should fail if a config file already exists unless the user explicitly confirms overwrite.

## 20. UI Layout

Primary screens:

- Header
- Board tabs
- Board lanes
- Run Dialog
- Setup/status panel

Header shows:

- app name
- detected repo
- Git root
- refresh button
- config state
- runner state

Board tabs:

```text
Issues | Pull Requests
```

Lane UI:

- lane title
- item count
- lane action bar appears when cards in that lane are selected
- card list

Card UI:

- number
- title
- labels
- assignees
- author
- updated time
- link to GitHub

If cards from multiple lanes are selected, v1 can either:

- clear previous lane selection when selecting in another lane, or
- show actions only for the active lane

Recommended v1 behavior:

```text
Selection is scoped to one lane. Selecting a card in another lane clears the previous selection.
```

This keeps action availability simple.

## 21. Refresh Behavior

v1 should support manual refresh.

Optional auto-refresh can be added later.

Manual refresh reloads:

- repo metadata
- labels
- issues
- PRs
- runner detection

The app should not refresh while Run Dialog has unsaved prompt edits unless the dialog is independent of board state.

## 22. Error States

Required error states:

- not a git repository
- no GitHub remote found
- `gh` missing
- `gh` unauthenticated
- GitHub API permission denied
- Issues disabled
- no open issues
- no open PRs
- runner not detected
- terminal launch failed
- config parse failed

Error states should be visible but not overdramatic. Where possible, keep the rest of the app usable.

Examples:

```text
Codex CLI was not found. Configure a custom runner or install Codex CLI.
```

```text
Issues are disabled for owner/repo. Pull Requests are still available.
```

## 23. Security and Safety

- Do not write secrets to `.agent-board.yml`.
- Do not commit run history by default.
- Store run history under the user home directory.
- Shell-escape command args.
- Do not eval arbitrary prompt text.
- Do not execute project config commands automatically on startup.
- Opening a terminal from an action always requires clicking Run in the Run Dialog.
- GitHub writes are out of scope for default actions in v1 except future label initialization, which must require confirmation.

## 24. Acceptance Criteria

v1 is acceptable when:

- Running the CLI inside a GitHub-backed repo opens the web UI.
- The app chooses the first GitHub remote.
- The app loads repo metadata through `gh`.
- Issues and PRs render on separate board tabs.
- Default lanes are present without `.agent-board.yml`.
- Missing labels are shown without being created.
- Issues disabled state keeps Issue lanes visible but disabled.
- Selecting cards in Inbox enables the `分诊` action.
- Selecting cards in Ready For Agent enables `Deliver` and `TDD`.
- Selecting cards in HAT Ready enables `执行 HAT`.
- Clicking an action opens Run Dialog with rendered prompt.
- Prompt can be edited before launch.
- Runner can be selected from Codex, Claude Code, and Custom.
- Starting a run writes local run history under `~/.agent-board/runs/`.
- Starting a run opens a macOS Terminal session in the Git root.
- Codex and Claude sessions remain interactive TUI sessions.

## 25. Open Questions After v1

- Should label initialization be implemented in v1.1?
- Should project config include custom colors and lane ordering?
- Should runner config move fully into `~/.agent-board/config.yml`?
- Should the app support read-only GitHub browsing without `gh auth`?
- Should PR cards include check status and CI state?
- Should card detail views fetch Issue/PR bodies on demand?
- Should run history be visible in the UI?
- Should the launcher support resuming or attaching to terminal sessions?
