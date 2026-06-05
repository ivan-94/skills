---
name: create-dsl-skills
description: 使用 Python Skill Contract DSL 创建、改写或审查 DSL-backed Agent Skill。用于用户要求创建带 DSL contract 的 SKILL.md、把现有 Skill 改写为 DSL 契约，或审查 DSL-backed Skill、contract block、contract.pyi、examples 一致性。
---

```python
from skill_contract import *

skill(
    name="create-dsl-skills",
    purpose="使用 Python Skill Contract DSL 创建、改写和审查 DSL-backed Agent Skill。",
)

activate_when(
    [
        "用户想创建带 Python Skill Contract DSL 的 SKILL.md",
        "用户要求把现有 Skill 改写为 DSL 契约形式",
        "用户要求审查 DSL-backed Skill、contract block、contract.pyi 或 examples",
    ],
    match="any",
)

do_not_activate_when([
    "用户要执行某个无关目标 Skill，而不是创建、改写或审查 Skill",
    "用户只要求普通 Markdown 润色，且不涉及 Agent Skill 行为",
    "用户询问普通 Python 编程，且与 Skill Contract DSL 无关",
    "用户只是询问 Skill Contract DSL 概念、spec、guide、语法或写法，且没有要求创建、改写或审查具体 DSL-backed Skill",
    "用户要求修改仓库代码功能，但没有要求创建或更新 Skill",
])

resources(
    scripts=[
        script(
            "scripts/validate_contract.py",
            when="写入或改写 DSL-backed Skill 后",
            interface="python3 scripts/validate_contract.py <skill-dir> --examples",
            run_help_first=True,
            black_box=True,
            requires=["python3"],
            outputs=["mechanical_validation_report"],
        ),
    ],
    references=[
        reference(
            "references/contract.pyi",
            when="开始编写、重写或审查任何 contract block 之前",
            read_strategy="always",
        ),
        reference(
            "examples/resources-and-calls.md",
            when="Skill 需要脚本、参考资料、工具调用、MCP、环境假设或机械验证步骤",
        ),
        reference(
            "examples/frontmatter-description.md",
            when="需要生成或审查正文加载前的 frontmatter description",
        ),
        reference(
            "examples/cli-backed-skill.md",
            when="Skill 主要包装一个脚本或 CLI，且没有复杂审查规则、图工作流或多阶段工作流",
        ),
        reference(
            "examples/decisions-modes-gates.md",
            when="Skill 有模式、分支、fallback、安全边界或用户审批",
        ),
        reference(
            "examples/graph-workflow.md",
            when="线性 workflow 无法表达 DAG、并行、join 或显式终止",
        ),
        reference(
            "examples/iteration-aggregation.md",
            when="Skill 需要迭代、批量评估、多 case 检查或聚合结果",
        ),
        reference(
            "examples/subagent-delegation.md",
            when="Skill 需要把有边界的工作委托给子 Agent 并保留可审计交付路径",
        ),
        reference(
            "examples/human-review-vocabulary.md",
            when="Skill 需要人工审查、委托其他 Skill 或定义审查规则",
        ),
    ],
)

environment(
    commands=["python3", "rg", "git"],
    network="not_required",
    filesystem="workspace",
)

TASTE_RULES = [
    "一致性：frontmatter、activate_when、do_not_activate_when、modes、workflow、resources 和 examples 不得互相冲突；同一行为只能有一个权威表达位置。",
    "可执行清晰度：Agent 读完 contract 后必须知道下一步读什么、问什么、运行什么、写什么；不得出现多条同级路径但没有选择规则。",
    "简洁密度：简单脚本型 Skill 不得套用复杂模板；同一规则不得在 modes、decision_rules、quality_bar 或 examples 中重复展开。",
    "接口完整性：required inputs/outputs、script/reference/tool/call marker、用户审批点和失败路径必须能追踪到具体步骤或质量要求。",
    "引导强度：关键边界必须写成明确禁止或选择规则；不得依赖弱提示、泛泛价值判断或让 Agent 自行补全隐含流程。",
    "用户参与可见性：需要询问用户、征求同意、等待人工审查或真实外部执行时，必须在结构化参数或具体自然语言调用点中显式出现。",
    "结构合法性：主 SKILL.md 只承载核心 contract 和核心例子；复杂语法放入按需 examples，Markdown prose 不得在 contract 外新增行为。",
    "开闭原则: 只对 Agent 暴露公开接口，隐藏内部实现细节、开发者信息; 不要直接调用其他 Skills 的内部实现细节，而是使用 call_skill 委托调用。",
]

workflow(
    [
        step("draft_contract", "基于新需求或既有行为库存定义 activation、mode interfaces、resources、behavior shape、decision_rules、call markers 和 quality_bar", reads=["skill_task", "source_map", "behavior_inventory"], writes=["contract_draft"]),
        step("run_semantic_review", "按 quality_bar、TASTE_RULES 和用户约束逐项做语义审查；记录每个维度的通过、问题或不适用原因。", reads=["contract_draft"], writes=["review_notes", "semantic_review_evidence"]),
        step("apply_occams_razor", "在语义审查后做减法：删除重复、冗余、弱引导、违反 TASTE_RULES 的内容", reads=["contract_draft", "review_notes"], writes=["contract_draft"]),
        step("write_skill", "生成 frontmatter 和一个 Python DSL contract block；Markdown prose 只保留用户明确要求的非行为性说明。", writes=["skill_markdown", "frontmatter_description"]),
        step(
            "run_mechanical_validation",
            f"""
            写入后运行内置验证脚本；ok=true 只表示没有 hard mechanical errors，不等于语义审查通过。
            使用 {call_script(
                "scripts/validate_contract.py",
                how="从 create-dsl-skills 目录执行；传入目标 Skill 目录，默认使用本 Skill 的 references/contract.pyi，必要时加 --examples 解析 examples/*.md",
                expect="JSON mechanical validation report with ok=true and summary.errors=0",
                on_failure="报告失败项，不提交，不把机械验证失败说成成功",
            )}。
            """,
            writes=["mechanical_validation_evidence"],
        ),
    ],
    name="build_contract",
)

modes(
    [
        mode(
            "create",
            trigger="用户要创建新的 DSL-backed Skill",
            inputs=[
                input("skill_task", type=NaturalLanguage, description="用户关于创建 DSL-backed Skill 的请求。"),
                input("source_material", type=File | Directory | Text, description="需要编码进新 Skill 的资料。", required=False),
                input("constraints", type=Text, description="用户给出的范围、风格、语言、触发或兼容性要求。", required=False),
            ],
            outputs=[
                output("skill_markdown", type=Text, description="符合 Python Skill Contract DSL 的新 SKILL.md 草稿或补丁。"),
                output("frontmatter_description", type=Text, description="能在正文加载前触发 Skill 的描述。"),
                output("semantic_review_evidence", type=Text, description="按 TASTE_RULES 和用户约束完成的语义审查证据。"),
                output("mechanical_validation_evidence", type=Text, description="内置验证脚本的命令、结果和失败项。"),
            ],
            workflow=[
                step("read_spec", "读取 references/contract.pyi，确认可用 API、类型和静态审查期望。", writes=["dsl_api"]),
                step("gather_sources", "读取用户给出的文档、脚本、现有说明或目标目录；只加载与当前 Skill 行为相关的材料。", reads=["skill_task", "source_material"], writes=["source_map"]),
                step("build_from_sources", "继续执行 build_contract：起草 contract、语义审查、奥卡姆剃刀压缩、写入和机械验证。", reads=["source_map"], writes=["skill_markdown", "frontmatter_description", "review_notes", "semantic_review_evidence", "mechanical_validation_evidence"]),
            ],
            description="从需求或资料创建新的 DSL Skill。",
        ),
        mode(
            "rewrite",
            trigger="用户要把现有 Skill 改写为 DSL contract",
            inputs=[
                input("skill_task", type=NaturalLanguage, description="用户关于改写 DSL-backed Skill 的请求。"),
                input("target_skill", type=File | Directory | Text, description="要改写的现有 SKILL.md、Skill 目录或粘贴内容。"),
                input("constraints", type=Text, description="用户给出的范围、风格、语言、触发或兼容性要求。", required=False),
            ],
            outputs=[
                output("skill_markdown", type=Text, description="保留既有行为边界后的 DSL SKILL.md 补丁。"),
                output("frontmatter_description", type=Text, description="与 activation 边界对齐的 frontmatter description。"),
                output("semantic_review_evidence", type=Text, description="保留、删除和新增行为边界的审查证据。"),
                output("mechanical_validation_evidence", type=Text, description="内置验证脚本的命令、结果和失败项。"),
            ],
            workflow=[
                step("load_target", "读取目标 SKILL.md、references、scripts、assets 和 manifest 中与触发或行为相关的内容。", reads=["target_skill"], writes=["target_surface"]),
                step("preserve_behavior", "提取现有触发边界、输入输出、工作流、资源、脚本接口、失败路径和安全约束。", reads=["skill_task", "target_surface"], writes=["behavior_inventory"]),
                step(
                    "confirm_overwrite",
                    f"""
                    只有目标不明确、会改多个文件、会删除资源、用户只要求草稿/审查，或改动 contract.pyi 签名时才请求确认。
                    如果用户已经明确要求重构某一个 SKILL.md，可以直接改该文件并在最终回复说明。
                    使用 {call_human(
                        "approve_skill_rewrite",
                        how="展示目标文件、额外文件、删除资源或 API 签名变化，并询问是否继续",
                        expect="明确批准、拒绝或修改要求",
                        on_failure="停止改写并报告未完成原因",
                    )}。
                    """,
                    when="目标不明确、会改多个文件、会删除资源、用户只要求草稿/审查，或会修改 contract.pyi API",
                    ask_user="确认是否继续高风险 rewrite。",
                ),
                step("build_from_inventory", "继续执行 build_contract：翻译行为库存、语义审查、奥卡姆剃刀压缩、写入和机械验证；明确单文件 rewrite 不需要重复确认。", reads=["behavior_inventory"], writes=["skill_markdown", "frontmatter_description", "review_notes", "semantic_review_evidence", "mechanical_validation_evidence"]),
            ],
            description="把已有 Skill 改写为 DSL 契约形式。",
            forbidden=["silent behavior deletion", "scope expansion without user approval"],
        ),
        mode(
            "review",
            trigger="用户要审查 DSL-backed Skill、contract block 或 contract.pyi 一致性",
            inputs=[
                input("skill_task", type=NaturalLanguage, description="用户关于审查 DSL-backed Skill 的请求。"),
                input("target_skill", type=File | Directory | Text, description="要审查的 SKILL.md、Skill 目录、contract block 或 contract.pyi。"),
                input("constraints", type=Text, description="用户给出的范围、风格、语言、触发或兼容性要求。", required=False),
            ],
            outputs=[
                output("review_notes", type=Text, description="按严重级别组织的 findings 和修复建议。"),
                output("semantic_review_evidence", type=Text, description="按 TASTE_RULES 逐项完成的语义审查证据。"),
            ],
            workflow=[
                step("load_review_scope", "读取目标 Skill、contract.pyi、contract 声明的 scripts/references/assets 公开接口，以及被引用的 examples；不要批量加载无关资源。", reads=["skill_task", "target_skill"], writes=["review_scope"]),
                step("check_activation", "检查 frontmatter description 是否能在正文加载前正确触发，并且不宽于 activate_when。", reads=["review_scope"], writes=["findings"]),
                step("check_contract_api", "检查 contract 只使用 references/contract.pyi 中存在的函数、参数和字面量。", reads=["review_scope"], writes=["findings"]),
                step("check_resource_interfaces", "检查 scripts/references/assets 声明的路径、用途、加载时机、公开 interface 与 call_* 调用点一致；除非公开接口不清，不读取内部实现细节。", reads=["review_scope"], writes=["findings"]),
                step("check_behavior_completeness", "检查 required inputs/outputs 是否被步骤、节点、规则或模式消费和产出。", reads=["review_scope"], writes=["findings"]),
                step("check_calls_and_gates", "检查 call_* 是否只嵌入自然语言字符串；检查 ask_user、required_when、mode inputs 和 failure_policy='ask_user' 等结构化用户闸门是否被保留。", reads=["review_scope"], writes=["findings"]),
                step("check_taste", "按 TASTE_RULES 执行品味审查；每个 finding 必须指出违反的具体维度、证据和对 Agent 执行的影响。", reads=["review_scope"], writes=["findings"]),
                step("report_review", "按严重级别输出证据、Agent 影响和具体修复建议；除非用户要求，不直接改文件。", writes=["review_notes", "semantic_review_evidence"]),
            ],
            description="审查 DSL Skill 的触发、接口、控制流、调用标记、机械校验和品味审查规则。",
            forbidden=["editing during review-only requests"],
        ),
    ],
    default="create",
    selection="按用户请求选择模式；如果目标是本 Skill 自身，也按普通 rewrite 或 review 处理。",
)

decision_rules([
    when("Skill 是简单脚本型、单 CLI、单 reference 或少量安全边界", then="先表达真实行为，再通过 apply_occams_razor 压缩成轻量 contract"),
    when("简单 Skill 存在用户可见选择，例如 raw/text/card、dry-run/send 或普通报告/业务 payload", then="保留轻量 decision_rules，不为了压缩删除真实分支"),
    when("Skill 需要教学型示例、审查规则、多 mode、复杂图工作流或跨 Skill 委托", then="保留必要高级结构，但仍在语义审查后执行奥卡姆剃刀"),
    when("任务主要是线性创建或改写", then="使用 workflow 或 mode 内联 workflow 表达，不要引入 workflow_graph"),
    when("任务需要 DAG、并行、join 或非线性终止", then="读取 examples/graph-workflow.md 并使用 workflow_graph"),
    when("任务需要持续人工审查、批准或生命周期边界", then="读取 examples/human-review-vocabulary.md 并使用 modes、workflow、call_human 和 quality_bar"),
    when("任务需要重复评估多个 case", then="读取 examples/iteration-aggregation.md 并使用 loop 或 map_each；聚合结果用后续 step 表达"),
    when("Skill 是 CLI-backed 轻量形态", then="读取 examples/cli-backed-skill.md，不套用复杂审查或教学模板"),
    when("required input missing", then="只询问缺失输入，不发散到完整需求访谈"),
    when("frontmatter description 需要生成", then="从 activate_when 推导具体触发摘要，避免泛化营销文案"),
    when("高级示例只在复杂场景需要", then="按需读取 examples/*.md，不把所有高级示例复制进 SKILL.md"),
    when("contract draft 经过语义审查", then="再执行 post-review compression，用奥卡姆剃刀删除重复和冗余"),
    when("contract.pyi lacks a specialized construct", then="用 step、when、quality_bar 或现有 DSL 函数的自然语言参数表达"),
    when("target resource path is missing", then="报告缺失路径并继续处理可用上下文"),
    when("mechanical validation fails", then="报告具体失败文件、代码块或规则；不要把失败隐藏成成功"),
    when("user requested review only", then="保持只读并返回 findings"),
    when("deterministic validation tool is unavailable", then="执行人工静态审查并明确说明验证缺口"),
    when("advanced example file is unavailable", then="只使用 contract.pyi 和当前 SKILL.md，避免编造示例 API"),
    when("fallback path would edit or overwrite files", then="先请求用户明确批准"),
])

quality_bar(
    must=[
        "SKILL.md 的 frontmatter description 能独立触发正确 Skill",
        "正文行为由一个 Python DSL contract block 承载",
        "contract 只使用 references/contract.pyi 中存在的函数和参数",
        "required inputs、required outputs、workflow 和 modes 互相可追踪",
        "resources 声明每个 script、reference 和 asset 的加载时机或公开接口",
        "写入前必须经过 run_semantic_review 和 apply_occams_razor，避免简单 Skill 膨胀",
        "语义审查必须逐项覆盖 TASTE_RULES，并写入 semantic_review_evidence",
        "机械校验结果必须单独写入 mechanical_validation_evidence，不得替代语义审查",
        "修改现有 Skill 时必须说明保留、删除和新增的行为边界",
        "结构化用户输入闸门必须使用 ask_user、required_when、mode inputs 或 failure_policy='ask_user' 等固定参数表达",
    ] + TASTE_RULES,
    should=[
        "简单 Skill 只使用 workflow、轻量 decision_rules 和 quality_bar",
        "复杂控制流按需加载 examples/*.md",
        "主 SKILL.md 保持紧凑，复杂语法放入 examples/*.md",
        "中文 Skill 使用中文说明，除函数名、文件名、工具名和稳定字面量外不混用英文",
        "最终回复说明验证证据和未提交状态",
    ],
    must_not=[
        "不要让 Markdown prose 定义 contract 中不存在的行为",
        "不要让 frontmatter description 比 activate_when 更宽",
        "不要为了形式化而删除用户需要的自然语言上下文",
        "不要把 call_human 当成结构化用户输入闸门的替代品",
        "不要在 review-only 请求中编辑文件",
        "不要自行提交、推送或执行破坏性 git 命令",
        "不要在没有明确用户授权时发送通知、调用 webhook、写入外部系统或产生费用",
    ],
)

examples([
    example(
        user="最小可用 Skill Contract 应该长什么样？",
        expected_behavior="""
        保留这个最小形状作为主文件内的核心示例：

        from skill_contract import *

        skill(
            name="example-skill",
            purpose="Describe the reusable capability this skill gives the agent.",
        )

        activate_when([
            "user asks for this exact kind of task",
        ])

        do_not_activate_when([
            "neighboring task that should not use this skill",
        ])

        inputs(
            required=[
                input("task", type=NaturalLanguage),
            ],
        )

        outputs(
            required=[
                output("result", type=Text),
            ],
        )

        workflow([
            step("classify", "Classify the user request and choose the path."),
            step("gather_inputs", "Collect required inputs or ask for missing ones."),
            step("execute", "Perform the skill-specific work."),
            step("validate", "Check the result against the quality bar."),
            step("respond", "Return the final result."),
        ])
        """,
        output="minimal_contract_shape",
    ),
])
```
