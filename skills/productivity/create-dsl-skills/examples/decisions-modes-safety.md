# Decisions, Modes, And Safety Example

Use this when the skill has explicit branch rules, top-level modes, fallback behavior, or approval boundaries.

```python
decision(
    "task_kind",
    "Is the user asking to create, rewrite, or review a skill contract?",
    branches={
        "create": "draft_new_contract",
        "rewrite": "rewrite_existing_contract",
        "review": "review_existing_contract",
    },
    default="review",
    ask_when_uncertain=True,
)

decision_rules([
    when("target skill has no contract block", then="draft a new contract", else_="review existing contract"),
    prefer("workflow", over="workflow_graph", reason="linear workflows are easier for agents to follow"),
    choose(from_=["workflow", "workflow_graph", "state_machine"], by="actual control-flow shape", default="workflow"),
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

failure_modes([
    when("required input missing", then="ask for exactly the missing input"),
    when("referenced file unavailable", then="continue with available context and state the limitation"),
])

fallback_strategy(
    [
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
    ],
    require_user_approval="when_destructive",
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
