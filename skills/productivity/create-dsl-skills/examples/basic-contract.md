# Basic Contract Example

Use this when the skill needs identity, frontmatter alignment, activation, interface, output shape, examples, and a linear workflow.

The frontmatter `description` should be derived from the same capability and trigger boundary expressed below:

```yaml
description: Review agent skills from an agent-usage perspective. Use when the user asks to review, audit, critique, improve, or rewrite a SKILL.md file, skill directory, slash command, or agent instruction.
```

```python
skill(
    name="skill-reviewer",
    purpose="Review agent skills from an agent-usage perspective.",
    summary="Find trigger, workflow, ambiguity, and resource defects.",
    version="0.1.0",
    owner="agent-workflows",
)

metadata(
    short_description="Review SKILL.md files and referenced resources.",
    tags=["skills", "review", "agent-instructions"],
    compatibility=["codex", "claude", "generic-agent"],
    experimental=False,
    custom={"audience": "agents"},
)

activate_when(
    [
        "user asks to review, audit, critique, improve, or rewrite a skill",
        "user provides a SKILL.md file, skill directory, or slash-command instructions",
    ],
    match="any",
    strength="strong",
)

do_not_activate_when([
    "user asks to execute the target skill rather than review it",
    "user asks for generic Markdown proofreading without agent behavior concerns",
])

activation_keywords(
    include=["SKILL.md", "skill review", "agent instruction", "slash command"],
    exclude=["execute this skill", "proofread article"],
)

activation_examples(
    positive=["Review this SKILL.md", "Where is this skill ambiguous?"],
    negative=["Use this PDF skill to extract tables", "Proofread this blog post"],
)

inputs(
    required=[
        input(
            "target_skill",
            type=File | Directory | Text,
            description="A SKILL.md path, skill directory, or pasted skill text.",
            examples=["skills/engineering/skill-reviewer", "pasted markdown"],
        ),
    ],
    optional=[
        input("review_focus", type=Text, default="full contract review"),
    ],
    ask_when_missing=True,
)

outputs(
    required=[
        output(
            "review_report",
            type=Text,
            format="severity_grouped_markdown",
            success_criteria=[
                "each issue includes evidence",
                "each issue explains agent impact",
                "each issue includes a concrete fix",
            ],
        ),
    ],
    optional=[
        output("rewritten_skill", type=Text),
    ],
)

workflow([
    step("load_scope", "Read the target skill and referenced files.", writes=["scope"]),
    step("analyze", "Find activation, interface, workflow, and resource defects.", reads=["scope"], writes=["issues"]),
    step("report", "Return severity-ranked findings and concrete fixes.", reads=["issues"], produces=["review_report"]),
])

quality_bar(
    must=["Findings are evidence-backed and actionable."],
    should=["Report wording is concise."],
    must_not=["Do not rewrite the skill unless the user requested it."],
)

output_format(
    name="skill_review_report",
    required_sections=["Overall judgment", "Findings", "Suggested fixes"],
)

examples([
    example(
        user="Review this SKILL.md",
        expected_behavior="Activate skill review and return severity-ranked findings.",
        input_files=["SKILL.md"],
        output="review_report",
    ),
])
```
