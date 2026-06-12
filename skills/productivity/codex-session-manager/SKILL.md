---
name: codex-session-manager
description: 自动管理 Codex App 会话：全局扫描 threads，按规则重命名、置顶、取消置顶、归档并输出审计摘要。用于整理或归档 Codex 会话、维护 Codex thread 命名规范，或在 Codex automation 定时执行会话管理。
---

```python
from skill_contract import *

skill(
    name="codex-session-manager",
    purpose="无人值守地整理 Codex App 全局会话，维护标题、置顶状态和归档状态，并输出可审计运行摘要。",
)

activate_when([
    "用户要求自动整理、管理、归档或清理 Codex 会话、Codex threads、Codex 线程",
    "用户要求维护 Codex 会话标题格式、置顶状态或归档状态",
    "用户要求在 Codex automation、定时器或 scheduled job 中运行会话管理",
    "用户明确调用 codex-session-manager",
])

do_not_activate_when([
    "用户只要求总结当前对话或写 handoff 文档",
    "用户要求创建、fork、继续、handoff 或发送消息到某个 Codex thread",
    "用户管理的是 Git、worktree、PR、issue 或项目任务，而不是 Codex App 会话",
])

inputs(
    required=[
        input("management_request", type=NaturalLanguage, description="本次会话管理请求或 automation prompt。"),
    ],
    optional=[
        input("archive_after", type=Text, description="未活跃多久后归档。默认 7 days。", default="7 days"),
        input("pin_active_within", type=Text, description="最近多久内活跃的会话保持置顶。默认 1 hour。", default="1 hour"),
        input("project_queries", type=Text, description="额外扫描的项目、cwd basename 或关键词，逗号分隔。默认从首批结果自动推断。", required=False),
        input("retention_prefix", type=Text, description="永不自动归档的标题前缀。默认 保留_。", default="保留_"),
    ],
    ask_when_missing=False,
)

outputs(
    required=[
        output(
            "run_report",
            type=Text,
            description="只输出到本次响应的运行报告，不写本地日志。",
            required_sections=["summary", "actions", "skipped", "errors"],
            success_criteria=[
                "统计 scanned、renamed、pinned、unpinned、archived、skipped、failed",
                "按 cwd 或项目分组列出关键动作",
                "说明 Automation、保留前缀、活跃线程、无法可靠命名和工具失败等跳过原因",
            ],
        ),
    ],
)

TITLE_FORMAT = "{retention?}_{type}_{identifier?}_{title}_{date}"

workflow([
    step(
        "resolve_runtime",
        f"""
        Resolve current time, thresholds, and Codex App thread tools before side effects.
        Use the system current time when available; otherwise use {call_tool(
            "date",
            how="run date +%s for a Unix timestamp",
            expect="current timestamp in seconds",
            on_failure="report no actions taken if no reliable current time exists",
        )}.
        If thread tools are unavailable, use {call_tool(
            "tool_search",
            how="search for list_threads, read_thread, set_thread_title, set_thread_pinned, set_thread_archived",
            expect="thread management tools become callable",
            on_failure="report no actions taken because thread tools are unavailable",
        )}.
        """,
        reads=["management_request", "archive_after", "pin_active_within", "project_queries"],
        writes=["runtime_context"],
    ),
    step(
        "inventory_threads",
        f"""
        First call list_threads with numeric limit=50, the largest verified accepted page size. Do not pass "50" as a string, and do not pass limit=100.
        Use {call_tool(
            "codex_app.list_threads",
            how='call list_threads with JSON arguments {"limit": 50}',
            expect="summaries containing id, title, preview, status, cwd, createdAt, updatedAt",
            on_failure="stop before side effects and report the failure",
        )}.
        If the first page returns exactly 50 rows, expand coverage by querying distinct cwd basenames and explicit project_queries with {{"query": seed, "limit": 50}}; merge results by thread id.
        If any query also returns exactly 50 rows, report coverage_limited for that seed because list_threads has no exposed pagination cursor.
        """,
        reads=["runtime_context", "project_queries"],
        writes=["thread_inventory"],
    ),
    step(
        "plan_actions",
        f"""
        Normalize timestamps, classify each thread, and build a complete action plan before applying changes.
        Side-effect priority is archive, then pin/unpin, then rename.
        Read detailed context only for rename candidates whose title and preview are insufficient, using {call_tool(
            "codex_app.read_thread",
            how="call read_thread with turnLimit=3 and includeOutputs=false",
            expect="recent turn summaries useful for title inference",
            on_failure="skip rename for that thread and record the reason",
        )}.
        """,
        reads=["thread_inventory", "runtime_context"],
        writes=["action_plan"],
    ),
    step(
        "apply_actions",
        f"""
        Apply the action plan automatically and continue after per-thread failures.
        Use {call_tool(
            "codex_app.set_thread_archived",
            how="archive candidates with archived=true",
            expect="requested archive state applied",
            on_failure="record failure and continue",
        )}, {call_tool(
            "codex_app.set_thread_pinned",
            how="set pinned=true for recent non-archive threads and pinned=false for stale non-archive threads",
            expect="requested pinned state applied idempotently",
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
        "Output run_report only in the response; group by cwd, summarize unchanged/skipped categories, and do not write local files.",
        reads=["thread_inventory", "action_plan", "applied_actions", "errors"],
        writes=["run_report"],
    ),
])

decision_rules([
    when("updatedAt or createdAt has 13 digits", then="treat it as milliseconds; 10 digits as seconds"),
    when("calling list_threads for global inventory", then="use numeric limit=50; never use empty arguments as the primary call because it only returns the default recent subset"),
    when("global inventory returns exactly 50 threads", then="derive query seeds from cwd basenames plus project_queries and call list_threads with {query: seed, limit: 50}; dedupe by id"),
    when("a list_threads query returns exactly 50 threads", then="mark coverage_limited for that query because more matches may exist"),
    when("thread is older than archive_after, not live, and title lacks retention_prefix", then="archive it and skip pin/unpin plus rename"),
    when("thread title starts with retention_prefix", then="never archive it; preserve retention_prefix if renaming"),
    when("status is active, inProgress, running, or otherwise live", then="never archive it"),
    when("non-archive thread updated within pin_active_within", then="set pinned=true", else_="set pinned=false"),
    when("title or preview contains 'Automation:' or 'Automation ID:'", then="skip rename but still apply pin/archive rules"),
    when("title already matches TITLE_FORMAT", then="skip rename"),
    when("identifier is uncertain", then="omit it; never invent PRD, Issue, PR, Slice, or project ids"),
    when("type or concise title is uncertain", then="skip rename and report skipped_unclear_name"),
    when("renaming", then="use createdAt local date if available, else current local date; remove URLs, file paths, newlines, screenshots, pasted prompts, and long sentences"),
    when("inferring type", then="规划 for PRD/plan/brainstorm/design/spec/grill; 执行 for implement/build/add/create/migrate/refactor/deliver; 验收 for HAT/UAT/QA/acceptance/verify/review validation; 修复 for bug/fix/broken/failing/error/regression/diagnose/debug; if signals conflict and goal is unclear, skip rename"),
    when("identifier text matches PRD, Issue, PR, Slice, or Skill", then="normalize to PRD-<n>, Issue-<n>, PR-<n>, Slice-<n>, or Skill"),
    when("list_threads does not expose pinned state", then="still call set_thread_pinned idempotently by age rule"),
])

quality_bar(
    must=[
        "Run automatically without human confirmation.",
        "Operate across the union of list_threads(limit=50) and any project-query expansion results, not only the current cwd.",
        "Default thresholds are archive_after=7 days and pin_active_within=1 hour.",
        "Default title format is {retention?}_{type}_{identifier?}_{title}_{date}; identifier is optional.",
        "保留_ prevents archive; Automation threads never rename.",
        "Do not rename when type or title is unreliable.",
        "Report only in the response with counts, actions, skipped reasons, and errors.",
    ],
    should=[
        "Keep titles short, searchable, and free of prompt boilerplate.",
        "Group global results by cwd.",
        "Read thread details only for rename candidates.",
    ],
    must_not=[
        "Do not archive live threads.",
        "Do not create, fork, send messages to, handoff, delete, or move threads.",
        "Do not persist logs, state, or memory files.",
        "Do not fabricate identifiers, dates, names, or action success.",
    ],
)
```
