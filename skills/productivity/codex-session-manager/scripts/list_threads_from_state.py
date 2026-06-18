#!/usr/bin/env python3
"""List unarchived Codex user sessions as compact CSV."""

from __future__ import annotations

import argparse
import csv
import io
import json
import os
import sqlite3
import sys
from pathlib import Path


REQUIRED_COLUMNS = {
    "id",
    "title",
    "created_at",
    "updated_at",
    "archived",
    "thread_source",
}
MAX_TITLE_CHARS = 120


def default_codex_home() -> Path:
    codex_home = os.environ.get("CODEX_HOME")
    if codex_home:
        return Path(codex_home).expanduser()
    return Path.home() / ".codex"


def default_state_db() -> Path:
    return default_codex_home() / "sqlite" / "state_5.sqlite"


def default_global_state() -> Path:
    return default_codex_home() / ".codex-global-state.json"


def open_readonly(path: Path) -> sqlite3.Connection:
    uri = f"file:{path}?mode=ro"
    return sqlite3.connect(uri, uri=True)


def table_columns(conn: sqlite3.Connection, table: str) -> set[str]:
    rows = conn.execute(f"PRAGMA table_info({table})").fetchall()
    return {str(row[1]) for row in rows}


def one_line_title(value: str | None) -> str:
    title = " ".join((value or "").split())
    if len(title) <= MAX_TITLE_CHARS:
        return title
    return title[: MAX_TITLE_CHARS - 3].rstrip() + "..."


def load_pinned_thread_ids(path: Path) -> set[str]:
    data = json.loads(path.read_text())
    pinned = data.get("pinned-thread-ids") or []
    if not isinstance(pinned, list):
        raise RuntimeError("pinned-thread-ids is not a list")
    return {item for item in pinned if isinstance(item, str)}


def fetch_thread_rows(conn: sqlite3.Connection, pinned_thread_ids: set[str]) -> list[list[str]]:
    rows = conn.execute(
        """
        SELECT id, title
        FROM threads
        WHERE thread_source = 'user' AND archived = 0
        ORDER BY updated_at DESC, created_at DESC, id DESC
        """
    ).fetchall()
    return [
        [
            row[0],
            one_line_title(row[1]),
            "true" if row[0] in pinned_thread_ids else "false",
        ]
        for row in rows
    ]


def render_csv(rows: list[list[str]]) -> str:
    output = io.StringIO()
    writer = csv.writer(output, lineterminator="\n")
    writer.writerow(["id", "title", "pinned"])
    writer.writerows(rows)
    return output.getvalue().rstrip("\n")


def build_output() -> str:
    state_db = default_state_db()
    global_state = default_global_state()
    if not state_db.exists():
        raise FileNotFoundError(f"state database not found: {state_db}")
    if not global_state.exists():
        raise FileNotFoundError(f"global state file not found: {global_state}")

    pinned_thread_ids = load_pinned_thread_ids(global_state)

    with open_readonly(state_db) as conn:
        columns = table_columns(conn, "threads")
        if not columns:
            raise RuntimeError("state database has no threads table")

        missing = sorted(REQUIRED_COLUMNS - columns)
        if missing:
            raise RuntimeError("threads table missing required columns: " + ", ".join(missing))

        return render_csv(fetch_thread_rows(conn, pinned_thread_ids))


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="List unarchived Codex user sessions as CSV: id,title,pinned."
    )
    return parser.parse_args(argv)


def main(argv: list[str]) -> int:
    parse_args(argv)
    try:
        output = build_output()
    except Exception as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 1

    if output:
        print(output)
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
