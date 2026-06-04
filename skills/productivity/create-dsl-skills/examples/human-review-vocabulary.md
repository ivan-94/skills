# Human Review And Review Vocabulary Example

Use this when humans must approve a draft, another skill is involved, or reports need defined review dimensions.

```python
modes(
    [
        mode(
            "draft",
            trigger="contract draft is not ready for approval",
            workflow=[
                step("prepare_draft", "Prepare the contract draft for review.", writes=["contract_draft"]),
            ],
        ),
        mode(
            "human_review",
            trigger="draft is ready and user approval is required",
            workflow=[
                step(
                    "request_review",
                    f"""
                    Present the draft and wait for review. Use {call_human(
                        "review_contract_draft",
                        how="ask the user to approve the draft or list requested changes",
                        expect="approval, requested changes, or a decision to stop",
                        on_failure="stop without finalizing",
                    )}.
                    """,
                    reads=["contract_draft"],
                ),
                step("revise_or_finalize", "Apply requested changes or write the final artifact after approval.", writes=["final_artifact"]),
            ],
        ),
    ],
    default="draft",
    selection="Do not enter human_review until the draft is ready and approval is required.",
)

workflow([
    step(
        "prepare_acceptance",
        f"""
        If the user wants hand acceptance artifacts, use {call_skill(
            "hat-prepare",
            how="delegate HAT artifact creation using the change summary and validation evidence",
            mode="delegate",
            expect="guide.md, prepare.sh, and acceptance checklist paths",
            on_failure="continue without HAT only if the user explicitly accepts the gap",
        )}.
        """,
    ),
])

review_dimensions([
    "activation quality",
    "input and output clarity",
    "workflow executability",
    "resource and call-marker clarity",
    "failure and approval paths",
])

validation(
    [
        check("frontmatter_not_too_broad", "frontmatter description is no broader than activate_when."),
        check("required_outputs_written", "all required outputs are written by workflow steps or nodes."),
        check("call_markers_have_how", "all call_* markers include how."),
        check("formal_human_gates_structured", "formal human approval points use structured gates and call_human only when the concrete question appears in prose."),
        check("graph_edges_valid", "all graph edges reference existing nodes."),
        check("loops_terminate", "all loops have termination conditions."),
    ],
    on_failure="report",
)
```
