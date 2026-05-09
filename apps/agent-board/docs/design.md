# Agent Board Frontend Design

This document captures the v1 frontend layout as low-fidelity ASCII wireframes. It focuses on structure and interaction placement, not final visual styling.

## 1. App Shell

```text
+----------------------------------------------------------------------------------+
| Agent Board                                      owner/repo        Refresh   Gear |
| Git root: /Users/ivan/workspace/project        Config: Default    Runners: 2/2   |
+----------------------------------------------------------------------------------+
| Setup notice                                                                      |
| Using default Agent Board workflow. Save .agent-board.yml to customize this repo. |
| Missing labels: needs-info, HAT-Ready                              Save Config    |
+----------------------------------------------------------------------------------+
| Issues | Pull Requests                                                            |
+----------------------------------------------------------------------------------+
|                                                                                  |
|  Active board content                                                            |
|                                                                                  |
+----------------------------------------------------------------------------------+
```

### Header Responsibilities

- Show the detected GitHub repository.
- Show the current Git root.
- Show config source: `Default` or `.agent-board.yml`.
- Show runner detection status.
- Provide manual refresh.
- Provide access to settings/config later.

### Setup Notice Responsibilities

- Show missing labels without blocking the board.
- Show Issues-disabled state when relevant.
- Offer `Save Config` when the app is using inferred/default configuration.
- Never auto-create labels.

## 2. Issue Board

```text
+----------------------------------------------------------------------------------+
| Agent Board                                      owner/repo        Refresh   Gear |
+----------------------------------------------------------------------------------+
| Issues | Pull Requests                                                            |
+----------------------------------------------------------------------------------+
|                                                                                  |
| +-------------------+ +-------------------+ +-------------------+ +-------------+ |
| | Inbox          12 | | Needs Info      3 | | Ready For Agent 5 | | Ready Human | |
| |-------------------| |-------------------| |-------------------| |-------------| |
| | [ ] #159          | | [ ] #88           | | [x] #72           | | [ ] #47     | |
| | Add manifest...   | | Need repro...     | | Add auth flow...  | | Sub-issues  | |
| | fuleinist         | | alice             | | bob               | | CSenshi     | |
| | no labels         | | needs-info        | | ready-for-agent   | | ready-human | |
| | updated 2h ago    | | updated 1d ago    | | updated 3h ago    | | updated 8d  | |
| |-------------------| |-------------------| |-------------------| |-------------| |
| | [ ] #158          | | [ ] #64           | | [x] #71           | | [ ] #23     | |
| | Add verify skill  | | Missing details   | | Plugin install... | | The flow    | |
| | fuleinist         | | carol             | | dan               | | fmoga       | |
| +-------------------+ +-------------------+ +-------------------+ +-------------+ |
|                                           +-------------------------------------+ |
|                                           | 2 selected in Ready For Agent       | |
|                                           | [Deliver] [TDD]                    | |
|                                           +-------------------------------------+ |
+----------------------------------------------------------------------------------+
```

### Issue Lane Rules

- Selection is scoped to one lane.
- Selecting an item in another lane clears the previous lane selection.
- Action bar appears only for the active selected lane.
- Empty lanes remain visible.
- Disabled lanes remain visible when Issues are disabled for the repo.

### Issue Card Content

```text
+-----------------------------+
| [ ] #159                    |
| Add skills-manifest.json... |
| author: fuleinist           |
| assignee: none              |
| labels: needs-triage bug    |
| updated 2h ago              |
+-----------------------------+
```

Minimum fields:

- checkbox
- issue number
- title
- author
- assignee summary
- labels
- updated time
- GitHub link affordance

## 3. Pull Request Board

```text
+----------------------------------------------------------------------------------+
| Agent Board                                      owner/repo        Refresh   Gear |
+----------------------------------------------------------------------------------+
| Issues | Pull Requests                                                            |
+----------------------------------------------------------------------------------+
|                                                                                  |
| +----------------+ +----------------+ +----------------+ +----------------------+ |
| | Initial      4 | | HAT Ready    2 | | Needs Human  1 | | HAT Blocked       1 | |
| |----------------| |----------------| |----------------| |----------------------| |
| | [ ] #32        | | [x] #41        | | [ ] #38        | | [ ] #29              | |
| | Add settings   | | Deliver #72    | | Visual check   | | Env missing          | |
| | draft          | | draft          | | ready          | | draft                | |
| | no HAT label   | | HAT-Ready      | | HAT-Needs...   | | HAT-Blocked          | |
| |----------------| |----------------| |----------------| |----------------------| |
| | [ ] #31        | | [x] #40        | |                | |                      | |
| | Board polish   | | Deliver #71    | |                | |                      | |
| +----------------+ +----------------+ +----------------+ +----------------------+ |
|                   +------------------------------------------------------------+ |
|                   | 2 selected in HAT Ready                                    | |
|                   | [执行 HAT]                                                 | |
|                   +------------------------------------------------------------+ |
|                                                                                  |
| +----------------+                                                               |
| | HAT Passed   3 |                                                               |
| |----------------|                                                               |
| | [ ] #22        |                                                               |
| | Improve docs   |                                                               |
| +----------------+                                                               |
+----------------------------------------------------------------------------------+
```

### PR Card Content

```text
+-----------------------------+
| [ ] #41                     |
| Deliver issue #72           |
| author: ivan-94             |
| draft -> main               |
| labels: HAT-Ready           |
| review: required            |
| updated 1h ago              |
+-----------------------------+
```

Minimum fields:

- checkbox
- PR number
- title
- author
- draft/ready state
- base/head summary
- labels
- review decision when available
- updated time
- GitHub link affordance

## 4. Active Lane Action Bar

The lane action bar is visually attached to the lane selection context, not the whole board.

```text
+----------------------------------------------------+
| 3 selected in Inbox                                |
| #159 #158 #154                                     |
|                                                    |
| [分诊]                                             |
+----------------------------------------------------+
```

Ready For Agent:

```text
+----------------------------------------------------+
| 2 selected in Ready For Agent                      |
| #72 #71                                            |
|                                                    |
| [Deliver] [TDD]                                    |
+----------------------------------------------------+
```

HAT Ready:

```text
+----------------------------------------------------+
| 2 selected in HAT Ready                            |
| #41 #40                                            |
|                                                    |
| [执行 HAT]                                         |
+----------------------------------------------------+
```

Rules:

- All actions support multi-select.
- The template decides whether it uses `{{refs}}` or `{{ref}}`.
- The action bar does not enforce single-select.
- Buttons open the Run Dialog; they do not immediately launch terminal sessions.

## 5. Run Dialog

```text
                         +----------------------------------------------+
                         | Run Action                                   |
                         |----------------------------------------------|
                         | Action: Deliver                              |
                         | Selection: #72 #71                           |
                         | Working directory:                           |
                         | /Users/ivan/workspace/project                |
                         |                                              |
                         | Runner                                       |
                         | (o) Codex        detected                    |
                         | ( ) Claude Code  detected                    |
                         | ( ) Custom                                  |
                         |                                              |
                         | Prompt                                       |
                         | +------------------------------------------+ |
                         | | /deliver-issue #72 #71                  | |
                         | |                                          | |
                         | +------------------------------------------+ |
                         |                                              |
                         |                         [Cancel] [Run]      |
                         +----------------------------------------------+
```

### Run Dialog Behavior

- Opens after clicking a lane action.
- Renders prompt from the action template and selected cards.
- Allows prompt editing before launch.
- Allows runner selection.
- Shows cwd, defaulting to Git root.
- `Run` creates local run history and opens the terminal.
- `Cancel` returns to the board without side effects.

## 6. Custom Runner State

If Custom is selected:

```text
                         +----------------------------------------------+
                         | Runner                                       |
                         | ( ) Codex        not found                   |
                         | ( ) Claude Code  detected                    |
                         | (o) Custom                                  |
                         |                                              |
                         | Command                                      |
                         | +------------------------------------------+ |
                         | | my-agent-cli                             | |
                         | +------------------------------------------+ |
                         | Args                                         |
                         | +------------------------------------------+ |
                         | | run "{{prompt}}"                         | |
                         | +------------------------------------------+ |
                         +----------------------------------------------+
```

v1 can keep custom runner minimal:

- command input
- args input
- prompt variable support

## 7. Issues Disabled State

```text
+----------------------------------------------------------------------------------+
| Issues | Pull Requests                                                            |
+----------------------------------------------------------------------------------+
|                                                                                  |
| +-------------------+ +-------------------+ +-------------------+ +-------------+ |
| | Inbox           - | | Needs Info      - | | Ready For Agent - | | Ready Human | |
| |-------------------| |-------------------| |-------------------| |-------------| |
| |                   | |                   | |                   | |             | |
| | Issues are        | | Issues are        | | Issues are        | | Issues are  | |
| | disabled for      | | disabled for      | | disabled for      | | disabled    | |
| | owner/repo.       | | owner/repo.       | | owner/repo.       | | owner/repo. | |
| |                   | |                   | |                   | |             | |
| +-------------------+ +-------------------+ +-------------------+ +-------------+ |
|                                                                                  |
+----------------------------------------------------------------------------------+
```

Rules:

- Keep Issue board visible.
- Do not redirect to another repo.
- Pull Request board remains usable.

## 8. Missing Labels Panel

```text
+----------------------------------------------------------------------------------+
| Missing workflow labels                                                           |
| These labels are referenced by the active board config but do not exist in GitHub. |
|                                                                                  |
| needs-info     ready-for-agent     HAT-Ready     HAT-Blocked                     |
|                                                                                  |
| Label creation is not automatic.                                      Dismiss     |
+----------------------------------------------------------------------------------+
```

v1 may show this as:

- top setup panel
- collapsible warning panel
- settings drawer section

It must not create labels automatically.

## 9. Loading and Empty States

Board loading:

```text
+-------------------+ +-------------------+ +-------------------+
| Inbox             | | Needs Info         | | Ready For Agent   |
|-------------------| |-------------------| |-------------------|
| Loading issues... | | Loading issues... | | Loading issues... |
+-------------------+ +-------------------+ +-------------------+
```

Lane empty:

```text
+-------------------+
| Ready For Agent 0 |
|-------------------|
| No issues here.   |
+-------------------+
```

Runner missing:

```text
+----------------------------------------------------------------------------------+
| Runner setup                                                                      |
| Codex CLI was not found. Claude Code was detected. You can still choose Custom.   |
+----------------------------------------------------------------------------------+
```

## 10. Responsive Behavior

Desktop-first v1:

```text
Wide desktop:
  lanes scroll horizontally inside the board area

Narrow width:
  header wraps
  board tabs stay visible
  lanes become horizontal scroll columns
  Run Dialog becomes nearly full width
```

ASCII narrow layout:

```text
+--------------------------------------+
| Agent Board                          |
| owner/repo                           |
| Refresh  Gear                        |
+--------------------------------------+
| Issues | Pull Requests               |
+--------------------------------------+
| < horizontal lane scroll >           |
| +-------------------+ +-------------+|
| | Inbox             | | Needs Info  ||
| | ...               | | ...         ||
| +-------------------+ +-------------+|
+--------------------------------------+
```

## 11. Interaction Summary

```text
Start CLI
  -> detect repo
  -> load config/default template
  -> fetch GitHub data
  -> render boards

Select cards in a lane
  -> show lane action bar

Click action
  -> render prompt
  -> open Run Dialog

Click Run
  -> write ~/.agent-board/runs/<repo-id>/<run-id>.json
  -> write ~/.agent-board/runs/<repo-id>/<run-id>.sh
  -> open macOS Terminal
  -> runner starts as interactive TUI
```

## 12. Visual Direction Notes

- Treat the app as an operational tool, not a marketing page.
- Prioritize dense, scannable information.
- Keep lane cards compact.
- Use restrained color. Labels can carry color; the rest of the UI should stay quiet.
- Use icons for refresh, settings, external links, and run actions where available.
- Avoid large decorative surfaces.
- Make selected state obvious but not loud.
- Keep Run Dialog focused; it is the key trust boundary before launching a terminal.
