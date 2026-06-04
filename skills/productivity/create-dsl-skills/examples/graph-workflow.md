# Graph Workflow Example

Use this for non-linear flows, parallel branches, joins, retries, MCP-backed context, and explicit termination.

```python
workflow_graph(
    name="figma_to_skill_contract",
    entry="read_design",
    state={
        "design_context": "Figma node context",
        "component_notes": "implementation-relevant observations",
        "contract_draft": "draft skill contract",
    },
    nodes=[
        node(
            "read_design",
            action=f"""
            Read the selected Figma node.
            Use {call_mcp(
                "figma",
                "get_design_context",
                how="request the selected node context and summarize components, layout, tokens, and assets",
                expect="grounded Figma design context",
                on_failure="ask the user to reconnect Figma or provide a screenshot",
            )}.
            """,
            writes=["design_context"],
            retry=retry(
                max_attempts=2,
                when=["mcp_connection_missing", "transient_tool_error"],
                before_retry="check that the Figma selection is still available",
                after_exhausted="stop and ask the user for a usable design source",
            ),
        ),
        node("extract_components", action="Identify reusable components.", reads=["design_context"], writes=["component_notes"]),
        node("draft_contract", action="Draft the implementation skill contract.", reads=["component_notes"], writes=["contract_draft"]),
        node("finalize", action="Return the contract draft and limitations.", reads=["contract_draft"], produces=["result"]),
    ],
    edges=[
        edge("read_design", ["extract_components", "draft_contract"], parallel=True),
        edge(["extract_components", "draft_contract"], "finalize", join="available_only"),
    ],
    exits=["finalize"],
    termination=[
        stop_when("result produced"),
        stop_when("usable design source unavailable", reason="cannot ground the contract"),
    ],
    invariants=["Do not invent design details absent from the source."],
)
```
