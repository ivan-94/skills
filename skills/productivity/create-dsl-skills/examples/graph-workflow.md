# Graph Workflow Example

Use this for non-linear flows, parallel branches, joins, retries, MCP-backed context, and explicit termination.

```python
workflow_graph(
    name="figma_to_skill_contract",
    entry="read_design",
    state={
        "design_context": "Figma node context",
        "component_notes": "implementation-relevant observations",
        "token_notes": "design token observations",
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
                on_failure="continue to request_design_source",
            )}.
            """,
            writes=["design_context"],
            retry=retry(
                max_attempts=2,
                when=["mcp_connection_missing", "transient_tool_error"],
                before_retry="check that the Figma selection is still available",
                after_exhausted="continue to request_design_source",
            ),
        ),
        node(
            "request_design_source",
            action=f"""
            Ask for a usable design source before continuing.
            Use {call_human(
                "provide_design_source",
                how="ask the user to reconnect Figma, provide a screenshot, or provide equivalent design notes",
                expect="one usable design source or an explicit decision to stop",
                on_failure="stop without inventing design details",
            )}.
            """,
            human_input="a Figma connection, screenshot, or equivalent design notes",
            writes=["design_context"],
        ),
        node("extract_components", action="Identify reusable components.", reads=["design_context"], writes=["component_notes"]),
        node("extract_tokens", action="Identify relevant design tokens and asset constraints.", reads=["design_context"], writes=["token_notes"]),
        node("draft_contract", action="Draft the implementation skill contract.", reads=["component_notes", "token_notes"], writes=["contract_draft"]),
        node("finalize", action="Return the contract draft and limitations.", reads=["contract_draft"], produces=["result"]),
    ],
    edges=[
        edge("read_design", "request_design_source", when="Figma context unavailable"),
        edge("read_design", ["extract_components", "extract_tokens"], when="design_context available", parallel=True),
        edge("request_design_source", ["extract_components", "extract_tokens"], when="user provides a usable design source", parallel=True),
        edge(["extract_components", "extract_tokens"], "draft_contract", join="available_only"),
        edge("draft_contract", "finalize"),
    ],
    exits=["finalize"],
    termination=[
        stop_when("result produced"),
        stop_when("usable design source unavailable", reason="cannot ground the contract"),
    ],
    invariants=["Do not invent design details absent from the source."],
)
```
