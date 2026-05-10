# Agent Board

Local macOS GitHub workflow board for launching Codex or Claude Code tasks from Issue and PR lanes.

## Run

Build and launch the SwiftUI macOS app bundle:

```bash
cd apps/agent-board
bin/agent-board
```

If `bin/agent-board` is linked into your PATH:

```bash
agent-board
```

## v1 Scope

- Manage multiple local workspaces from a native macOS app.
- Render separate Issue and Pull Request boards with configurable lanes.
- Store app state under `~/.agent-board`.
- Render prompts from selected cards.
- Launch Codex, Claude Code, or a custom runner in a local terminal session.

Configuration is written under:

```text
~/.agent-board/config.json
~/.agent-board/workspaces/<workspace-id>/workflow.json
~/.agent-board/runs/<workspace-id>/
```

The SwiftUI interface uses standard macOS navigation, lists, forms, menus, toolbars, and sheets. Custom board surfaces apply Liquid Glass through `glassEffect` on macOS 26+ and fall back to system materials on older macOS releases.
