# Human Review And Review Vocabulary Example

Use this when humans must approve a draft, another skill is involved, or reports need defined review vocabulary.

```python
state_machine(
    name="contract_review_loop",
    initial="drafted",
    states=[
        state("drafted", description="A contract draft exists.", entry_action="present the draft"),
        state(
            "waiting_for_user_review",
            entry_action=f"""
            Present the draft and wait for review. Use {call_human(
                "review_contract_draft",
                how="ask the user to approve the draft or list requested changes",
                expect="approval, requested changes, or a decision to stop",
                on_failure="keep the state machine in waiting_for_user_review",
            )}.
            """,
            exit_condition="user approves or requests changes",
        ),
        state("revision_requested"),
        state("approved"),
        state("finalized"),
    ],
    transitions=[
        transition("drafted", "waiting_for_user_review", after="present_draft"),
        transition("waiting_for_user_review", "revision_requested", when="user requests changes"),
        transition("revision_requested", "drafted", after="apply_requested_changes"),
        transition("waiting_for_user_review", "approved", when="user approves", guard="no unresolved critical issue"),
        transition("approved", "finalized", after="write_final_artifact"),
    ],
    stop_states=["finalized"],
    invariants=["Do not finalize while user-requested changes remain unresolved."],
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

severity_levels([
    level("critical", "Causes wrong activation, skipped required work, or invalid output."),
    level("major", "Forces the agent to guess or resolve ambiguity."),
    level("minor", "Reduces clarity but likely does not break execution."),
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
        check("required_outputs_produced", "all required outputs are produced."),
        check("call_markers_have_how", "all call_* markers include how."),
        check("formal_human_gates_structured", "formal human approval points use structured gates and call_human only when the concrete question appears in prose."),
        check("graph_edges_valid", "all graph edges reference existing nodes."),
        check("loops_terminate", "all loops have termination conditions."),
    ],
    on_failure="report",
)
```
