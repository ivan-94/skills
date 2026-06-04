# CLI-Backed Compact Skill Example

Use this for a simple skill backed by one bundled CLI/script plus one small reference file. This is the default shape for notification, formatting, export, upload, or wrapper skills that do not need review vocabulary, graph workflows, or teaching examples.

```python
from skill_contract import *

skill(
    name="lark-notify",
    purpose="Send a Lark notification through the bundled CLI after the user has authorized the send.",
    summary="Compact CLI-backed notification skill.",
)

activate_when([
    "user asks to send a Lark notification",
    "user asks to notify a Lark webhook or chat through this skill",
])

do_not_activate_when([
    "user only wants to draft notification text without sending it",
    "user asks for general Lark API development outside this bundled CLI",
])

inputs(
    required=[
        input("message", type=NaturalLanguage, description="Notification content to send."),
        input("send_authorization", type=Text, description="Explicit user authorization to send the real notification."),
    ],
    optional=[
        input("webhook", type=URL, description="Webhook URL or configured destination name."),
    ],
)

outputs(
    required=[
        output("send_result", type=Text, description="Whether the CLI sent the notification and any returned identifier or error."),
    ],
)

resources(
    scripts=[
        script(
            "scripts/cli.py",
            purpose="Send or dry-run a Lark notification.",
            interface="python3 skills/lark-notify/scripts/cli.py send --message <text> --webhook <url>",
            run_help_first=True,
        ),
    ],
    references=[
        reference(
            "references/lark-webhook.md",
            purpose="Webhook payload rules, configured destinations, and safety notes.",
            when="before constructing or sending a real payload",
        ),
    ],
)

decision_rules([
    when("user asks for dry-run, preview, or validation only", then="run the CLI in dry-run mode and do not send"),
    when("user explicitly authorizes a real send", then="run the CLI send path with the approved content and destination"),
    when("message format is raw, text, card, or business payload", then="preserve the requested payload style instead of normalizing it into plain text"),
    when("CLI flags or payload shape are uncertain", then="prefer help or dry-run over a real send"),
])

workflow([
    step("read_reference", "Read references/lark-webhook.md for payload and safety rules."),
    step(
        "inspect_cli",
        f"""
        Inspect the CLI before sending.
        Use {call_script(
            "scripts/cli.py",
            how="from the host project root, run python3 skills/lark-notify/scripts/cli.py --help and confirm the available send/dry-run flags",
            expect="help output showing send and dry-run usage",
            on_failure="stop and report that the CLI interface is unavailable",
        )}.
        """,
    ),
    step(
        "send_notification",
        f"""
        Send only after send_authorization is explicit.
        Use {call_script(
            "scripts/cli.py",
            how="from the host project root, run python3 skills/lark-notify/scripts/cli.py send with the approved message and destination",
            expect="a send result or structured error from the CLI",
            on_failure="report the CLI error and do not retry a real send without user approval",
        )}.
        """,
        reads=["message", "send_authorization"],
        writes=["send_result"],
    ),
])

safety_policy(
    must=[
        "Require explicit user authorization before any real webhook send.",
        "Use dry-run or help commands before real send when the CLI interface is uncertain.",
    ],
    must_not=[
        "Do not send a real notification from a draft-only request.",
        "Do not retry failed real sends without user approval.",
    ],
    approval_required=["send a real webhook notification"],
)

quality_bar(
    must=[
        "Contract stays lightweight: no teaching examples or review_dimensions unless the user asks for them.",
        "decision_rules only describe user-visible CLI choices such as dry-run/send and payload style.",
        "Script target is skill-relative; call_script how explains the host-root command when needed.",
        "Real external sends have an explicit authorization input and safety_policy approval boundary.",
    ],
)

validation(
    [
        check("cli_help_available", "CLI help can be inspected before send.", command="python3 skills/lark-notify/scripts/cli.py --help"),
        check("authorization_required", "send_notification requires send_authorization before real send."),
    ],
    on_failure="report",
)
```
