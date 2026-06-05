# Linear Skill Example

Use this for a normal DSL-backed Skill with one mostly linear workflow, no bundled CLI, no graph workflow, and no special approval lifecycle.

```python
from skill_contract import *

skill(
    name="skill-audit",
    purpose="Review DSL-backed agent skills from an agent-usage perspective.",
    summary="Find trigger, interface, workflow, resource, and validation defects.",
    tags=["skills", "review", "agent-instructions"],
)

activate_when([
    "user asks to review, audit, or critique a DSL-backed Skill",
    "user provides a DSL contract block, contract.pyi, or DSL-backed SKILL.md",
])

do_not_activate_when([
    "user asks to execute the target skill rather than review it",
    "user asks to review a non-DSL Skill with the generic skill-reviewer workflow",
])

inputs(
    required=[
        input("target_skill", type=File | Directory | Text, description="The DSL-backed Skill, contract block, or skill directory to review."),
    ],
)

outputs(
    required=[
        output("review_report", type=Text, format="severity_grouped_markdown"),
    ],
)

workflow([
    step("load_scope", "Read the target skill and its declared references.", reads=["target_skill"], writes=["review_scope"]),
    step("analyze_activation", "Check frontmatter, activate_when, and do_not_activate_when alignment.", reads=["review_scope"], writes=["findings"]),
    step("analyze_interface", "Check required inputs, outputs, resources, and workflow traceability.", reads=["review_scope"], writes=["findings"]),
    step("report", "Return severity-ranked findings with evidence and concrete fixes.", reads=["findings"], writes=["review_report"]),
])

quality_bar(
    must=[
        "Findings are evidence-backed and actionable.",
        "The linear workflow is enough; do not introduce modes or workflow_graph without a real branch.",
    ],
    must_not=[
        "Do not rewrite the skill unless the user requested edits.",
    ],
)
```
