---
name: create-dsl-skills
description: Write or rewrite agent skills using the Python Skill Contract DSL. Use when the user wants a SKILL.md with a formal Python contract block, asks to encode a skill as DSL, or asks for the Skill Contract DSL spec/guide.
---

# Create DSL Skills

Use this skill to write `SKILL.md` files whose behavior is defined by a Python Skill Contract DSL block.

The DSL interface is specified by [references/contract.pyi](references/contract.pyi). Treat that file as the language spec. This guide explains how to use the spec to write useful skills.

## Core Rule

Write the contract first. The contract is normative. Markdown prose may explain the contract, but must not add behavior that is absent from the contract.

Every contract block must be disciplined Python-shaped code that uses only the API in `references/contract.pyi`:

```python
from skill_contract import *
```

Do not invent DSL functions. When the API has no specialized construct, express the behavior with `step(...)`, `when(...)`, `quality_bar(...)`, or plain action text inside an existing DSL function.

The DSL is not trying to become a complete programming language. Natural language remains the main carrier of workflow meaning. Use Python syntax and type signatures as discipline, especially around calls to scripts, tools, MCP, and other skills.

## Frontmatter Description

The frontmatter `description` is the trigger summary an agent sees before loading the body. It must be specific enough to decide whether to load the skill.

Write it as one or two sentences:

```yaml
description: Write or rewrite agent skills using the Python Skill Contract DSL. Use when the user wants a SKILL.md with a formal Python contract block, asks to encode a skill as DSL, or asks for the Skill Contract DSL spec/guide.
```

Rules:

- First sentence: state the reusable capability from `skill(..., purpose=...)`.
- Second sentence: start with `Use when` and name concrete user intents, artifacts, keywords, or workflow names from `activate_when(...)`.
- If the skill can easily over-trigger, include a boundary that matches `do_not_activate_when(...)`.
- Do not make the description broader than the contract. A broad description causes wrong activation before the contract is loaded.
- Avoid generic phrases such as "helps with", "improves workflow", or "handles documents" unless the concrete artifact and trigger are also named.

## Workflow

1. Read `references/contract.pyi` before drafting the DSL.
2. Identify the skill's activation boundary: when to use it and when not to use it.
3. Draft the frontmatter `description` from the same activation boundary.
4. Define the interface: required inputs, optional inputs, required outputs, and observable success criteria.
5. Choose the simplest behavior shape:
   - use `workflow([...])` for mostly linear work;
   - use `decision_rules([...])` for small branching rules;
   - use `workflow_graph(...)` only for DAGs, joins, or back edges;
   - use `loop(...)` only when iteration has explicit stop conditions;
   - use `state_machine(...)` only for durable human review or approval states.
6. Declare resources only when the skill actually needs scripts, references, or assets.
7. Mark concrete calls with `call_script(...)`, `call_tool(...)`, `call_mcp(...)`, `call_skill(...)`, or `call_human(...)` inside the step text that uses them.
8. Add failure, safety, validation, and quality rules when they affect agent behavior.
9. Write short Markdown guidance after the contract. Keep it explanatory, not normative.
10. Review the result against the checklist below.

## Required Shape

Place the contract near the top of `SKILL.md`, after frontmatter and before detailed guidance:

````markdown
## Skill Contract

The following Python contract is normative. If this contract conflicts with prose, the contract wins.

```python
from skill_contract import *

skill(
    name="example-skill",
    purpose="Describe the reusable capability this skill gives the agent.",
)

activate_when([
    "user asks for this exact kind of task",
])

do_not_activate_when([
    "neighboring task that should not use this skill",
])

inputs(
    required=[
        input("task", type=NaturalLanguage),
    ],
)

outputs(
    required=[
        output("result", type=Text),
    ],
)

workflow([
    step("classify", "Classify the user request and choose the path."),
    step("gather_inputs", "Collect required inputs or ask for missing ones."),
    step("execute", "Perform the skill-specific work."),
    step("validate", "Check the result against the quality bar."),
    step("respond", "Return the final result."),
])
```
````

## Embedded Calls

Use `call_*` markers when a natural-language workflow step invokes an external capability or needs a human decision. These markers do not execute code. They annotate the prose so the call is visible, reviewable, and hard to miss.

Use the narrowest marker:

- `call_script(target, how, ...)` for scripts bundled with the skill. `target` is relative to the skill directory.
- `call_tool(name, how, ...)` for shell commands, Codex tools, browser tools, image tools, or other non-MCP tools.
- `call_mcp(server, tool, how, ...)` for MCP calls. Always name both server and tool.
- `call_skill(name, how, mode=..., ...)` for using another skill. `mode` should be `compose`, `consult`, `delegate`, or `handoff` when that distinction matters.
- `call_human(request, how, ...)` for asking the user a question, requesting consent, or waiting for a human decision.

`how` is required because the marker is not a function call contract. It is the Agent-facing instruction for how to perform the call in context.

```python
workflow([
    step(
        "scan_references",
        f"""
        Inspect the target skill and build a reference map.
        If deterministic scanning is useful, run {call_script(
            "scripts/scan_refs.py",
            how="pass the skill root path and read JSON output describing referenced files",
            expect="a JSON reference graph",
            on_failure="continue manually and report that deterministic scanning was unavailable",
        )}.
        """,
    ),
])
```

## Core Examples

These examples cover the common cases. For less common syntax, read only the relevant file in `examples/`.

### Linear Skill

```python
skill(
    name="skill-reviewer",
    purpose="Review agent skills from an agent-usage perspective.",
    summary="Find trigger, workflow, ambiguity, and resource defects.",
)

metadata(
    short_description="Review SKILL.md files and referenced resources.",
    tags=["skills", "review", "agent-instructions"],
)

activate_when([
    "user asks to review, audit, critique, improve, or rewrite a skill",
    "user provides a SKILL.md file, skill directory, or slash-command instructions",
], strength="strong")

do_not_activate_when([
    "user asks to execute the target skill rather than review it",
])

inputs(
    required=[
        input("target_skill", type=File | Directory | Text),
    ],
)

outputs(
    required=[
        output("review_report", type=Text, format="severity_grouped_markdown"),
    ],
)

workflow([
    step("load_scope", "Read the target skill and referenced files.", writes=["scope"]),
    step("analyze", "Find activation, interface, workflow, and resource defects.", reads=["scope"], writes=["issues"]),
    step("report", "Return severity-ranked findings and concrete fixes.", reads=["issues"], produces=["review_report"]),
])

quality_bar(
    must=["Findings are evidence-backed and actionable."],
    must_not=["Do not rewrite the skill unless the user requested it."],
)
```

### Script Or Tool Assisted Skill

```python
resources(
    scripts=[
        script(
            "scripts/render_docx.py",
            purpose="Render a docx into page images for visual review.",
            interface="python scripts/render_docx.py <input.docx> --out <dir>",
            run_help_first=True,
        ),
    ],
)

workflow([
    step(
        "render_pages",
        f"""
        Render before judging layout quality.
        Use {call_script(
            "scripts/render_docx.py",
            how="pass the generated docx path and inspect the produced page images",
            expect="one image per page",
            on_failure="report that visual verification could not be completed",
        )}.
        """,
    ),
])
```

### Branching Or Approval Skill

```python
decision_rules([
    when("target skill has no contract block", then="draft a new contract", else_="review existing contract"),
    prefer("workflow", over="workflow_graph", reason="linear workflows are easier for agents to follow"),
])

modes(
    [
        mode("review", trigger="user asks for critique or audit", workflow="review_workflow"),
        mode("rewrite", trigger="user explicitly asks to patch the skill", workflow="rewrite_workflow"),
    ],
    default="review",
    selection="Do not switch from review to rewrite unless the user requested edits.",
)

workflow([
    step(
        "confirm_edit",
        f"""
        Before overwriting the skill, request explicit approval.
        Use {call_human(
            "approve_skill_rewrite",
            how="show the planned file changes and ask whether to proceed with editing them",
            expect="explicit approval or rejection",
            on_failure="stop without editing",
        )}.
        """,
    ),
])

safety_policy(
    must=["State when review is read-only."],
    must_not=["Do not edit files during review-only mode."],
    approval_required=["overwrite an existing skill"],
)
```

## Advanced Examples

Load these files only when the current skill needs that syntax:

- [examples/basic-contract.md](examples/basic-contract.md) - complete identity, activation, interface, output, and example syntax.
- [examples/resources-and-calls.md](examples/resources-and-calls.md) - resources, environment, tools, embedded calls, validation, and checks.
- [examples/decisions-modes-safety.md](examples/decisions-modes-safety.md) - decisions, preferences, modes, failures, fallback, and safety.
- [examples/graph-workflow.md](examples/graph-workflow.md) - DAGs, parallel branches, joins, retries, MCP calls, and termination.
- [examples/iteration-aggregation.md](examples/iteration-aggregation.md) - loops, map/reduce, failure policy, and aggregation.
- [examples/human-review-vocabulary.md](examples/human-review-vocabulary.md) - state machines, skill delegation, severity levels, review dimensions, and static checks.

## Writing Rules

- Keep `activate_when(...)` concrete. Use real user intents, artifact names, file types, tools, or workflow names.
- Make `do_not_activate_when(...)` strong enough to protect neighboring skills.
- Keep the frontmatter `description` aligned with `skill(...)`, `activate_when(...)`, and `do_not_activate_when(...)`.
- Use `input(...)` and `output(...)` for the agent-facing contract, not implementation internals.
- Use `call_*` markers at the exact point in the workflow where the script, tool, MCP, skill, or human decision is used.
- Do not use `call_*` as a resource declaration. `resources(...)` says what exists; `call_*` says when and how the workflow uses it.
- For every `call_*`, write enough `how`, `expect`, and `on_failure` context for another agent to perform or review the call.
- Give every `step(...)`, `node(...)`, and `state(...)` a stable snake_case id.
- Prefer observable verbs: read, classify, compare, validate, write, report, ask, stop.
- Do not describe obvious agent behavior unless it prevents a likely failure.
- Do not hide user approval inside prose. Mark the interaction with `call_human(...)` and back it with `safety_policy(...)`, `transition(...)`, or `stop_when(...)` when needed.

## Review Checklist

- The frontmatter `description` says what the skill does and when to use it before the body is loaded.
- The frontmatter `description` is no broader than `activate_when(...)` and does not contradict `do_not_activate_when(...)`.
- The contract imports `skill_contract` and uses only names from `references/contract.pyi`.
- `skill(...)`, `activate_when(...)`, `do_not_activate_when(...)`, `inputs(...)`, `outputs(...)`, and one behavior declaration exist.
- Required inputs are consumed by steps or nodes.
- Required outputs are produced by steps, nodes, or output rules.
- Every script, tool, MCP, skill, or human interaction is marked with the matching `call_*` function.
- Every `call_*` marker has a concrete `how`; risky or failure-prone calls also have `expect` and `on_failure`.
- Every branch reaches an output, a stop condition, or a user question.
- Every loop has `stop_when` or `max_iterations`.
- Every graph edge references an existing node.
- Every declared resource path exists or is clearly intended to be created with the skill.
- Markdown prose does not contradict or expand the contract.
