# Agent Board macOS Design

## Structure

```text
┌────────────────────────────────────────────────────────────────────┐
│ Sidebar                         │ Toolbar: Workspace Refresh Config │
│ ┌ Workspaces ─────────────────┐ │ ┌ Issues | Pull Requests ───────┐ │
│ │ temp-test                   │ │ │ ┌ Inbox ┐ ┌ Ready ┐ ┌ Human ┐ │ │
│ │ sharge_app_server          │ │ │ │ cards │ │ cards │ │ empty │ │ │
│ └─────────────────────────────┘ │ │ └───────┘ └───────┘ └───────┘ │ │
│ + Add Workspace                 │ └────────────────────────────────┘ │
└────────────────────────────────────────────────────────────────────┘
```

## Apple Platform Principles

- Use `NavigationSplitView` for app-level workspace navigation.
- Use toolbar items for global actions: workspace, refresh, configure.
- Use segmented `Picker` for the Issue/PR board switch.
- Use `List`, `Form`, `Menu`, `Sheet`, and `Settings` instead of custom control surfaces.
- Use `ContentUnavailableView` for empty states.
- Keep board lanes as custom content surfaces because they are domain-specific.

## Liquid Glass

Apple guidance says standard SwiftUI components automatically adopt Liquid Glass on current platforms. Agent Board follows that guidance by relying on standard components for navigation, settings, forms, buttons, menus, and sheets.

Custom board lanes and cards use a small `agentGlassCard` / `agentInteractiveGlass` wrapper:

- macOS 26+: `glassEffect`
- older macOS: `.regularMaterial` / `.thinMaterial`

Liquid Glass is not applied to large content backgrounds, dense text content, or every nested element. This keeps hierarchy clear and avoids obscuring card information.

## Main Views

- Sidebar: workspace list and add button.
- Detail: board switcher plus horizontal lanes.
- Lane: title, count/selection state, contextual action menu.
- Card: checkbox, GitHub ref, title, metadata, labels, GitHub link.
- Run sheet: runner, permission mode, split execution, prompt editor, CLI preview.
- Settings: Workspaces, Workflow, Runners, Terminal.
