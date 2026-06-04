# Handoff: Skill Contract DSL / Skill-as-Code Design

## Original user question / motivation

我是一个程序员，也在做 AI agent 工程。当前我在写 `SKILL.md` 时遇到几个核心痛点：

1. **Skills 是松散的 Markdown 文件**
   它不是形式化的编程语言，缺少类型系统、输入输出、控制流和可验证结构。写好它像玄学。

2. **LLM/Agent 不擅长写 Skills**
   Agent 往往只是机械堆砌规则，缺少抽象能力，容易写成长 checklist、重复规则、模糊说明。

3. **Reviewer 效果也不好**
   我已经有一个 `skill-reviewer`，它从 Agent 使用者视角审查技能文件，包括触发质量、行为清晰度、冲突、冗余、歧义、弱引导、可执行性等。但实际效果仍然不稳定。

4. **我想探索：能不能用“编程语言”来写 Skills？**
   把 Skill 当成一个函数：有名称、用途、触发条件、输入、输出、执行过程、调用 scripts、调用其他 skills、失败路径。
   由于 Agent 对代码结构理解很好，也许可以在 `SKILL.md` 中直接嵌入 Python-like DSL，例如放在 ```py 代码块中。

目标：设计一种适配 Anthropic Skills、OpenAI/Codex Skills、更广泛 Agent Skill 生态的 **Skill Contract DSL**，既能保留 `SKILL.md` 兼容性，又能让 Skill 具备更强的确定性、可审计性、可测试性和可维护性。

---

## Research summary: Anthropic skills patterns

我研究了 `https://github.com/anthropics/skills` 和 Agent Skills 官方规范，得到这些范式：

### 1. Skill 基本结构

一个 skill 是一个目录，至少包含：

```text
skill-name/
├── SKILL.md
├── scripts/      # optional
├── references/   # optional
├── assets/       # optional
```

`SKILL.md` 必须有 YAML frontmatter：

```yaml
---
name: skill-name
description: what this skill does and when to use it
---
```

`name` 和 `description` 是核心。`description` 是主要触发机制，应包含：

* 这个 skill 做什么；
* 什么时候使用；
* 相关关键词；
* 有时还要包含不要使用的边界。

### 2. Anthropic 的写法特点

从 `pdf`、`docx`、`internal-comms`、`frontend-design`、`algorithmic-art`、`webapp-testing`、`skill-creator` 等 skill 中抽象出：

* `description` 写得比较 “pushy”，避免 under-trigger。
* 正文通常包含：

  * Overview
  * Quick Start
  * Workflow
  * Decision tree
  * Common tasks
  * Gotchas
  * Quick reference
  * Next steps / references
* 大 skill 使用 progressive disclosure：

  * SKILL.md 只放核心流程；
  * 详细文档放 `references/`；
  * 可执行重复逻辑放 `scripts/`；
  * 模板和静态资源放 `assets/`。
* 对脚本的使用通常应面向 Agent 接口，而不是暴露内部实现。
* 推荐提供明确默认路径，而不是给 Agent 一堆平级选项。
* 推荐记录 edge cases 和 gotchas，因为这些是 Agent 最容易犯错的地方。

### 3. Anthropic skill-creator 的重要观点

`skill-creator` 明确强调：

* `description` 是触发主机制。
* “when to use” 信息应该主要放在 `description` 中。
* 技能容易 under-trigger，所以 description 可以适度强势。
* Skills 使用三层加载机制：

  1. metadata：始终加载；
  2. SKILL.md body：触发后加载；
  3. bundled resources：按需加载。
* SKILL.md 推荐少于 500 行。
* 如果有多 domain / 多 framework / 多 variant，应把细节拆到 references。

---

## Research summary: OpenAI / Codex skills patterns

我又参考了 `https://github.com/openai/skills`，尤其是：

* `.system/skill-creator`
* `.system/skill-installer`
* `.system/imagegen`
* `.curated/cli-creator`
* `.curated/define-goal`
* `.curated/jupyter-notebook`
* `.curated/gh-address-comments`

OpenAI/Codex skills 比 Anthropic 样例更工程化，出现了更多结构。

### 1. OpenAI skills 的扩展结构

除了 `SKILL.md`，常见还有：

```text
agents/openai.yaml
scripts/
references/
assets/
LICENSE.txt
```

`agents/openai.yaml` 是 UI-facing metadata，用于 skill lists / chips。
`SKILL.md` 仍是核心行为说明。

### 2. 明确的 when to use / when not to use

例如 imagegen / jupyter-notebook / define-goal 都有明确的：

* When to use
* When not to use
* Workflow
* Decision tree
* Environment
* Reference map
* Quality bar

这说明 DSL 里应该把正向触发和负向边界都作为一等概念。

### 3. 模式切换

OpenAI 的 `imagegen` skill 有两个顶层模式：

* default built-in tool mode；
* explicit-only CLI fallback mode。

而且明确：

* 默认使用 built-in tool；
* 不要自动 fallback；
* CLI fallback 需要用户明确要求；
* CLI fallback 需要 `OPENAI_API_KEY`。

这说明 DSL 需要支持：

```py
modes(...)
mode(...)
fallback_strategy(...)
prerequisites(...)
```

### 4. 决策树

例如 `imagegen` 需要判断：

1. 是 generate 还是 edit？
2. 是 single asset 还是 batch？
3. 是 preview-only 还是 project asset？
4. 是否需要 CLI fallback？

`jupyter-notebook` 也有：

* experiment
* tutorial
* existing notebook refactor

这说明 DSL 需要 `decision(...)`、`decision_tree(...)`、`decision_rules(...)`。

### 5. 质量标准

`define-goal` 有很清楚的 Goal Quality Bar：

目标必须说明：

* 什么具体事情会变成 true；
* 证据是什么；
* 成功阈值是什么；
* scope 边界是什么；
* 什么情况下 stop and ask。

这说明 DSL 需要：

```py
quality_bar(...)
validation(...)
check(...)
```

### 6. 环境、工具、路径、脚本接口

OpenAI skills 经常定义：

* environment variables；
* script path；
* command usage；
* helper script；
* installed path；
* auth/config precedence；
* network / sandbox / escalation 注意事项。

这说明 DSL 需要：

```py
environment(...)
env(...)
tools(...)
script(...)
reference(...)
asset(...)
```

### 7. 工作流常常不是线性的

`cli-creator` 包含：

* inspect source；
* choose runtime；
* sketch command contract；
* scaffold；
* implement；
* install；
* smoke test；
* validate；
* create companion skill。

还有分支、条件、失败路径、fallback、人类确认和安全规则。

这说明 DSL 不应该只有 `workflow([...])`，还要有图结构、循环和状态机。

---

## Key insight

最初想法是：

> 在 `SKILL.md` 中放一个 ```py 代码块，里面写 Python-like DSL。

但不要写真正可执行 Python。
更好的定义是：

> **Python-like normative contract, not executable code.**

即：

````markdown
## Skill Contract

The following Python-like contract is normative, not executable.
If this contract conflicts with later prose, the contract wins.

```py
...
````

````

这个 contract 是 Skill 的 source of truth。  
后面的 Markdown 只是解释，不应引入新的行为规则。

---

## DSL design direction

DSL 的目标不是让 Python interpreter 执行，而是让：

- Agent 在 `SKILL.md` 中直接读取并稳定理解 contract；
- Reviewer 能静态审查；
- Tests 能验证触发和执行路径。

核心是把 Skill 变成一个 **Agent-facing function / workflow contract**，直接写在 `SKILL.md` 的 ```py 代码块中；无需 compiler，也不把 DSL 编译或渲染成另一份 `SKILL.md`。

---

## DSL should support these abstraction layers

### Level 1: Simple contract

适合简单 skill：

```py
skill(...)
activate_when(...)
do_not_activate_when(...)
inputs(...)
outputs(...)
workflow([...])
quality_bar(...)
````

### Level 2: Decision workflow

适合有分支的 skill：

```py
decision(...)
decision_rules(...)
modes(...)
mode(...)
fallback_strategy(...)
```

### Level 3: Workflow graph

适合 DAG、并行、join：

```py
workflow_graph(...)
node(...)
edge(...)
stop_when(...)
```

### Level 4: Loop / map-reduce / state machine

适合复杂 Agent 流程：

```py
loop(...)
map_each(...)
reduce(...)
retry(...)
state_machine(...)
state(...)
transition(...)
```

---

## Important reasoning about complex workflows

用户指出：复杂 workflow 可能像 DAG，甚至有 loop。
所以不能只用线性 `workflow()` 或 `decision_tree()`。

应该建模成：

```text
node: 做一件事
edge: 什么时候从 A 到 B
state: 节点之间传递的数据
loop: 何时继续，何时退出
gate: 是否允许进入下一步
join: 并行分支在哪里汇合
```

### DAG example

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

### Loop example

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

### map/reduce example

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

reduce(
    name="aggregate_eval_results",
    over="eval_results",
    into="benchmark",
    do="Compute pass rate, regressions, token/time deltas, and recurring failure patterns.",
)
```

### state machine example

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

## Proposed Skill Contract DSL v0.1 API reference

The previous response produced a full reference. Keep using or refine the following API surface.

### Top-level

```py
skill(name, purpose, summary=None, version=None, owner=None)
metadata(short_description=None, tags=None, compatibility=None, license=None, experimental=False, custom=None)
contract_policy(priority="contract_wins", prose_role="explanation_only", executable=False)
```

### Activation

```py
activate_when(conditions, match="any", strength="normal")
do_not_activate_when(conditions, priority="higher_than_activate_when")
activation_keywords(include, exclude=None)
activation_examples(positive, negative)
```

### Inputs / outputs

```py
inputs(required, optional=None, ask_when_missing=True)
input(name, type=Text, description=None, default=None, examples=None, required=True)

outputs(required, optional=None)
output(name, type=Text, description=None, format=None, success_criteria=None)
```

### Resources

```py
resources(scripts=None, references=None, assets=None)

script(path, purpose=None, when=None, interface=None, run_help_first=False, black_box=True, requires=None, outputs=None)

reference(path, purpose=None, when=None, read_strategy="on_demand", grep_patterns=None)

asset(path, purpose=None, when=None, copy_policy="copy_when_needed")
```

### Environment / tools

```py
environment(variables=None, commands=None, dependencies=None, network="unknown", filesystem="workspace")

env(name, default=None, required=False, secret=False, purpose=None)

tools(required=None, preferred=None, forbidden=None)
```

### Simple workflow

```py
workflow(steps, name=None)

step(
    id,
    action,
    purpose=None,
    reads=None,
    writes=None,
    requires=None,
    produces=None,
    when=None,
    ask_user=None,
)
```

### Decisions

```py
decision(id, question, branches, default=None, ask_when_uncertain=False)

decision_rules(rules)

when(condition, then, else_=None)

prefer(option, over, reason=None)

choose(from_, by, default=None)
```

### Graph workflow

```py
workflow_graph(
    name,
    state=None,
    nodes=None,
    edges=None,
    entry=None,
    exits=None,
    termination=None,
    invariants=None,
)

node(
    id,
    action,
    purpose=None,
    reads=None,
    writes=None,
    requires=None,
    produces=None,
    tool=None,
    script=None,
    human_input=None,
    retry=None,
)

edge(
    from_,
    to,
    when=None,
    parallel=False,
    join=None,
    label=None,
)

stop_when(condition, reason=None)
```

`join` values:

```py
"all"
"any"
"quorum"
"available_only"
```

### Loops

```py
loop(
    name,
    body,
    continue_when,
    stop_when,
    max_iterations=None,
    invariant=None,
    writes=None,
)

map_each(
    name,
    over,
    item,
    do,
    collect_as,
    failure_policy="stop_on_failure",
    parallel=False,
)

reduce(name, over, into, do)

retry(
    max_attempts,
    when,
    backoff=None,
    before_retry=None,
    after_exhausted=None,
)
```

`failure_policy` values:

```py
"stop_on_failure"
"continue_and_record"
"skip_failed_item"
"ask_user"
```

### State machine

```py
state_machine(
    name,
    initial,
    states,
    transitions,
    stop_states,
    invariants=None,
)

state(name, description=None, entry_action=None, exit_condition=None)

transition(from_, to, when=None, after=None, guard=None)
```

### Modes

```py
modes(modes, default=None, selection=None)

mode(
    name,
    trigger,
    workflow,
    description=None,
    prerequisites=None,
    forbidden=None,
)
```

### Failure / fallback / safety

```py
failure_modes(modes)

fallback_strategy(rules, require_user_approval=False)

safety_policy(must=None, must_not=None, approval_required=None)
```

### Quality / validation

```py
quality_bar(must, should=None, must_not=None)

validation(checks, on_failure="report")

check(id, description, command=None, expected=None)
```

### Examples / tests

```py
examples(items)

example(user, expected_behavior, input_files=None, output=None)

tests(cases)

test_case(id, prompt, files=None, expected=None, assertions=None)

assertion(name, condition, evidence=None)
```

### Output format

```py
output_format(name, template, required_sections=None)

severity_levels(levels)

level(name, meaning)
```

### Reviewer vocabulary

```py
review_dimensions(dimensions)
```

---

## Validation checks the reviewer should enforce

A Skill Contract should satisfy:

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

For graph/loop workflows, also check:

```py
validation([
    check("node_ids_unique", "Every node id is unique."),
    check("edge_targets_exist", "Every edge references existing nodes."),
    check("loop_stop_condition", "Every loop has at least one stop condition."),
    check("loop_bounded_or_user_stoppable", "Every loop has either max_iterations or a user-controllable stop condition."),
    check("state_machine_initial_state", "Every state machine has an initial state."),
    check("state_machine_stop_state", "Every state machine has at least one stop state."),
    check("required_inputs_consumed", "Every required input is consumed by at least one step or node."),
    check("required_outputs_produced", "Every required output is produced by at least one step or node."),
    check("state_variables_defined", "Every state variable read by a node is written upstream or declared as input."),
    check("parallel_branches_join_or_terminate", "Every parallel branch has an explicit join or termination rule."),
])
```

---

## Recommended embedded format inside SKILL.md

````markdown
---
name: example-skill
description: Use this skill when ...
---

# Example Skill

## Skill Contract

The following Python-like contract is normative, not executable.
If this contract conflicts with later prose, the contract wins.

```py
skill(
    name="example-skill",
    purpose="Describe the reusable capability this skill gives the agent.",
)

contract_policy(
    priority="contract_wins",
    prose_role="explanation_only",
    executable=False,
)

activate_when([
    "specific user intent or context",
])

do_not_activate_when([
    "neighboring task that should use another skill",
])

inputs(
    required=[input("task", type=NaturalLanguage)],
    optional=[input("files", type=List[File])],
)

outputs(
    required=[output("result", type=Text)],
    optional=[output("artifact", type=File)],
)

workflow([
    step("classify", "Classify the user's request and choose the path."),
    step("gather_inputs", "Collect required inputs or ask for missing ones."),
    step("execute", "Use the selected tool, script, or method."),
    step("validate", "Check the output against the quality bar."),
    step("respond", "Return the final result with concise explanation."),
])
````

## Human-readable guidance

This section explains the contract above. Do not introduce new rules here.

````

---

## Important design principles to preserve

1. **DSL is normative, not executable.**  
   Do not pretend this is real Python.

2. **The DSL should optimize for Agent comprehension and static review.**  
   Not for machine execution.

3. **Keep Skill DSL declarative.**  
   Prefer `loop(... stop_when=...)` over raw `while`.

4. **Graph workflows should be auditable.**  
   A reviewer should be able to answer:
   - What are the nodes?
   - What state does each node read/write?
   - What edges exist?
   - Where do loops terminate?
   - Where do parallel branches join?
   - What requires user approval?
   - What output is produced?

5. **Progressive complexity.**  
   Simple skills should not need graph syntax.  
   Complex skills can opt into graph/loop/state machine.

6. **Avoid Markdown duplication.**  
   If the DSL says it, Markdown should not repeat it unless needed for readability.

7. **Model Agent behavior, not implementation internals.**  
   Scripts and tools should be described by AUI: when to call, with what inputs, expected outputs, failure behavior.

---

## Suggested next steps in Codex

1. Create a repo or folder for the DSL experiment.
2. Define a `skill_contract.py` or `skill_contract.pyi` with no-op functions and type hints:
   - This gives Agent a real-looking API surface.
   - It helps LLM write consistent contracts.
3. Create a parser/linter that extracts ```py contract blocks from `SKILL.md` for validation only (not compilation or rendering).
4. Implement static checks:
   - missing trigger;
   - missing non-trigger;
   - graph edge references invalid node;
   - loop missing stop condition;
   - resource path referenced but undeclared;
   - required input unused;
   - required output unproduced.
5. Test on existing skills:
   - skill-reviewer
   - pdf/docx-like skill
   - cli-creator-like skill
   - imagegen-like skill
   - define-goal-like skill
6. Compare reviewer output before/after DSL.
````
