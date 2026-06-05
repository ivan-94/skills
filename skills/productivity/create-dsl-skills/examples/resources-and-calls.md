# Resources And Calls Example

Use this when the skill declares bundled scripts, references, assets, environment assumptions, embedded call markers, subagent delegation, and mechanical verification steps.

`call_script(target, ...)` uses a skill-relative `target` such as `scripts/render_docx.py`. If the real command must run from the host project root, describe that command in `how`; do not put host-root paths in `target`.

```python
resources(
    scripts=[
        script(
            "scripts/render_docx.py",
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
            when="layout quality matters",
            read_strategy="on_demand",
        ),
    ],
    assets=[
        asset(
            "assets/report-template.docx",
            when="creating a new report document",
        ),
    ],
)

environment(
    variables=[
        env("DOC_RENDERER", when="rendering document pages", default="python scripts/render_docx.py"),
        env("OPENAI_API_KEY", when="explicit API-backed fallback is requested", required=False, secret=True),
    ],
    commands=["python3", "rg"],
    dependencies=["python-docx"],
    network="not_required",
    filesystem="workspace",
)

workflow([
    step(
        "inspect_renderer",
        f"""
        Inspect the renderer interface before relying on it.
        Use {call_script(
            "scripts/render_docx.py",
            how="from the skill directory, run python scripts/render_docx.py --help and confirm it accepts an input docx and --out directory",
            expect="usage text exits successfully",
            on_failure="report that the renderer interface could not be verified",
        )}.
        """,
    ),
    step(
        "render_pages",
        f"""
        Render the generated document before judging layout quality.
        Use {call_script(
            "scripts/render_docx.py",
            how="from the host project root, run python3 skills/documents/scripts/render_docx.py with the generated docx path and an output directory, then inspect the produced page images",
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
    step(
        "independent_review",
        f"""
        If a second opinion would reduce review risk, use {call_subagent(
            "layout-reviewer",
            "review the rendered page images against the layout rubric",
            how="spawn a read-only reviewer with the rendered page images and references/layout-rubric.md; ask for findings only, not edits",
            context="page_images plus references/layout-rubric.md only",
            effort="medium",
            expect="layout findings with evidence and severity",
            on_failure="continue with parent review and state that subagent review was unavailable",
        )}.
        """,
        reads=["page_images"],
    ),
])

quality_bar(
    must=[
        "Script help or an equivalent interface check is performed before relying on the renderer.",
        "Mechanical verification evidence is reported separately from the visual quality judgment.",
    ],
    must_not=[
        "Do not run destructive filesystem commands unless the user explicitly requested them.",
    ],
)
```
