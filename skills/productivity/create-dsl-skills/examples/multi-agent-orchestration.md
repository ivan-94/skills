# Multi-Agent Orchestration Example

Use this when a skill has stable agent roles, different permissions, bounded context, and an explicit parent arbitration step.

`agents(...)` declares role contracts. `step(actor=...)` assigns workflow ownership. `call_subagent(...)` still marks the actual delegation point when a separate agent should run.

```python
agents([
    agent(
        "organizer",
        purpose="Define scope, arbitrate reviewer findings, and decide what may be changed.",
        responsibilities=[
            "separate actionable issues from preference or product decisions",
            "approve only the findings that should enter implementation",
        ],
        context=None,
        effort="medium",
        permissions=agent_permissions(filesystem="read_only", can_edit=False),
        outputs=["approved_findings"],
        forbidden=["mechanically executing every reviewer suggestion"],
    ),
    agent(
        "reviewer",
        purpose="Run a read-only independent review and return evidence-backed findings.",
        responsibilities=[
            "inspect only the supplied evidence and relevant files",
            "report findings without editing files",
        ],
        context="screenshots plus relevant source files only",
        effort="medium",
        permissions=agent_permissions(filesystem="read_only", tools=["rg"], can_edit=False),
        outputs=["review_findings"],
        forbidden=["editing files", "making final product decisions"],
    ),
    agent(
        "implementer",
        purpose="Apply only organizer-approved changes.",
        responsibilities=[
            "reuse existing project patterns",
            "report verification evidence after the change",
        ],
        context="approved findings plus relevant code paths",
        effort="medium",
        permissions=agent_permissions(filesystem="workspace_write", tools=["rg", "git", "pnpm"], can_edit=True),
        outputs=["implementation_changes", "verification_evidence"],
        forbidden=["unapproved refactors", "committing or pushing without explicit user request"],
    ),
])

workflow([
    step(
        "capture_evidence",
        "Collect the evidence that the reviewer needs.",
        actor="organizer",
        writes=["review_evidence"],
    ),
    step(
        "independent_review",
        f"""
        Ask the reviewer to inspect only the bounded evidence.
        Use {call_subagent(
            "reviewer",
            "review the supplied evidence and return actionable findings",
            how="spawn a read-only reviewer with review_evidence and relevant source files only; require findings, not edits",
            context="review_evidence plus relevant source files only",
            effort="medium",
            expect="findings with evidence and severity",
            on_failure="continue with organizer review and state that independent review was unavailable",
        )}.
        """,
        actor="reviewer",
        reads=["review_evidence"],
        writes=["review_findings"],
    ),
    step(
        "arbitrate_findings",
        "Approve only findings that are actionable within the requested scope.",
        actor="organizer",
        reads=["review_findings"],
        writes=["approved_findings"],
    ),
    step(
        "apply_changes",
        "Apply only organizer-approved changes and record verification.",
        actor="implementer",
        reads=["approved_findings"],
        writes=["implementation_changes", "verification_evidence"],
    ),
])
```
