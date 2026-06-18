---
name: codex-session-manager
description: 自动管理 Codex App 会话：全局扫描 threads，按规则重命名、置顶、取消置顶、归档并输出审计摘要。用于整理或归档 Codex 会话、维护 Codex thread 命名规范，或在 Codex automation 定时执行会话管理。
---

```python
from skill_contract import *

skill(
    name="codex-session-manager",
    purpose="无人值守地归档、置顶和重命名 Codex App 用户会话，并输出审计摘要。",
)

activate_when([
    "用户要求整理、归档、清理或管理 Codex 会话、threads、线程",
    "用户要求维护 Codex 会话标题、置顶或归档状态",
    "用户要求在 automation、定时器或 scheduled job 中运行 Codex 会话管理",
    "用户明确调用 codex-session-manager",
])

do_not_activate_when([
    "用户只要求总结当前对话或写 handoff 文档",
    "用户要求创建、fork、继续、handoff 或发送消息到某个 Codex thread",
    "用户管理的是 Git、worktree、PR、issue 或项目任务，而不是 Codex App 会话",
])

inputs(
    required=[
        input("management_request", type=NaturalLanguage),
    ],
    optional=[
        input("archive_after", type=Text, description="未活跃多久后归档。默认 7 days。", default="7 days"),
        input("pin_active_within", type=Text, description="最近多久内活跃的会话保持置顶。默认 1 hour。", default="1 hour"),
        input("retention_prefix", type=Text, description="永不自动归档的标题前缀。默认 保留_。", default="保留_"),
    ],
    ask_when_missing=False,
)

outputs(
    required=[
        output(
            "run_report",
            type=Text,
            description="本次响应内的运行报告，不写本地日志。",
            required_sections=["summary", "actions", "warnings", "skipped", "errors"],
        ),
    ],
)

resources(
    scripts=[
        script(
            "scripts/force_archive.py",
            when="applying stale-session archive policy before inventory",
            interface="python3 scripts/force_archive.py",
            run_help_first=False,
            black_box=True,
            requires=["python3", "codex"],
            outputs=["archive_report_json"],
        ),
        script(
            "scripts/list_threads_from_state.py",
            when="inventorying Codex App sessions",
            interface="python3 scripts/list_threads_from_state.py",
            run_help_first=False,
            black_box=True,
            requires=["python3"],
            outputs=["thread_inventory_csv"],
        ),
    ],
)

TITLE_FORMAT = "{retention?}_{type}_{identifier?}_{title}_{date}"

workflow([
    step(
        "archive",
        f"""
        Run archive before inventory.
        Use {call_script(
            "scripts/force_archive.py",
            how="from the skill directory, run python3 scripts/force_archive.py; pass non-default archive_after and retention_prefix through CODEX_SESSION_ARCHIVE_AFTER and CODEX_SESSION_RETENTION_PREFIX",
            expect="JSON archive report; per-session archive failures appear as warnings",
            on_failure="record archive warning and continue to inventory",
        )}.
        """,
        reads=["management_request", "archive_after", "retention_prefix"],
        writes=["archive_report"],
    ),
    step(
        "inventory",
        f"""
        Use {call_script(
            "scripts/list_threads_from_state.py",
            how="from the skill directory, run python3 scripts/list_threads_from_state.py with no arguments",
            expect="CSV with id,title,pinned columns for remaining user, unarchived sessions",
            on_failure="stop before pin/rename and report inventory_unavailable",
        )}.
        """,
        reads=["archive_report"],
        writes=["thread_inventory"],
    ),
    step(
        "plan",
        f"""
        Parse inventory CSV, decide pin/unpin and rename actions, and fetch details only when needed.
        Use {call_tool(
            "codex_app.read_thread",
            how="call read_thread with turnLimit=3 and includeOutputs=false",
            expect="timestamps, cwd, preview, createdAt, and recent turns when available",
            on_failure="skip pin/unpin or rename for that thread and record the reason",
        )}.
        """,
        reads=["thread_inventory", "pin_active_within"],
        writes=["action_plan"],
    ),
    step(
        "apply",
        f"""
        Use {call_tool(
            "codex_app.set_thread_pinned",
            how="set pinned=true for recently active sessions and pinned=false for stale sessions",
            on_failure="record failure and continue",
        )}, and {call_tool(
            "codex_app.set_thread_title",
            how="rename candidates with the generated title",
            expect="requested title applied",
            on_failure="record failure and continue",
        )}.
        """,
        reads=["action_plan"],
        writes=["applied_actions", "errors"],
    ),
    step(
        "report",
        "Return run_report with counts, actions, skipped reasons, and errors.",
        reads=["archive_report", "thread_inventory", "action_plan", "applied_actions", "errors"],
        writes=["run_report"],
    ),
])

decision_rules([
    when("reading inventory", then="parse only id,title,pinned CSV from scripts/list_threads_from_state.py and do not pass filters"),
    when("archive reports warnings or invocation failure", then="include the warning in run_report and continue to inventory"),
    when("thread lacks a reliable activity timestamp", then="skip pin/unpin and report skipped_missing_activity"),
    when("thread updated within pin_active_within", then="set pinned=true", else_="set pinned=false"),
    when("planned pinned state equals inventory pinned state", then="skip set_thread_pinned and report unchanged"),
    when("title starts with retention_prefix", then="preserve the prefix when renaming"),
    when("title or preview contains 'Automation:' or 'Automation ID:'", then="skip rename"),
    when("title already matches TITLE_FORMAT", then="skip rename"),
    when("inventory title is truncated, type is unclear, or concise title is unclear", then="read_thread once; if still unclear, skip rename"),
    when("identifier is uncertain", then="omit it; never invent PRD, Issue, PR, Slice, or project ids"),
    when("renaming", then="use read_thread createdAt if available, else current local date; remove URLs, file paths, newlines, screenshots, pasted prompts, and long sentences"),
    when("inferring type", then="规划 for PRD/plan/brainstorm/design/spec/grill; 执行 for implement/build/add/create/migrate/refactor/deliver; 验收 for HAT/UAT/QA/acceptance/verify/review validation; 修复 for bug/fix/broken/failing/error/regression/diagnose/debug; if signals conflict and goal is unclear, skip rename"),
    when("identifier text matches PRD, Issue, PR, Slice, or Skill", then="normalize to PRD-<n>, Issue-<n>, PR-<n>, Slice-<n>, or Skill"),
])

quality_bar(
    must=[
        "Run automatically without human confirmation.",
        "Archive only through scripts/force_archive.py.",
        "Inventory only through scripts/list_threads_from_state.py with no arguments.",
        "Default title format is {retention?}_{type}_{identifier?}_{title}_{date}; identifier is optional.",
        "Do not rename Automation sessions or sessions with unreliable type/title.",
        "Do not create, fork, send messages to, delete, or directly edit Codex state files.",
    ],
)
```
