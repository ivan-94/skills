#!/usr/bin/env python3
"""Archive stale Codex user sessions through the Codex CLI."""

from __future__ import annotations

import argparse
import json
import os
import re
import shutil
import sqlite3
import subprocess
import sys
import time
from pathlib import Path
from typing import Any


REQUIRED_COLUMNS = {
    "id",
    "title",
    "cwd",
    "created_at",
    "updated_at",
    "created_at_ms",
    "updated_at_ms",
    "archived",
    "thread_source",
}


def default_state_db() -> Path:
    codex_home = os.environ.get("CODEX_HOME")
    if codex_home:
        return Path(codex_home).expanduser() / "sqlite" / "state_5.sqlite"
    return Path.home() / ".codex" / "sqlite" / "state_5.sqlite"


def open_readonly(path: Path) -> sqlite3.Connection:
    uri = f"file:{path}?mode=ro"
    return sqlite3.connect(uri, uri=True)


def table_columns(conn: sqlite3.Connection, table: str) -> set[str]:
    rows = conn.execute(f"PRAGMA table_info({table})").fetchall()
    return {str(row[1]) for row in rows}


def normalize_timestamp(seconds: Any, millis: Any) -> tuple[int | None, int | None]:
    seconds_value = int(seconds) if seconds is not None else None
    millis_value = int(millis) if millis is not None else None

    if seconds_value is not None and abs(seconds_value) >= 10**12:
        if millis_value is None:
            millis_value = seconds_value
        seconds_value = seconds_value // 1000
    if millis_value is not None and abs(millis_value) < 10**12:
        if seconds_value is None:
            seconds_value = millis_value
        millis_value = millis_value * 1000
    if seconds_value is None and millis_value is not None:
        seconds_value = millis_value // 1000
    if millis_value is None and seconds_value is not None:
        millis_value = seconds_value * 1000

    return seconds_value, millis_value


def parse_duration_seconds(value: str) -> int:
    text = value.strip().lower()
    if not text:
        raise ValueError("duration is empty")

    match = re.fullmatch(r"(\d+)(?:\s*([a-z]+))?", text)
    if not match:
        raise ValueError(f"unsupported duration: {value}")

    amount = int(match.group(1))
    unit = match.group(2) or "days"
    multipliers = {
        "s": 1,
        "sec": 1,
        "secs": 1,
        "second": 1,
        "seconds": 1,
        "m": 60,
        "min": 60,
        "mins": 60,
        "minute": 60,
        "minutes": 60,
        "h": 3600,
        "hr": 3600,
        "hrs": 3600,
        "hour": 3600,
        "hours": 3600,
        "d": 86400,
        "day": 86400,
        "days": 86400,
        "w": 604800,
        "week": 604800,
        "weeks": 604800,
    }
    if unit not in multipliers:
        raise ValueError(f"unsupported duration unit: {unit}")
    return amount * multipliers[unit]


def fetch_open_user_threads(conn: sqlite3.Connection, thread_source: str) -> list[dict[str, Any]]:
    rows = conn.execute(
        """
        SELECT
            id,
            title,
            cwd,
            created_at,
            updated_at,
            created_at_ms,
            updated_at_ms,
            archived,
            thread_source
        FROM threads
        WHERE thread_source = ? AND archived = 0
        ORDER BY updated_at ASC, created_at ASC, id ASC
        """,
        [thread_source],
    ).fetchall()

    threads: list[dict[str, Any]] = []
    for row in rows:
        created_at, created_at_ms = normalize_timestamp(row[3], row[5])
        updated_at, updated_at_ms = normalize_timestamp(row[4], row[6])
        threads.append(
            {
                "id": row[0],
                "title": row[1] or "",
                "cwd": row[2] or "",
                "createdAt": created_at,
                "updatedAt": updated_at,
                "createdAtMs": created_at_ms,
                "updatedAtMs": updated_at_ms,
                "archived": bool(row[7]),
                "threadSource": row[8],
            }
        )
    return threads


def load_threads(state_db: Path, thread_source: str) -> list[dict[str, Any]]:
    if not state_db.exists():
        raise FileNotFoundError(f"state database not found: {state_db}")

    with open_readonly(state_db) as conn:
        columns = table_columns(conn, "threads")
        if not columns:
            raise RuntimeError("state database has no threads table")

        missing = sorted(REQUIRED_COLUMNS - columns)
        if missing:
            raise RuntimeError("threads table missing required columns: " + ", ".join(missing))

        return fetch_open_user_threads(conn, thread_source)


def build_plan(
    threads: list[dict[str, Any]],
    *,
    now: int,
    archive_after_seconds: int,
    retention_prefix: str,
    limit: int | None,
) -> tuple[list[dict[str, Any]], dict[str, int]]:
    cutoff = now - archive_after_seconds
    skipped_recent = 0
    skipped_retained = 0
    candidates: list[dict[str, Any]] = []

    for thread in threads:
        title = thread["title"]
        updated_at = thread["updatedAt"] or thread["createdAt"]
        if retention_prefix and title.startswith(retention_prefix):
            skipped_retained += 1
            continue
        if updated_at is None or updated_at > cutoff:
            skipped_recent += 1
            continue
        candidates.append(thread)
        if limit is not None and len(candidates) >= limit:
            break

    return candidates, {
        "skippedRecent": skipped_recent,
        "skippedRetained": skipped_retained,
    }


def archive_candidates(candidates: list[dict[str, Any]], dry_run: bool) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    actions: list[dict[str, Any]] = []
    errors: list[dict[str, Any]] = []
    codex_bin = shutil.which("codex")

    for thread in candidates:
        action = {
            "id": thread["id"],
            "title": thread["title"],
            "cwd": thread["cwd"],
            "updatedAt": thread["updatedAt"],
            "dryRun": dry_run,
        }
        if dry_run:
            action["status"] = "would_archive"
            actions.append(action)
            continue

        if codex_bin is None:
            action["status"] = "failed"
            error = {**action, "error": "codex CLI not found"}
            errors.append(error)
            actions.append(action)
            continue

        try:
            result = subprocess.run(
                [codex_bin, "archive", thread["id"]],
                text=True,
                capture_output=True,
                timeout=60,
                check=False,
            )
        except subprocess.TimeoutExpired:
            action["status"] = "failed"
            error = {**action, "error": "codex archive timed out"}
            errors.append(error)
            actions.append(action)
            continue
        except OSError as exc:
            action["status"] = "failed"
            error = {**action, "error": str(exc)}
            errors.append(error)
            actions.append(action)
            continue
        if result.returncode == 0:
            action["status"] = "archived"
            actions.append(action)
            continue

        action["status"] = "failed"
        error = {
            **action,
            "returncode": result.returncode,
            "stderr": result.stderr.strip(),
            "stdout": result.stdout.strip(),
        }
        errors.append(error)
        actions.append(action)

    return actions, errors


def build_output(args: argparse.Namespace) -> tuple[dict[str, Any], int]:
    archive_after_seconds = parse_duration_seconds(args.archive_after)
    state_db = Path(args.state_db).expanduser() if args.state_db else default_state_db()
    now = int(time.time())
    cutoff = now - archive_after_seconds
    threads = load_threads(state_db, args.thread_source)
    candidates, skipped = build_plan(
        threads,
        now=now,
        archive_after_seconds=archive_after_seconds,
        retention_prefix=args.retention_prefix,
        limit=args.limit,
    )
    actions, errors = archive_candidates(candidates, args.dry_run)

    archived = sum(1 for action in actions if action["status"] == "archived")
    would_archive = sum(1 for action in actions if action["status"] == "would_archive")
    failed = len(errors)
    output = {
        "schemaVersion": 1,
        "source": {
            "type": "codex_state_5_sqlite",
            "path": str(state_db),
            "readOnly": True,
        },
        "operation": {
            "command": "codex archive",
            "dryRun": args.dry_run,
            "archiveAfter": args.archive_after,
            "archiveAfterSeconds": archive_after_seconds,
            "retentionPrefix": args.retention_prefix,
            "threadSource": args.thread_source,
            "now": now,
            "cutoff": cutoff,
        },
        "summary": {
            "scanned": len(threads),
            "candidates": len(candidates),
            "archived": archived,
            "wouldArchive": would_archive,
            "failed": failed,
            "warnings": failed,
            "skippedRecent": skipped["skippedRecent"],
            "skippedRetained": skipped["skippedRetained"],
            "limited": args.limit is not None,
        },
        "actions": actions,
        "warnings": errors,
        "errors": [],
    }
    return output, 0


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Archive stale Codex user sessions through `codex archive`.")
    parser.add_argument(
        "--state-db",
        help="Path to state_5.sqlite. Defaults to $CODEX_HOME/sqlite/state_5.sqlite or ~/.codex/sqlite/state_5.sqlite.",
    )
    parser.add_argument(
        "--archive-after",
        default=os.environ.get("CODEX_SESSION_ARCHIVE_AFTER", "7 days"),
        help="Archive sessions not updated within this duration. Default: 7 days.",
    )
    parser.add_argument(
        "--retention-prefix",
        default=os.environ.get("CODEX_SESSION_RETENTION_PREFIX", "保留_"),
        help="Title prefix that prevents automatic archive. Default: 保留_.",
    )
    parser.add_argument(
        "--thread-source",
        default="user",
        help="Thread source to manage. Default: user.",
    )
    parser.add_argument(
        "--limit",
        type=int,
        help="Optional maximum archive candidates to process.",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Report archive candidates without calling codex archive.",
    )
    parser.add_argument(
        "--pretty",
        action="store_true",
        help="Pretty-print JSON.",
    )
    return parser.parse_args(argv)


def main(argv: list[str]) -> int:
    args = parse_args(argv)
    try:
        output, exit_code = build_output(args)
    except Exception as exc:
        print(json.dumps({"schemaVersion": 1, "error": str(exc)}, ensure_ascii=False), file=sys.stderr)
        return 1

    indent = 2 if args.pretty else None
    print(json.dumps(output, ensure_ascii=False, indent=indent))
    for warning in output.get("warnings", []):
        thread_id = warning.get("id", "<unknown>")
        message = warning.get("error") or warning.get("stderr") or warning.get("stdout") or "archive failed"
        print(f"WARNING: failed to archive {thread_id}: {message}", file=sys.stderr)
    return exit_code


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
