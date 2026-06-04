# Resources And Calls Example

Use this when the skill declares bundled scripts, references, assets, environment assumptions, tool preferences, embedded call markers, validation, and checks.

```python
resources(
    scripts=[
        script(
            "scripts/render_docx.py",
            purpose="Render a docx into page images for visual review.",
            when="validating generated documents",
            interface="python scripts/render_docx.py <input.docx> --out <dir>",
            run_help_first=True,
            black_box=True,
            requires=["python3"],
            outputs=["page_images"],
        ),
    ],
    references=[
        reference(
            "references/layout-rubric.md",
            purpose="Detailed visual review rubric.",
            when="layout quality matters",
            read_strategy="on_demand",
            grep_patterns=["overflow", "page break", "table"],
        ),
    ],
    assets=[
        asset(
            "assets/report-template.docx",
            purpose="Base template for generated reports.",
            when="creating a new report document",
            copy_policy="copy_when_needed",
        ),
    ],
)

environment(
    variables=[
        env("DOC_RENDERER", default="python scripts/render_docx.py", purpose="Document render helper."),
        env("OPENAI_API_KEY", required=False, secret=True, purpose="Only needed for explicit API-backed fallback."),
    ],
    commands=["python3", "rg"],
    dependencies=["python-docx"],
    network="not_required",
    filesystem="workspace",
)

tools(
    required=["python3"],
    preferred=["rg"],
    forbidden=["destructive filesystem commands without user request"],
)

workflow([
    step(
        "render_pages",
        f"""
        Render the generated document before judging layout quality.
        Use {call_script(
            "scripts/render_docx.py",
            how="pass the generated docx path and an output directory, then inspect the produced page images",
            expect="one image per page",
            on_failure="report that visual verification could not be completed",
        )}.
        """,
        writes=["page_images"],
    ),
    step(
        "search_rubric",
        f"""
        If the relevant rubric section is unclear, use {call_tool(
            "rg",
            how="search references/layout-rubric.md for the layout topic being validated",
            expect="matching rubric lines",
            on_failure="read the reference file manually",
        )}.
        """,
    ),
])

validation(
    [
        check(
            "script_help",
            "Render script exposes a useful help interface.",
            command="python scripts/render_docx.py --help",
            expected="prints usage and exits successfully",
        ),
    ],
    on_failure="report",
)
```
