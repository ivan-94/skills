# Decisions, Modes, And Safety Example

Use this when the skill has explicit branch rules, top-level modes, fallback behavior, or approval boundaries.

```python
decision_rules([
    when("user asks to create a new skill", then="draft_new_contract"),
    when("user asks to rewrite an existing skill", then="rewrite_existing_contract"),
    when("user asks to critique or audit", then="review_existing_contract"),
    when("target skill has no contract block", then="draft a new contract", else_="review existing contract"),
    when("linear workflow is enough", then="use workflow instead of workflow_graph"),
    when("task kind is ambiguous", then="ask the user whether to create, rewrite, or review"),
    when("required input missing", then="ask for exactly the missing input"),
    when("referenced file unavailable", then="continue with available context and state the limitation"),
    when("preferred deterministic script is unavailable", then="perform the equivalent manual inspection"),
    when(
        "fallback needs user approval",
        then=f"""
        Ask before continuing. Use {call_human(
            "approve_fallback",
            how="explain the fallback path, why it is needed, and whether it changes risk or scope",
            expect="explicit approval, rejection, or a requested alternative",
            on_failure="stop the fallback path",
        )}.
        """,
    ),
])

modes(
    [
        mode(
            "review",
            trigger="user asks for critique or audit",
            workflow=[
                step("inspect", "Read the target skill and references."),
                step("report", "Return findings without editing files."),
            ],
            description="Read-only review mode.",
        ),
        mode(
            "rewrite",
            trigger="user explicitly asks to rewrite or patch the skill",
            workflow=[
                step("inspect", "Read the target skill and references."),
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
                    ask_user="Confirm whether to overwrite the target skill after reviewing the planned changes.",
                ),
                step("patch", "Rewrite the contract and prose after approval."),
            ],
            prerequisites=["write access to the target file"],
            forbidden=["silent scope expansion"],
        ),
    ],
    default="review",
    selection="Do not switch from review to rewrite unless the user requested edits.",
)

safety_policy(
    must=["State when review is read-only."],
    must_not=["Do not edit files during review-only mode."],
    approval_required=["overwrite an existing skill", "delete a generated artifact"],
)

validation(
    [
        check("planned_changes_clear", "The planned file changes are specific enough for the user to approve or reject."),
    ],
    on_failure="ask_user",
)
```
