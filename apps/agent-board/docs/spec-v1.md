# Agent Board macOS Spec

## Purpose

Agent Board is a native SwiftUI macOS app for local GitHub workflow boards. It lets a user add local Git workspaces, reads each workspace's GitHub repository through `gh`, renders Issue and Pull Request lanes, and starts interactive Codex, Claude Code, or custom runner sessions from selected cards.

## Platform

- App technology: SwiftUI macOS app built with Swift Package Manager.
- Design system: Apple platform conventions with standard SwiftUI `NavigationSplitView`, `List`, `Form`, `Toolbar`, `Menu`, `Sheet`, `ContentUnavailableView`, and `Settings`.
- Liquid Glass: standard controls inherit system styling; custom board surfaces use `glassEffect` on macOS 26+ and fall back to system materials on earlier macOS versions.
- GitHub access: `gh` CLI.
- Git access: local `git` CLI.
- Runner execution: local shell scripts opened by macOS.

## Storage

All durable app state lives outside repositories:

```text
~/.agent-board/config.json
~/.agent-board/workspaces/<workspace-id>/workflow.json
~/.agent-board/runs/<workspace-id>/
```

The app must not create or update repo-local `.agent-board.yml`.

## Workspaces

- A workspace is a local Git root plus its first GitHub remote.
- Workspace identity is a stable hash of the resolved Git root.
- Users can add workspaces from the native macOS UI.
- The app remembers the last selected workspace.
- Switching workspace refreshes only that workspace's GitHub state.

## Boards

There are separate board tabs for Issues and Pull Requests.

Issue lanes:

- Inbox
- Needs Info
- Ready For Agent
- Ready For Human

Pull Request lanes:

- Initial
- HAT Ready
- HAT Needs Human
- HAT Blocked
- HAT Passed

Lane membership is based on labels and native GitHub fields. Comments and bodies are not parsed.

## Actions

All lane actions support multi-select. The default actions are:

```text
Inbox:
- 分诊: /triage 对以下 Issue 进行分诊：{{refs}}

Ready For Agent:
- Deliver: /deliver-issue {{refs}}
- TDD: /tdd {{ref}}

HAT Ready:
- 执行 HAT: /hat-dispatch {{refs}}
```

The action sheet supports:

- runner selection
- permission mode selection
- prompt editing
- split execution for multiple selected cards
- CLI preview

Prompt variables:

```text
{{refs}}      all selected refs, space-separated
{{ref}}       first selected ref
{{count}}     selected item count
{{itemsJson}} selected items as JSON
```

## Runner Defaults

Built-in runners:

- Codex
- Claude Code

Each runner supports:

- Default
- Auto Review
- All Permissions

Users can edit runner command, arguments, permission mode arguments, and terminal settings in the native Settings UI.

## Acceptance Criteria

- `swift build` succeeds from `apps/agent-board`.
- `bin/agent-board` builds the SwiftPM executable, wraps it in a local `.app` bundle, and launches it through macOS `open`.
- The app can add a GitHub-backed local workspace.
- The app fetches Issues and PRs with `gh`.
- The board renders native macOS lanes and cards.
- Settings expose Workspaces, Workflow, Runners, and Terminal.
- No Bun, React, localhost web server, or repo-local workflow config is required.
