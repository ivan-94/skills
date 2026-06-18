#!/usr/bin/env python3
"""Export image_generation_end base64 payloads from a Codex rollout."""

from __future__ import annotations

import argparse
import base64
import binascii
import json
import os
import re
import shutil
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


def default_generated_images_dir() -> Path:
    codex_home = Path(os.environ.get("CODEX_HOME", "~/.codex")).expanduser()
    return codex_home / "generated_images"


def parse_timestamp(value: str | None) -> datetime | None:
    if not value:
        return None
    if re.fullmatch(r"\d+(\.\d+)?", value):
        number = float(value)
        if number > 10_000_000_000:
            number = number / 1000
        return datetime.fromtimestamp(number, tz=timezone.utc)
    normalized = value.replace("Z", "+00:00")
    parsed = datetime.fromisoformat(normalized)
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def safe_name(value: str) -> str:
    cleaned = re.sub(r"[^A-Za-z0-9._-]+", "-", value).strip("-._")
    return cleaned or "image"


def extension_for(data: bytes) -> str:
    if data.startswith(b"\x89PNG\r\n\x1a\n"):
        return ".png"
    if data.startswith(b"\xff\xd8\xff"):
        return ".jpg"
    if data.startswith(b"RIFF") and data[8:12] == b"WEBP":
        return ".webp"
    return ".png"


def decode_image(data: str) -> bytes:
    if "," in data and data.lstrip().startswith("data:"):
        data = data.split(",", 1)[1]
    try:
        return base64.b64decode(data, validate=True)
    except binascii.Error as exc:
        raise ValueError(f"invalid base64 image payload: {exc}") from exc


def read_events(rollout: Path, after: datetime | None, call_id: str | None) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    if not rollout.is_file():
        raise FileNotFoundError(f"rollout not found: {rollout}")

    session: dict[str, Any] = {}
    events: list[dict[str, Any]] = []
    with rollout.open("r", encoding="utf-8") as handle:
        for line_no, line in enumerate(handle, start=1):
            try:
                record = json.loads(line)
            except json.JSONDecodeError:
                continue

            if record.get("type") == "session_meta":
                payload = record.get("payload") or {}
                session = {
                    "thread_id": payload.get("id"),
                    "cwd": payload.get("cwd"),
                    "session_timestamp": payload.get("timestamp"),
                    "source": payload.get("source"),
                    "thread_source": payload.get("thread_source"),
                    "cli_version": payload.get("cli_version"),
                }
                continue

            payload = record.get("payload") or {}
            if record.get("type") != "event_msg" or payload.get("type") != "image_generation_end":
                continue
            if call_id and payload.get("call_id") != call_id:
                continue

            event_time = parse_timestamp(record.get("timestamp"))
            if after and event_time and event_time <= after:
                continue

            result = payload.get("result")
            if not result:
                continue

            events.append(
                {
                    "line": line_no,
                    "timestamp": record.get("timestamp"),
                    "event_time": event_time,
                    "call_id": payload.get("call_id") or f"line-{line_no}",
                    "filename": payload.get("filename"),
                    "saved_path": payload.get("saved_path"),
                    "result": result,
                }
            )

    return session, events


def output_path(root: Path, thread_id: str, event: dict[str, Any], data: bytes) -> Path:
    timestamp = event.get("timestamp") or "unknown-time"
    timestamp = timestamp.replace(":", "").replace("-", "").replace(".", "").replace("Z", "Z")
    call_id = safe_name(event["call_id"])
    if event.get("filename"):
        filename = safe_name(event["filename"])
        if "." not in Path(filename).name:
            filename += extension_for(data)
    else:
        filename = f"{safe_name(timestamp)}-{call_id[:32]}{extension_for(data)}"
    return root / safe_name(thread_id) / filename


def export_events(args: argparse.Namespace) -> dict[str, Any]:
    rollout = Path(args.rollout).expanduser().resolve()
    after = parse_timestamp(args.after)
    session, events = read_events(rollout, after, args.call_id)
    if not events:
        raise RuntimeError("no matching image_generation_end events found")

    selected = events if args.all else [events[-1]]
    thread_id = session.get("thread_id") or rollout.stem
    out_root = Path(args.out_dir).expanduser().resolve()
    copy_to = Path(args.copy_to).expanduser().resolve() if args.copy_to else None

    exported: list[dict[str, Any]] = []
    for event in selected:
        data = decode_image(event["result"])
        target = output_path(out_root, thread_id, event, data)
        status = "dry_run"

        if not args.dry_run:
            target.parent.mkdir(parents=True, exist_ok=True)
            if target.exists() and not args.overwrite:
                status = "exists"
            else:
                target.write_bytes(data)
                status = "written"

        copy_path = None
        if copy_to is not None:
            copy_path = copy_to / target.name
            if not args.dry_run:
                copy_to.mkdir(parents=True, exist_ok=True)
                if not copy_path.exists() or args.overwrite:
                    shutil.copy2(target, copy_path)

        exported.append(
            {
                "status": status,
                "path": str(target),
                "copy_path": str(copy_path) if copy_path else None,
                "bytes": len(data),
                "timestamp": event.get("timestamp"),
                "call_id": event.get("call_id"),
                "source_line": event.get("line"),
            }
        )

    return {
        "rollout": str(rollout),
        "thread_id": thread_id,
        "cwd": session.get("cwd"),
        "matched_count": len(events),
        "exported_count": len(exported),
        "exported": exported,
    }


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Export image_generation_end base64 payloads from an explicit Codex rollout file."
    )
    parser.add_argument("--rollout", required=True, help="Path to the Codex rollout JSONL file. Required.")
    parser.add_argument("--after", help="Only consider events after this ISO timestamp or epoch value.")
    parser.add_argument("--call-id", help="Only export the image event with this image generation call id.")
    parser.add_argument(
        "--out-dir",
        default=str(default_generated_images_dir()),
        help="Generated images root. Defaults to CODEX_HOME/generated_images or ~/.codex/generated_images.",
    )
    parser.add_argument("--copy-to", help="Optional directory to copy exported files into.")
    parser.add_argument("--all", action="store_true", help="Export all matching events instead of only the latest one.")
    parser.add_argument("--overwrite", action="store_true", help="Overwrite existing output files.")
    parser.add_argument("--dry-run", action="store_true", help="Decode and report paths without writing files.")
    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    try:
        result = export_events(args)
    except Exception as exc:
        print(json.dumps({"error": str(exc)}, ensure_ascii=False), file=sys.stderr)
        return 1

    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
