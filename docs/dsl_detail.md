# Skill Contract DSL v0.1 Reference

Skill Contract DSL 是一种嵌入在 `SKILL.md` 中的 Python-like 行为契约语言。

它不是可执行 Python。
它是给 Agent 和 Reviewer 阅读的结构化接口说明，直接嵌入 `SKILL.md`，无需编译步骤。

推荐放置方式：

````markdown
## Skill Contract

The following Python-like contract is normative, not executable.
If this contract conflicts with later prose, this contract wins.

```skill-dsl
...
````

````

如果只能使用普通代码块，推荐：

```markdown
```py
# Skill Contract DSL: normative, not executable
...
````

````

---

# 1. 总体结构

一个完整 Skill Contract 通常包含：

```py
skill(...)

activate_when([...])
do_not_activate_when([...])

inputs(...)
outputs(...)

resources(...)
environment(...)

workflow(...)
# 或
workflow_graph(...)
# 或
state_machine(...)

decision_rules(...)
failure_modes(...)
fallback_strategy(...)

quality_bar(...)
examples(...)
tests(...)
````

最小可用版本：

```py
skill(
    name="skill-reviewer",
    purpose="Review skill files from an agent-usage perspective.",
)

activate_when([
    "user asks to review, audit, critique, improve, or rewrite a skill",
    "user provides SKILL.md content or a skill directory",
])

do_not_activate_when([
    "user asks to execute the target skill rather than review it",
])

inputs(
    required=["target_skill"],
    optional=["referenced_files", "scripts", "review_focus"],
)

outputs(
    required=["review_report"],
    optional=["rewritten_skill", "patch", "test_cases"],
)

workflow([
    step("load_scope", "Read SKILL.md and referenced files."),
    step("analyze", "Find activation, workflow, ambiguity, and resource defects."),
    step("report", "Return issues grouped by severity with concrete fixes."),
])
```

---

# 2. 设计原则

## 2.1 Contract 优先

DSL 是规范来源。后文 Markdown 只能解释 DSL，不能引入冲突规则。

```py
contract_policy(
    priority="contract_wins",
    prose_role="explanation_only",
)
```

## 2.2 面向 Agent 行为，而不是实现细节

写：

```py
step("validate_output", "Open the generated file and confirm it is usable.")
```

不要写：

```py
step("call_internal_function_x", "Invoke helper.parse_output_buffer().")
```

除非这个函数是 Agent 可调用的脚本或 CLI。

## 2.3 渐进式复杂度

简单 Skill 使用 `workflow()`。
复杂 Skill 使用 `workflow_graph()`。
有循环、审批、迭代时使用 `loop()` 或 `state_machine()`。

---

# 3. 基础类型

DSL 中的类型是说明性类型，不是 Python runtime 类型。

```py
Text
Path
File
Directory
URL
Command
Tool
Script
Reference
Asset
Boolean
Integer
Float
List[T]
Map[K, V]
Enum[...]
NaturalLanguage
```

示例：

```py
inputs(
    required=[
        input("target_skill", type=Directory | File | Text),
        input("task", type=NaturalLanguage),
    ],
)
```

---

# 4. 顶层 API

## 4.1 skill()

定义技能身份、用途和边界。

```py
skill(
    name: str,
    purpose: str,
    summary: str = None,
    version: str = None,
    owner: str = None,
    short_description: str = None,
    tags: list[str] = None,
    compatibility: list[str] = None,
    license: str = None,
    experimental: bool = False,
    custom: dict = None,
)
```

示例：

```py
skill(
    name="cli-creator",
    purpose="Create durable composable CLIs for future agent use.",
    summary="Builds installable command-line tools with stable JSON output.",
    version="0.1.0",
    tags=["cli", "agent-tooling"],
    compatibility=["codex", "generic-agent"],
)
```

字段含义：

```py
name
# 技能名。应与目录名一致。小写、数字、短横线。

purpose
# 技能要帮助 Agent 完成什么任务。

summary
# 给人看的短说明。可用于 UI 或技能列表。

version
# DSL 或技能版本。可选。

owner
# 团队、个人或组织。可选。

short_description / tags / compatibility / license / experimental / custom
# 非行为性元信息。可选；用于目录、安装器或人类浏览，不应承载 workflow 规则。
```

---

## 4.2 contract_policy()

定义 DSL 与正文之间的优先级。

```py
contract_policy(
    priority: str = "contract_wins",
    prose_role: str = "explanation_only",
    executable: bool = False,
)
```

推荐：

```py
contract_policy(
    priority="contract_wins",
    prose_role="explanation_only",
    executable=False,
)
```

---

# 5. 触发 API

## 5.1 activate_when()

定义使用技能的正向触发条件。

```py
activate_when(
    conditions: list[str],
    match: str = "any",
    strength: str = "normal",
)
```

示例：

```py
activate_when([
    "user asks to review a SKILL.md file",
    "user asks to audit an agent instruction file",
    "user asks to improve a slash command or skill",
], match="any", strength="strong")
```

`strength` 可选值：

```py
"weak"
"normal"
"strong"
"always_when_matched"
```

---

## 5.2 do_not_activate_when()

定义明确不使用技能的条件。

```py
do_not_activate_when(
    conditions: list[str],
    priority: str = "higher_than_activate_when",
)
```

示例：

```py
do_not_activate_when([
    "user asks to execute the target skill",
    "user asks for general Markdown proofreading",
    "user asks for generic prompt advice without a concrete skill file",
])
```

---

# 6. 输入输出 API

## 6.1 inputs()

定义技能需要的输入。

```py
inputs(
    required: list[str | input],
    optional: list[str | input] = None,
    ask_when_missing: bool = True,
)
```

示例：

```py
inputs(
    required=[
        input("target_skill", type=File | Directory | Text, description="SKILL.md or skill directory"),
    ],
    optional=[
        input("review_focus", type=Text),
        input("referenced_files", type=List[File]),
        input("scripts", type=List[File]),
    ],
)
```

---

## 6.2 input()

定义单个输入。

```py
input(
    name: str,
    type: Type = Text,
    description: str = None,
    default = None,
    examples: list = None,
    required: bool = True,
    required_when: str = None,
)
```

示例：

```py
input(
    "target_skill",
    type=Directory | File | Text,
    description="The skill directory, SKILL.md path, or pasted SKILL.md content.",
    examples=["./skills/pdf", "./SKILL.md", "pasted markdown"],
)
```

条件必填输入使用 `required=False` 配合 `required_when`。`required_when` 只描述触发条件，不替代 `ask_when_missing`、`ask_user`、`call_human` 或审批闸门。

```py
input(
    "result_path",
    type=Path,
    description="父 Agent 派发子 Agent 时，子 Agent 写入结果的路径。",
    required=False,
    required_when="当前 Skill 以父 Agent 身份派发子 Agent，并要求下游 Agent 产出可读取的交付物",
)
```

---

## 6.3 outputs()

定义技能产出。

```py
outputs(
    required: list[str | output],
    optional: list[str | output] = None,
)
```

示例：

```py
outputs(
    required=[
        output("review_report", type=Text),
    ],
    optional=[
        output("rewritten_skill", type=Text),
        output("patch", type=Text),
        output("test_cases", type=List[Text]),
    ],
)
```

---

## 6.4 output()

定义单个输出。

```py
output(
    name: str,
    type: Type = Text,
    description: str = None,
    format: str = None,
    template: str = None,
    required_sections: list[str] = None,
    success_criteria: list[str] = None,
)
```

示例：

```py
output(
    "review_report",
    type=Text,
    format="severity_grouped_markdown",
    required_sections=["Overall judgment", "Findings", "Suggested fixes"],
    success_criteria=[
        "each issue includes evidence",
        "each issue explains agent impact",
        "each issue includes a concrete fix",
    ],
)
```

---

# 7. 资源 API

## 7.1 resources()

声明技能目录中的资源。

```py
resources(
    scripts: list[script] = None,
    references: list[reference] = None,
    assets: list[asset] = None,
)
```

示例：

```py
resources(
    scripts=[
        script("scripts/fetch_comments.py", when="need to fetch GitHub PR comments"),
    ],
    references=[
        reference("references/review-rubric.md", when="performing deep skill review"),
    ],
    assets=[
        asset("assets/template.docx", when="creating a document from company template"),
    ],
)
```

---

## 7.2 script()

声明可执行脚本。

```py
script(
    path: str,
    purpose: str = None,
    when: str = None,
    interface: str = None,
    run_help_first: bool = False,
    black_box: bool = True,
    requires: list[str] = None,
    outputs: list[str] = None,
)
```

示例：

```py
script(
    "scripts/new_notebook.py",
    purpose="Create a clean starting notebook from a template.",
    when="creating a new notebook",
    interface="python scripts/new_notebook.py --kind <experiment|tutorial> --title <title> --out <path>",
    run_help_first=True,
    black_box=True,
)
```

---

## 7.3 reference()

声明按需读取的参考文件。

```py
reference(
    path: str,
    purpose: str = None,
    when: str = None,
    read_strategy: str = "on_demand",
    grep_patterns: list[str] = None,
)
```

示例：

```py
reference(
    "references/experiment-patterns.md",
    purpose="Notebook experiment structure and heuristics.",
    when="notebook kind is experiment",
    read_strategy="on_demand",
)
```

---

## 7.4 asset()

声明输出中使用的静态资源。

```py
asset(
    path: str,
    purpose: str = None,
    when: str = None,
    copy_policy: str = "copy_when_needed",
)
```

示例：

```py
asset(
    "assets/tutorial-template.ipynb",
    purpose="Template for teaching-oriented notebooks.",
    when="notebook kind is tutorial",
)
```

---

# 8. 环境和工具 API

## 8.1 environment()

声明环境变量、路径、依赖和安装假设。

```py
environment(
    variables: list[env] = None,
    commands: list[str] = None,
    dependencies: list[str] = None,
    network: str = "unknown",
    filesystem: str = "workspace",
)
```

示例：

```py
environment(
    variables=[
        env("CODEX_HOME", default="$HOME/.codex"),
        env("JUPYTER_NOTEBOOK_CLI", default="$CODEX_HOME/skills/jupyter-notebook/scripts/new_notebook.py"),
    ],
    commands=["python3", "uv"],
    dependencies=["jupyterlab", "ipykernel"],
    network="not_required",
)
```

---

## 8.2 env()

声明单个环境变量。

```py
env(
    name: str,
    default: str = None,
    required: bool = False,
    secret: bool = False,
    purpose: str = None,
)
```

示例：

```py
env(
    "OPENAI_API_KEY",
    required=True,
    secret=True,
    purpose="Only required for explicit CLI fallback image generation.",
)
```

---

## 8.3 调用标记

`call_*` 只用于自然语言字符串中的具体调用点，不是资源声明，也不执行调用。

```py
call_script(target: str, how: str, expect: str = None, on_failure: str = None)

call_tool(name: str, how: str, expect: str = None, on_failure: str = None)

call_mcp(server: str, tool: str, how: str, expect: str = None, on_failure: str = None)

call_skill(name: str, how: str, mode: str = None, expect: str = None, on_failure: str = None)

call_subagent(
    role: str,
    task: str,
    how: str,
    context: "fork" | str = "fork",
    effort: "low" | "medium" | "high" = None,
    result_path: str = None,
    expect: str = None,
    on_failure: str = None,
)

call_human(request: str, how: str, expect: str = None, on_failure: str = None)
```

`call_subagent(..., context="fork")` 表示子 Agent 完全继承当前上下文；`context` 为普通字符串时表示隔离上下文，只传该字符串描述的材料。文件系统隔离、worktree、只读等执行边界写在 `how` 中。

---

# 9. 简单工作流 API

## 9.1 workflow()

定义线性或近似线性的步骤。

```py
workflow(
    steps: list[step],
    name: str = None,
)
```

示例：

```py
workflow([
    step("classify_task", "Determine the requested operation."),
    step("gather_inputs", "Collect required files and parameters."),
    step("execute", "Run the selected tool or script."),
    step("validate", "Check the result against the quality bar."),
    step("respond", "Return output and explain what was done."),
])
```

---

## 9.2 step()

定义单个步骤。

```py
step(
    id: str,
    action: str,
    purpose: str = None,
    reads: list[str] = None,
    writes: list[str] = None,
    requires: list[str] = None,
    produces: list[str] = None,
    when: str = None,
    ask_user: str = None,
)
```

示例：

```py
step(
    "validate",
    action="Open the generated file and confirm it is usable.",
    reads=["output_file"],
    writes=["validation_result"],
    requires=["output_file.exists"],
    produces=["pass_or_fail"],
)
```

---

# 10. 决策 API

## 10.1 decision()

定义一个决策点。

```py
decision(
    id: str,
    question: str,
    branches: dict,
    default: str = None,
    ask_when_uncertain: bool = False,
)
```

示例：

```py
decision(
    id="notebook_kind",
    question="Is the notebook exploratory or instructional?",
    branches={
        "experiment": "use_experiment_workflow",
        "tutorial": "use_tutorial_workflow",
        "existing_notebook": "use_refactor_workflow",
    },
    default="experiment",
    ask_when_uncertain=True,
)
```

---

## 10.2 decision_rules()

定义扁平化条件规则。

```py
decision_rules(
    rules: list[when | prefer | choose],
)
```

示例：

```py
decision_rules([
    when("user provides a local image and asks to change it", then="treat as edit"),
    when("user provides an image only as style reference", then="treat as generate"),
    prefer("built_in_tool", over="cli_fallback"),
])
```

---

## 10.3 when()

定义条件行为。

```py
when(
    condition: str,
    then: str,
    else_: str = None,
)
```

示例：

```py
when(
    "required input is missing",
    then="ask the user for exactly the missing input",
    else_="continue workflow",
)
```

---

## 10.4 prefer()

定义默认偏好。

```py
prefer(
    option: str,
    over: str,
    reason: str = None,
)
```

示例：

```py
prefer(
    "templates",
    over="hand-writing raw JSON",
    reason="reduces invalid notebook structure",
)
```

---

## 10.5 choose()

定义多选规则。

```py
choose(
    from_: list[str],
    by: str,
    default: str = None,
)
```

示例：

```py
choose(
    from_=["rust", "typescript", "python"],
    by="installed toolchain and source material",
    default="rust",
)
```

---

# 11. Graph 工作流 API

当流程像 DAG、带并行分支、join 或回边时，使用 `workflow_graph()`。

## 11.1 workflow_graph()

```py
workflow_graph(
    name: str,
    state: dict = None,
    nodes: list[node] = None,
    edges: list[edge] = None,
    entry: str = None,
    exits: list[str] = None,
    termination: list[stop_when] = None,
    invariants: list[str] = None,
)
```

示例：

```py
workflow_graph(
    name="review_skill",

    state={
        "target": "SKILL.md or skill directory",
        "references": "referenced files",
        "scripts": "script interfaces",
        "issues": "review issues",
        "review_report": "final report",
    },

    entry="load_scope",

    nodes=[
        node("load_scope", action="Read SKILL.md and referenced files.", writes=["references", "scripts"]),
        node("check_activation", action="Check trigger and non-trigger clarity.", writes=["issues"]),
        node("check_workflow", action="Check whether the execution path is complete.", writes=["issues"]),
        node("check_resources", action="Check references and scripts.", writes=["issues"]),
        node("synthesize_review", action="Merge issues into severity-ranked report.", reads=["issues"], writes=["review_report"]),
    ],

    edges=[
        edge("load_scope", ["check_activation", "check_workflow", "check_resources"], parallel=True),
        edge(["check_activation", "check_workflow", "check_resources"], "synthesize_review", join="all"),
    ],

    termination=[
        stop_when("review_report produced"),
    ],
)
```

---

## 11.2 node()

定义图中的节点。

```py
node(
    id: str,
    action: str,
    purpose: str = None,
    reads: list[str] = None,
    writes: list[str] = None,
    requires: list[str] = None,
    produces: list[str] = None,
    tool: str = None,
    script: str = None,
    human_input: str = None,
    retry: retry = None,
)
```

示例：

```py
node(
    id="run_tests",
    purpose="Run the test suite and capture failures.",
    action="Execute the configured test command and save output.",
    reads=["test_command"],
    writes=["test_results"],
    requires=["test_command.available"],
    produces=["pass_fail_status", "failure_log"],
)
```

---

## 11.3 edge()

定义节点之间的转移。

```py
edge(
    from_: str | list[str],
    to: str | list[str],
    when: str = None,
    parallel: bool = False,
    join: str = None,
    label: str = None,
)
```

示例：

```py
edge("collect_scope", ["read_docs", "inspect_scripts", "scan_tests"], parallel=True)

edge(
    ["read_docs", "inspect_scripts", "scan_tests"],
    "synthesize_context",
    join="all",
)

edge(
    "grade_results",
    "patch_skill",
    when="critical_or_major_failures_exist",
)

edge(
    "grade_results",
    "final_report",
    when="no_major_failures_exist",
)
```

`join` 可选值：

```py
"all"
"any"
"quorum"
"available_only"
```

---

## 11.4 stop_when()

定义终止条件。

```py
stop_when(
    condition: str,
    reason: str = None,
)
```

示例：

```py
stop_when("pass_rate >= 0.9 and no critical issues")
stop_when("iteration >= 3")
stop_when("user says stop")
```

---

# 12. 循环 API

## 12.1 loop()

定义迭代流程。

```py
loop(
    name: str,
    body: list[str | step | workflow],
    continue_when: list[str],
    stop_when: list[str],
    max_iterations: int = None,
    invariant: list[str] = None,
    writes: list[str] = None,
)
```

示例：

```py
loop(
    name="improve_skill_until_good_enough",

    body=[
        "run_evals",
        "grade_results",
        "analyze_failures",
        "patch_skill",
    ],

    continue_when=[
        "critical_or_major_failures_exist",
        "evidence_is_insufficient",
        "user_requests_more_iterations",
    ],

    stop_when=[
        "pass_rate >= 0.9",
        "no_critical_issues",
        "iteration >= 3",
        "user_says_stop",
    ],

    max_iterations=3,

    invariant=[
        "Do not expand scope without user approval.",
        "Each patch must be justified by observed failures.",
        "Do not run a new iteration before analyzing the previous one.",
    ],
)
```

---

## 12.2 map_each()

定义对集合中每个元素执行相同流程。

```py
map_each(
    name: str,
    over: str,
    item: str,
    do: workflow | list[step],
    collect_as: str,
    failure_policy: str = "stop_on_failure",
    parallel: bool = False,
)
```

示例：

```py
map_each(
    name="run_each_eval",
    over="test_cases",
    item="test_case",
    do=workflow([
        step("run_with_skill", "Run the prompt using the candidate skill."),
        step("run_baseline", "Run the prompt without the skill or with old version."),
        step("capture_outputs", "Save outputs, timing, and artifacts."),
    ]),
    collect_as="eval_results",
    failure_policy="continue_and_record",
    parallel=True,
)
```

`failure_policy` 可选值：

```py
"stop_on_failure"
"continue_and_record"
"skip_failed_item"
"ask_user"
```

---

## 12.3 reduce()

定义聚合逻辑。

```py
reduce(
    name: str,
    over: str,
    into: str,
    do: str,
)
```

示例：

```py
reduce(
    name="aggregate_eval_results",
    over="eval_results",
    into="benchmark",
    do="Compute pass rate, regressions, token/time deltas, and recurring failure patterns.",
)
```

---

## 12.4 retry()

定义重试策略。

```py
retry(
    max_attempts: int,
    when: list[str],
    backoff: str = None,
    before_retry: str = None,
    after_exhausted: str = None,
)
```

示例：

```py
retry(
    max_attempts=2,
    when=["network_timeout", "rate_limit"],
    before_retry="Wait briefly and retry the same read-only request.",
    after_exhausted="Report failure and ask user whether to continue.",
)
```

---

# 13. 状态机 API

适合表达人工审批、草稿修改、长期任务状态。

## 13.1 state_machine()

```py
state_machine(
    name: str,
    initial: str,
    states: list[state],
    transitions: list[transition],
    stop_states: list[str],
    invariants: list[str] = None,
)
```

示例：

```py
state_machine(
    name="human_review_loop",
    initial="drafted",

    states=[
        state("drafted"),
        state("waiting_for_user_review"),
        state("revision_requested"),
        state("approved"),
        state("finalized"),
    ],

    transitions=[
        transition("drafted", "waiting_for_user_review", after="present_draft"),
        transition("waiting_for_user_review", "revision_requested", when="user_requests_changes"),
        transition("revision_requested", "drafted", after="apply_requested_changes"),
        transition("waiting_for_user_review", "approved", when="user_approves"),
        transition("approved", "finalized", after="produce_final_artifact"),
    ],

    stop_states=["finalized"],
)
```

---

## 13.2 state()

```py
state(
    name: str,
    description: str = None,
    entry_action: str = None,
    exit_condition: str = None,
)
```

示例：

```py
state(
    "waiting_for_user_review",
    description="The agent has presented a draft and is waiting for user feedback.",
    exit_condition="user approves or requests changes",
)
```

---

## 13.3 transition()

```py
transition(
    from_: str,
    to: str,
    when: str = None,
    after: str = None,
    guard: str = None,
)
```

示例：

```py
transition(
    "waiting_for_user_review",
    "revision_requested",
    when="user requests changes",
)
```

---

# 14. 模式 API

适合表达一个 Skill 内的多种顶层模式。

## 14.1 modes()

```py
modes(
    modes: list[mode],
    default: str = None,
    selection: str = None,
)
```

示例：

```py
modes(
    [
        mode("builtin", trigger="default", workflow="builtin_image_workflow"),
        mode("cli", trigger="user explicitly asks for CLI", workflow="cli_image_workflow"),
    ],
    default="builtin",
    selection="Never switch modes automatically unless the trigger condition is met.",
)
```

---

## 14.2 mode()

```py
mode(
    name: str,
    trigger: str,
    workflow: str | workflow | workflow_graph,
    description: str = None,
    prerequisites: list[str] = None,
    forbidden: list[str] = None,
)
```

示例：

```py
mode(
    name="cli",
    description="Fallback CLI path.",
    trigger="user explicitly requests CLI mode",
    prerequisites=["OPENAI_API_KEY"],
    workflow="cli_image_workflow",
    forbidden=["automatic fallback without user approval"],
)
```

---

# 15. 失败与回退 API

## 15.1 failure_modes()

定义常见失败情况。

```py
failure_modes(
    modes: list[when],
)
```

示例：

```py
failure_modes([
    when("required input missing", then="ask for exactly the missing input"),
    when("referenced file unavailable", then="continue with available files and state the limitation"),
    when("script fails", then="read error output, retry only if fix is obvious"),
])
```

---

## 15.2 fallback_strategy()

定义主路径失败后的回退。

```py
fallback_strategy(
    rules: list[when],
    require_user_approval: bool = False,
)
```

示例：

```py
fallback_strategy(
    [
        when("built-in tool unavailable", then="tell user CLI fallback exists"),
        when("user explicitly chooses fallback", then="use CLI workflow"),
        when("fallback requires secret and secret missing", then="ask user to configure it"),
    ],
    require_user_approval=True,
)
```

---

## 15.3 safety_policy()

定义安全和权限边界。

```py
safety_policy(
    must: list[str] = None,
    must_not: list[str] = None,
    approval_required: list[str] = None,
)
```

示例：

```py
safety_policy(
    must=[
        "Prefer read-only operations before write operations.",
        "Explain irreversible actions before performing them.",
    ],
    must_not=[
        "Do not print secrets.",
        "Do not perform live writes unless the user explicitly requested them.",
    ],
    approval_required=[
        "delete production data",
        "run live non-GET API request",
        "overwrite existing user files",
    ],
)
```

---

# 16. 质量 API

## 16.1 quality_bar()

定义完成质量标准。

```py
quality_bar(
    must: list[str],
    should: list[str] = None,
    must_not: list[str] = None,
)
```

示例：

```py
quality_bar(
    must=[
        "The agent can tell when to use and when not to use the skill.",
        "Every required input is defined.",
        "Every workflow path has an output or stop condition.",
        "Every loop has a termination condition.",
    ],
    should=[
        "The main SKILL.md stays concise.",
        "Detailed references are loaded on demand.",
    ],
    must_not=[
        "Do not include generic best practices that do not change behavior.",
    ],
)
```

---

## 16.2 validation()

定义验证动作。

```py
validation(
    checks: list[check],
    on_failure: str = "report",
)
```

示例：

```py
validation([
    check("frontmatter_valid", "SKILL.md has required name and description."),
    check("workflow_complete", "Every workflow path reaches an output or stop condition."),
    check("resources_exist", "Referenced scripts and files exist."),
])
```

---

## 16.3 check()

```py
check(
    id: str,
    description: str,
    command: str = None,
    expected: str = None,
)
```

示例：

```py
check(
    "script_help",
    "Script exposes a useful help interface.",
    command="python scripts/tool.py --help",
    expected="prints usage and exits successfully",
)
```

---

# 17. 示例和测试 API

## 17.1 examples()

```py
examples(
    items: list[example],
)
```

示例：

```py
examples([
    example(
        user="帮我审查这个 SKILL.md",
        expected_behavior="Use the skill reviewer and return severity-ranked issues.",
    ),
    example(
        user="用这个 skill 处理 PDF",
        expected_behavior="Do not activate skill reviewer; user asks execution, not review.",
    ),
])
```

---

## 17.2 example()

```py
example(
    user: str,
    expected_behavior: str,
    input_files: list[str] = None,
    output: str = None,
)
```

---

## 17.3 tests()

```py
tests(
    cases: list[test_case],
)
```

示例：

```py
tests([
    test_case(
        id="trigger-review",
        prompt="请审查这个 SKILL.md 的问题",
        expected=[
            "skill activates",
            "output includes critical/major/minor issues",
        ],
    ),
    test_case(
        id="non-trigger-execute",
        prompt="用这个 skill 帮我生成 PDF",
        expected=[
            "skill does not activate",
        ],
    ),
])
```

---

## 17.4 test_case()

```py
test_case(
    id: str,
    prompt: str,
    files: list[str] = None,
    expected: list[str] = None,
    assertions: list[assertion] = None,
)
```

---

## 17.5 assertion()

```py
assertion(
    name: str,
    condition: str,
    evidence: str = None,
)
```

示例：

```py
assertion(
    name="has_non_use_boundary",
    condition="review mentions at least one do_not_activate_when issue when missing",
    evidence="review report text",
)
```

---

# 18. 审查辅助 API

## 18.1 severity_levels()

定义问题等级。

```py
severity_levels(
    levels: list[level],
)
```

示例：

```py
severity_levels([
    level("critical", "Causes wrong activation, skipped required work, or invalid output."),
    level("major", "Forces the agent to guess or resolve ambiguity."),
    level("minor", "Reduces clarity but likely does not break execution."),
])
```

---

## 18.2 level()

```py
level(
    name: str,
    meaning: str,
)
```

---

# 19. 审查 API

适合 reviewer 静态检查 Skill DSL。

## 19.1 review_dimensions()

```py
review_dimensions(
    dimensions: list[str],
)
```

示例：

```py
review_dimensions([
    "activation quality",
    "non-activation boundaries",
    "input/output clarity",
    "workflow executability",
    "resource discoverability",
    "loop termination",
    "state consistency",
    "failure paths",
    "agent usability",
])
```

---

## 19.2 使用 validation 表达静态检查

```py
validation(
    checks: list[CheckSpec],
    on_failure: "report" | "repair" | "ask_user" | "stop" = "report",
)
```

示例：

```py
validation(
    [
        check("node_ids_unique", "Every node id is unique."),
        check("edge_targets_exist", "Every edge references existing nodes."),
        check("loop_stop_condition", "Every loop has at least one stop condition."),
        check("state_machine_stop_state", "Every state machine has a stop state."),
        check("workflow_resources_declared", "Every resource referenced in workflow is declared."),
        check("required_inputs_consumed", "Every required input is consumed by at least one node or step."),
        check("required_outputs_produced", "Every required output is produced by at least one node or step."),
    ],
    on_failure="report",
)
```

---

# 20. 推荐完整模板

```py
skill(
    name="example-skill",
    purpose="Describe the exact reusable capability this skill gives the agent.",
    short_description="Short human-facing description.",
    tags=["example", "agent-workflow"],
)

contract_policy(
    priority="contract_wins",
    prose_role="explanation_only",
    executable=False,
)

activate_when([
    "specific user intent or context",
    "specific file type or artifact",
])

do_not_activate_when([
    "neighboring task that should use another skill",
    "generic task this skill should not capture",
])

inputs(
    required=[
        input("task", type=NaturalLanguage),
    ],
    optional=[
        input("files", type=List[File]),
        input("constraints", type=List[Text]),
    ],
)

outputs(
    required=[
        output("result", type=Text),
    ],
    optional=[
        output("artifact", type=File),
    ],
)

resources(
    scripts=[
        script("scripts/tool.py", when="deterministic operation is needed", run_help_first=True),
    ],
    references=[
        reference("references/details.md", when="the task requires advanced details"),
    ],
    assets=[
        asset("assets/template.ext", when="creating output from template"),
    ],
)

environment(
    variables=[],
    commands=[],
    dependencies=[],
    network="unknown",
)

workflow([
    step("classify", "Classify the user's request and choose the path."),
    step("gather_inputs", "Collect required inputs or ask for missing ones."),
    step("execute", "Use the selected tool, script, or method."),
    step("validate", "Check the output against the quality bar."),
    step("respond", "Return the final result with concise explanation."),
])

decision_rules([
    when("input is missing", then="ask the user for exactly the missing input"),
    prefer("default_path", over="alternative_path", reason="more reliable for common cases"),
])

failure_modes([
    when("unsupported request", then="explain limitation and offer closest supported path"),
    when("tool failure", then="inspect error and retry only if the fix is clear"),
])

quality_bar(
    must=[
        "The workflow can be followed without guessing.",
        "The output satisfies the user's requested format.",
    ],
    must_not=[
        "Do not invent missing inputs.",
    ],
)

examples([
    example(
        user="Example user request",
        expected_behavior="Expected agent behavior",
    ),
])

tests([
    test_case(
        id="basic-trigger",
        prompt="Example trigger prompt",
        expected=["skill activates", "result is produced"],
    ),
])
```

---

# 21. 复杂 Graph 模板

```py
workflow_graph(
    name="complex_agent_workflow",

    state={
        "task": "user request",
        "context": "gathered context",
        "plan": "execution plan",
        "results": "intermediate results",
        "issues": "detected issues",
        "final_output": "user-visible result",
    },

    entry="gather_context",

    nodes=[
        node(
            "gather_context",
            action="Read required inputs, references, and environment state.",
            reads=["task"],
            writes=["context"],
        ),

        node(
            "plan",
            action="Choose the execution path and define expected outputs.",
            reads=["task", "context"],
            writes=["plan"],
        ),

        node(
            "execute_path_a",
            action="Run path A.",
            reads=["plan"],
            writes=["results"],
            requires=["plan.path == 'A'"],
        ),

        node(
            "execute_path_b",
            action="Run path B.",
            reads=["plan"],
            writes=["results"],
            requires=["plan.path == 'B'"],
        ),

        node(
            "validate",
            action="Validate results against the quality bar.",
            reads=["results"],
            writes=["issues"],
        ),

        node(
            "repair",
            action="Fix issues found during validation.",
            reads=["issues", "results"],
            writes=["results"],
        ),

        node(
            "finalize",
            action="Produce final user-facing output.",
            reads=["results", "issues"],
            writes=["final_output"],
        ),
    ],

    edges=[
        edge("gather_context", "plan"),
        edge("plan", "execute_path_a", when="plan.path == 'A'"),
        edge("plan", "execute_path_b", when="plan.path == 'B'"),
        edge(["execute_path_a", "execute_path_b"], "validate", join="available_only"),
        edge("validate", "repair", when="fixable_issues_exist"),
        edge("repair", "validate", when="needs_revalidation"),
        edge("validate", "finalize", when="no_blocking_issues"),
    ],

    termination=[
        stop_when("final_output produced"),
        stop_when("user input required and cannot be inferred"),
        stop_when("repair attempts exceeded"),
    ],

    invariants=[
        "Do not proceed when required inputs are missing.",
        "Do not perform destructive actions without explicit user approval.",
        "Every repair must be followed by validation.",
    ],
)
```

---

# 22. Reviewer 必须检查的静态规则

一个 Skill Contract 至少应该通过这些检查：

```py
validation([
    check("skill_name_exists", "skill.name exists"),
    check("skill_purpose_exists", "skill.purpose exists"),
    check("activation_non_empty", "activate_when is not empty"),
    check("negative_activation_boundary", "do_not_activate_when exists for neighboring skills or risky over-triggering"),
    check("required_inputs_defined", "required inputs are defined"),
    check("required_outputs_defined", "required outputs are defined"),
    check("behavior_shape_exists", "workflow or workflow_graph or state_machine exists"),
    check("resource_paths_declared", "all resource paths referenced by workflow are declared"),
    check("scripts_explain_usage", "all declared scripts explain when to use them"),
    check("loops_have_stop", "all loops have stop_when"),
    check("graph_edges_valid", "all graph edges reference existing nodes"),
    check("graph_nodes_unique", "all graph nodes have unique ids"),
    check("branches_terminate", "all graph branches eventually reach an output, stop condition, or user question"),
    check("fallback_paths_defined", "fallback paths are defined for unavailable tools or missing inputs"),
    check("quality_bar_observable", "quality_bar contains observable criteria"),
])
```

---
# 24. 命名建议

节点、步骤和状态建议使用动词短语：

```py
"load_scope"
"classify_task"
"gather_context"
"choose_path"
"execute"
"validate"
"repair"
"finalize"
"ask_user"
```

避免：

```py
"stuff"
"process"
"handle"
"misc"
"do_it"
```

---

# 25. 何时使用哪种结构

简单顺序任务：

```py
workflow([...])
```

多分支任务：

```py
decision(...)
workflow([...])
```

并行收集上下文：

```py
workflow_graph(...)
edge(..., parallel=True)
```

重复执行多个对象：

```py
map_each(...)
reduce(...)
```

迭代改进：

```py
loop(...)
```

人工审批：

```py
state_machine(...)
```

多模式技能：

```py
modes([...])
```

---

# 26. 核心心智模型

Skill Contract DSL 的目标不是模拟 Python，而是让 Agent 能稳定回答这些问题：

```text
这个 skill 什么时候用？
什么时候不用？
需要什么输入？
会产生什么输出？
执行路径是什么？
有哪些分支？
有哪些循环？
循环如何停止？
哪些资源什么时候读取？
哪些动作需要用户确认？
失败时怎么办？
完成标准是什么？
```

只要这些问题能被 DSL 清楚回答，Skill 就从松散 Markdown 变成了可审计的 Agent 行为程序。
