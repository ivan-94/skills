# Iteration And Aggregation Example

Use this when the skill runs repeated checks, maps over cases, and reduces results into a summary.

```python
loop(
    name="repair_until_contract_passes",
    body=[
        step("run_static_review", "Check the contract against required static rules.", writes=["issues"]),
        step("patch_contract", "Patch only issues found in the previous review.", reads=["issues"], writes=["draft"]),
        step("recheck", "Re-run the same checks after patching.", reads=["draft"]),
    ],
    continue_when=["critical_or_major_issues_exist"],
    stop_when=["no_critical_or_major_issues", "user_says_stop"],
    max_iterations=3,
    invariant=["Every patch must be justified by an observed issue."],
    writes=["draft"],
)

map_each(
    name="run_eval_cases",
    over="eval_prompts",
    item="prompt",
    do=[
        step("run_case", "Evaluate one prompt against the skill contract."),
        step("record_result", "Record activation, output shape, and failure notes."),
    ],
    collect_as="case_results",
    failure_policy="continue_and_record",
    parallel=True,
)

reduce(
    name="summarize_cases",
    over="case_results",
    into="evaluation_summary",
    do="Compute pass rate, recurring failure patterns, and recommended contract changes.",
)
```
