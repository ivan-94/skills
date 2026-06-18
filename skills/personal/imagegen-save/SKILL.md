---
name: imagegen-save
description: Use when the user asks to save imagegen output to disk, recover unsaved Codex imagegen images, or list current-CWD rollout candidates before exporting from --rollout.
---

```python
from skill_contract import *

skill(
    name="imagegen-save",
    purpose="Persist Codex imagegen outputs to the filesystem from explicit rollout archives.",
)

activate_when([
    "user asks to generate an image with imagegen and save, export, persist, or write it to disk",
    "user asks to recover unsaved Codex imagegen output or list rollout candidates for image export",
])

do_not_activate_when([
    "user only wants an image displayed in chat",
    "user asks for general OpenAI image API code or for a non-Codex image already on disk",
])

inputs(
    required=[
        input("task", type=NaturalLanguage, description="Image generation or recovery request."),
    ],
    optional=[
        input("rollout", type=File, description="Explicit Codex rollout JSONL path.", required=False),
        input("target_directory", type=Directory, description="Optional copy destination.", required=False),
        input("after_timestamp", type=Text, description="Timestamp captured before imagegen.", required=False),
    ],
)

outputs(
    required=[
        output("saved_image_paths", type=Text, description="Written image path or paths."),
        output("rollout_selection_evidence", type=Text, description="Chosen rollout path or candidate list."),
    ],
)

resources(
    scripts=[
        script(
            "scripts/list_rollouts.py",
            when="choosing a rollout for the current cwd",
            interface="python3 scripts/list_rollouts.py [--cwd <path>] [--codex-home <path>] [--format json|text]",
            run_help_first=True,
            black_box=True,
            requires=["python3"],
            outputs=["up_to_three_rollout_candidates"],
        ),
        script(
            "scripts/export_imagegen.py",
            when="exporting imagegen base64 from a rollout",
            interface="python3 scripts/export_imagegen.py --rollout <rollout.jsonl> [--after <timestamp>] [--call-id <id>] [--copy-to <dir>] [--all]",
            run_help_first=True,
            black_box=True,
            requires=["python3"],
            outputs=["saved_image_paths"],
        ),
    ],
)

environment(
    variables=[
        env("CODEX_HOME", default="~/.codex", required=False, when="locating Codex state and generated_images"),
    ],
    commands=["python3"],
    network="not_required",
    filesystem="anywhere_with_user_request",
)

decision_rules([
    when("rollout is missing", then="run scripts/list_rollouts.py for the current cwd, choose from its at-most-three candidates, and ask the user only if ambiguous"),
    when("creating a new image", then="capture a UTC after_timestamp before calling imagegen, then export with --after"),
    when("exporting", then="always pass --rollout to scripts/export_imagegen.py; never infer rollout during export"),
    when("target_directory is provided", then="use --copy-to so the canonical export remains under CODEX_HOME/generated_images"),
])

workflow([
    step(
        "select_rollout",
        f"""
        If rollout is missing, use {call_script(
            "scripts/list_rollouts.py",
            how="run python3 scripts/list_rollouts.py --cwd <current cwd> --format json, then choose the candidate matching this session's title, description, active_at, and image stats",
            expect="zero to three candidates sorted by active time descending",
            on_failure="ask the user for an explicit rollout path",
        )}.
        """,
        writes=["rollout_selection_evidence"],
        when="rollout input is missing",
    ),
    step(
        "generate_image",
        f"""
        For new images, record after_timestamp and use {call_tool(
            "image_gen",
            how="call built-in image generation with the user's prompt or edit instructions",
            expect="a new image_generation_end event in the selected rollout",
            on_failure="report failure and do not export",
        )}.
        """,
        reads=["task", "rollout_selection_evidence"],
        writes=["after_timestamp"],
        when="task requires a new image",
    ),
    step(
        "export_image",
        f"""
        Use {call_script(
            "scripts/export_imagegen.py",
            how="run python3 scripts/export_imagegen.py --rollout <selected rollout>, adding --after <timestamp> and --copy-to <target dir> when available",
            expect="JSON with exported paths and byte counts",
            on_failure="report the error, rollout path, and filters used",
        )}.
        """,
        reads=["rollout", "target_directory", "after_timestamp"],
        writes=["saved_image_paths"],
    ),
])

quality_bar(
    must=[
        "Candidate listing returns at most three current-cwd rollouts sorted by active time.",
        "Export always uses an explicit --rollout and never falls back to another rollout silently.",
        "Saved images are written under CODEX_HOME/generated_images; target directories receive copies.",
        "Final response includes the rollout path and exported paths, or the exact export error.",
    ],
    must_not=[
        "Do not depend on Vibe Island, process_manager logs, or third-party session indexes.",
    ],
)
```
