# Agent Board

Local GitHub workflow board for launching Codex or Claude Code tasks from Issue and PR lanes.

## Run

Install Bun first, then:

```bash
cd apps/agent-board
bun install
bun run dev
```

Options:

```bash
bun run src/cli/index.ts --no-open
bun run src/cli/index.ts --port=4180
```

## v1 Scope

- Detect the first GitHub remote in the current Git repository.
- Render separate Issue and Pull Request boards.
- Use the built-in Agent Board workflow when `.agent-board.yml` is absent.
- Show missing labels without creating them automatically.
- Render prompts from selected cards.
- Launch Codex, Claude Code, or a custom runner in a local terminal session.

Run history is written under:

```text
~/.agent-board/runs/<owner__repo>/
```
