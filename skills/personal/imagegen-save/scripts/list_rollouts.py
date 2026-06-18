#!/usr/bin/env python3
"""List Codex rollout candidates for a working directory."""

from __future__ import annotations

import argparse
import json
import os
import sqlite3
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


MAX_LIMIT = 3


def default_codex_home() -> Path:
    return Path(os.environ.get("CODEX_HOME", "~/.codex")).expanduser()


def utc_from_ms(value: int | None) -> str | None:
    if value is None:
        return None
    return datetime.fromtimestamp(value / 1000, tz=timezone.utc).isoformat().replace("+00:00", "Z")


def truncate(value: str, limit: int = 220) -> str:
    value = " ".join((value or "").split())
    if len(value) <= limit:
        return value
    return value[: limit - 1] + "..."


def read_image_stats(rollout_path: str) -> dict[str, Any]:
    path = Path(rollout_path)
    stats: dict[str, Any] = {
        "rollout_exists": path.is_file(),
        "image_generation_count": 0,
        "latest_image_generation_at": None,
        "latest_image_generation_call_id": None,
    }
    if not path.is_file():
        return stats

    try:
        with path.open("r", encoding="utf-8") as handle:
            for line in handle:
                try:
                    event = json.loads(line)
                except json.JSONDecodeError:
                    continue
                payload = event.get("payload") or {}
                if event.get("type") != "event_msg" or payload.get("type") != "image_generation_end":
                    continue
                stats["image_generation_count"] += 1
                stats["latest_image_generation_at"] = event.get("timestamp")
                stats["latest_image_generation_call_id"] = payload.get("call_id")
    except OSError as exc:
        stats["rollout_read_error"] = str(exc)

    return stats


def connect_state_db(codex_home: Path) -> sqlite3.Connection:
    db_path = codex_home / "state_5.sqlite"
    if not db_path.is_file():
        raise FileNotFoundError(f"Codex state database not found: {db_path}")
    conn = sqlite3.connect(f"file:{db_path}?mode=ro", uri=True)
    conn.row_factory = sqlite3.Row
    return conn


def list_candidates(args: argparse.Namespace) -> dict[str, Any]:
    codex_home = Path(args.codex_home).expanduser()
    cwd = str(Path(args.cwd).expanduser().resolve())
    limit = max(1, min(args.limit, MAX_LIMIT))

    where = ["cwd = ?"]
    params: list[Any] = [cwd]
    if not args.include_archived:
        where.append("archived = 0")

    query = f"""
        select
            id,
            rollout_path,
            cwd,
            title,
            first_user_message,
            preview,
            source,
            thread_source,
            model,
            cli_version,
            created_at_ms,
            updated_at_ms,
            coalesce(updated_at_ms, updated_at * 1000, created_at_ms, created_at * 1000, 0) as active_ms
        from threads
        where {" and ".join(where)}
        order by active_ms desc
        limit ?
    """
    params.append(limit)

    with connect_state_db(codex_home) as conn:
        rows = conn.execute(query, params).fetchall()

    candidates: list[dict[str, Any]] = []
    for index, row in enumerate(rows, start=1):
        description = row["preview"] or row["first_user_message"] or ""
        item: dict[str, Any] = {
            "rank": index,
            "thread_id": row["id"],
            "rollout": row["rollout_path"],
            "cwd": row["cwd"],
            "title": row["title"] or "",
            "description": truncate(description),
            "first_user_message": truncate(row["first_user_message"] or ""),
            "preview": truncate(row["preview"] or ""),
            "updated_at": utc_from_ms(row["updated_at_ms"]),
            "created_at": utc_from_ms(row["created_at_ms"]),
            "active_at": utc_from_ms(row["active_ms"]),
            "source": row["source"],
            "thread_source": row["thread_source"],
            "model": row["model"],
            "cli_version": row["cli_version"],
        }
        if not args.no_image_stats:
            item.update(read_image_stats(row["rollout_path"]))
        else:
            item["rollout_exists"] = Path(row["rollout_path"]).is_file()
        candidates.append(item)

    return {
        "cwd": cwd,
        "codex_home": str(codex_home),
        "max_candidates": MAX_LIMIT,
        "count": len(candidates),
        "candidates": candidates,
    }


def print_text(result: dict[str, Any]) -> None:
    print(f"CWD: {result['cwd']}")
    print(f"Candidates: {result['count']} (max {result['max_candidates']})")
    for item in result["candidates"]:
        print()
        print(f"{item['rank']}. {item['title'] or '(untitled)'}")
        print(f"   active_at: {item['active_at']}")
        print(f"   thread_id: {item['thread_id']}")
        print(f"   description: {item['description']}")
        print(f"   image_generations: {item.get('image_generation_count', 'unknown')}")
        print(f"   rollout: {item['rollout']}")


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="List up to three Codex rollout candidates whose thread cwd matches the current directory."
    )
    parser.add_argument("--cwd", default=os.getcwd(), help="Working directory to match exactly. Defaults to cwd.")
    parser.add_argument(
        "--codex-home",
        default=str(default_codex_home()),
        help="Codex home directory. Defaults to CODEX_HOME or ~/.codex.",
    )
    parser.add_argument("--limit", type=int, default=MAX_LIMIT, help="Maximum candidates to return, capped at 3.")
    parser.add_argument("--include-archived", action="store_true", help="Include archived Codex threads.")
    parser.add_argument("--no-image-stats", action="store_true", help="Skip scanning rollout files for image stats.")
    parser.add_argument("--format", choices=["json", "text"], default="json", help="Output format.")
    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    try:
        result = list_candidates(args)
    except Exception as exc:
        error = {"error": str(exc)}
        print(json.dumps(error, ensure_ascii=False), file=sys.stderr)
        return 2

    if args.format == "text":
        print_text(result)
    else:
        print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
