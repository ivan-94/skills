# Human Review And Review Vocabulary Example

Use this when humans must approve a draft, another skill is involved, or reports need defined review vocabulary.

```python
state_machine(
    name="contract_review_loop",
    initial="drafted",
    states=[
        state("drafted", description="A contract draft exists.", entry_action="present the draft"),
        state("waiting_for_user_review", exit_condition="user approves or requests changes"),
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

static_checks([
    "frontmatter description is no broader than activate_when",
    "all required outputs are produced",
    "all call_* markers include how",
    "all human approval points use call_human",
    "all graph edges reference existing nodes",
    "all loops have termination conditions",
])
```
