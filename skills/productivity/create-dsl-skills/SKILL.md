---
name: create-dsl-skills
description: 使用 Python Skill Contract DSL 编写、重写或审查 Agent Skill。用于用户要求创建 SKILL.md、把现有 Skill 改写为 DSL、审查 DSL 契约、查看 DSL spec/guide，或要求本 Skill 自举改写。
---

```python
from skill_contract import *

skill(
    name="create-dsl-skills",
    purpose="使用 Python Skill Contract DSL 编写、重写、审查和自举 Agent Skill。",
    summary="产出以 contract.pyi 为规范本体、以 Python-shaped 契约块为正文的 SKILL.md。",
    version="0.1.0",
)

metadata(
    short_description="用 Python DSL 契约编写和审查 Agent Skill。",
    tags=["skills", "dsl", "agent-instructions", "contract", "self-bootstrap"],
    compatibility=["codex", "claude", "generic-agent"],
)

activate_when(
    [
        "用户想创建带 Python Skill Contract DSL 的 SKILL.md",
        "用户要求把现有 Skill 改写为 DSL 契约形式",
        "用户要求审查 DSL-backed Skill、contract block、contract.pyi 或 examples",
        "用户询问 Skill Contract DSL 的 spec、guide、语法或写法",
        "用户要求 create-dsl-skills 自举、dogfood、完全 DSL 化或中文化",
    ],
    match="any",
    strength="strong",
)

do_not_activate_when([
    "用户要执行某个无关目标 Skill，而不是创建、改写或审查 Skill",
    "用户只要求普通 Markdown 润色，且不涉及 Agent Skill 行为",
    "用户询问普通 Python 编程，且与 Skill Contract DSL 无关",
    "用户要求修改仓库代码功能，但没有要求创建或更新 Skill",
])

activation_keywords(
    include=[
        "SKILL.md",
        "Skill Contract DSL",
        "contract.pyi",
        "DSL skill",
        "Agent Skill",
        "自举",
        "dogfood",
        "完全 DSL",
    ],
    exclude=[
        "execute skill",
        "generic Python script",
        "generic Markdown proofreading",
    ],
)

activation_examples(
    positive=[
        "用 DSL 写一个 skill",
        "把这个 SKILL.md 改成 contract.pyi 规范的形式",
        "审查这个 DSL contract 是否覆盖了 workflow",
        "create-dsl-skills 可以完全自举吗",
        "把这个 SKILL.md 完全改成中文 DSL",
    ],
    negative=[
        "执行这个 PDF skill 提取表格",
        "帮我润色这篇普通文章",
        "写一个和 Skill DSL 无关的 Python 脚本",
    ],
)

inputs(
    required=[
        input(
            "skill_task",
            type=NaturalLanguage,
            description="用户关于创建、重写、审查或自举 DSL-backed Skill 的请求。",
        ),
    ],
    optional=[
        input(
            "target_skill",
            type=File | Directory | Text,
            description="要创建、重写或审查的 SKILL.md 路径、Skill 目录或粘贴内容。",
        ),
        input(
            "source_material",
            type=File | Directory | Text,
            description="需要被编码进 Skill 的文档、脚本、参考资料、现有说明或示例。",
        ),
        input(
            "constraints",
            type=Text,
            description="用户给出的范围、风格、语言、触发、兼容性或提交边界要求。",
        ),
        input(
            "contract_density",
            type=Text,
            description="可选的 contract 密度：compact 适合简单脚本型 Skill，full 适合复杂工作流、审查词汇或教学示例。",
            default="auto",
            examples=["auto", "compact", "full"],
        ),
    ],
    ask_when_missing=True,
)

outputs(
    required=[
        output(
            "skill_markdown",
            type=Text,
            description="符合 Python Skill Contract DSL 的 SKILL.md 草稿或补丁。",
            success_criteria=[
                "frontmatter description 与 activate_when 和 do_not_activate_when 对齐",
                "正文行为由 Python DSL contract 表达",
                "required inputs、required outputs、workflow 和 validation 可追踪",
            ],
        ),
        output(
            "frontmatter_description",
            type=Text,
            description="能在正文加载前触发 Skill 的中文或用户指定语言描述。",
        ),
    ],
    optional=[
        output(
            "example_files",
            type=Text,
            description="按需更新的 examples/*.md，用于承载不适合放入主 SKILL.md 的复杂语法示例。",
        ),
        output(
            "review_notes",
            type=Text,
            description="审查 DSL contract、frontmatter、资源、调用标记和验证规则时发现的问题。",
        ),
        output(
            "validation_evidence",
            type=Text,
            description="语法解析、diff check、覆盖检查或人工审查结果。",
        ),
    ],
)

resources(
    scripts=[
        script(
            "scripts/validate_contract.py",
            purpose="机械验证 SKILL.md 中的 Python Skill Contract DSL：code block 数量、AST 语法、DSL API、frontmatter name、resources 路径和 call_* 位置。",
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
            "SKILL.md",
            purpose="本 Skill 的自举目标和主契约；当用户要求 dogfood、自举或完全 DSL 化时必须读取。",
            when="审查或修改 create-dsl-skills 自身",
            read_strategy="always",
        ),
        reference(
            "references/contract.pyi",
            purpose="DSL 的规范本体；所有函数、参数、类型和静态期望以此文件为准。",
            when="开始编写、重写、审查或自举任何 contract block 之前",
            read_strategy="always",
        ),
        reference(
            "examples/resources-and-calls.md",
            purpose="resources、environment、tools、call_*、validation 和 check 示例。",
            when="Skill 需要脚本、参考资料、工具调用、MCP、验证命令或环境假设",
        ),
        reference(
            "examples/cli-backed-skill.md",
            purpose="简单 CLI-backed Skill 的 compact contract 模板；适合一个 CLI、一个 reference、少量安全边界的 Skill。",
            when="Skill 主要包装一个脚本或 CLI，且没有复杂审查词汇、状态机或多阶段工作流",
        ),
        reference(
            "examples/decisions-modes-safety.md",
            purpose="decision、decision_rules、modes、failure_modes、fallback_strategy、safety_policy 和审批示例。",
            when="Skill 有模式、分支、fallback、安全边界或用户审批",
        ),
        reference(
            "examples/graph-workflow.md",
            purpose="workflow_graph、node、edge、retry、join、termination、human_input 和 MCP 调用示例。",
            when="线性 workflow 无法表达 DAG、并行、join、重试或显式终止",
        ),
        reference(
            "examples/iteration-aggregation.md",
            purpose="loop、map_each、reduce、failure_policy 和聚合示例。",
            when="Skill 需要迭代、批量评估、多 case 检查或聚合结果",
        ),
        reference(
            "examples/human-review-vocabulary.md",
            purpose="state_machine、call_skill、severity_levels、review_dimensions 和 validation 示例。",
            when="Skill 需要持久人工审查状态、委托其他 Skill 或定义审查词汇",
        ),
    ],
)

environment(
    commands=["python3", "rg", "git"],
    network="not_required",
    filesystem="workspace",
)

tools(
    required=["python3"],
    preferred=["rg", "git diff --check"],
    forbidden=["git commit without explicit user request", "destructive git commands"],
)

workflow(
    [
        step("choose_density", "选择 contract 密度：简单脚本型、单 CLI、少量安全边界默认 compact；复杂流程、审查词汇、状态机、教学型 Skill 才用 full。", reads=["skill_task", "source_map", "behavior_inventory", "contract_density"], writes=["density"]),
        step("draft_contract", "基于新需求或既有行为库存定义 activation、interface、resources、behavior shape、call markers、safety 和 validation。", reads=["source_map", "behavior_inventory", "density"], writes=["contract_draft"]),
        step("compress_contract", "写入前压缩去重：如果信息已在 modes、workflow、safety_policy、quality_bar 或 validation 中表达，不要再复制到 decision_rules、failure_modes、output_format 或 examples。", reads=["density", "contract_draft"], writes=["contract_draft"]),
        step("write_skill", "生成 frontmatter 和一个 Python DSL contract block；Markdown prose 只保留用户明确要求的非行为性说明。", produces=["skill_markdown", "frontmatter_description"]),
        step(
            "run_mechanical_validation",
            f"""
            写入后运行内置验证脚本；这只证明机械结构正确，不等于语义审查通过。
            使用 {call_script(
                "scripts/validate_contract.py",
                how="从当前 Skill 目录执行；传入目标 Skill 目录，必要时加 --examples 解析 examples/*.md",
                expect="JSON mechanical validation report with ok=true",
                on_failure="报告失败项，不提交，不把机械验证失败说成成功",
            )}。
            """,
            produces=["validation_evidence"],
        ),
        step("run_semantic_review", "再按 quality_bar、validation checks、review_dimensions 和用户约束做语义审查。", produces=["review_notes"]),
    ],
    name="build_contract",
)

modes(
    [
        mode(
            "create",
            trigger="用户要创建新的 DSL-backed Skill",
            workflow=[
                step("read_spec", "读取 references/contract.pyi，确认可用 API、类型和静态审查期望。", writes=["dsl_api"]),
                step("gather_sources", "读取用户给出的文档、脚本、现有说明或目标目录；只加载与当前 Skill 行为相关的材料。", reads=["skill_task", "source_material"], writes=["source_map"]),
                step("build_from_sources", "继续执行 build_contract：选择密度、起草 contract、压缩、写入、机械验证和语义审查。", reads=["source_map"], produces=["skill_markdown", "frontmatter_description", "review_notes", "validation_evidence"]),
            ],
            description="从需求或资料创建新的 DSL Skill。",
        ),
        mode(
            "rewrite",
            trigger="用户要把现有 Skill 改写为 DSL contract",
            workflow=[
                step("load_target", "读取目标 SKILL.md、references、scripts、assets 和 manifest 中与触发或行为相关的内容。", reads=["target_skill"], writes=["target_surface"]),
                step("preserve_behavior", "提取现有触发边界、输入输出、工作流、资源、脚本接口、失败路径和安全约束。", reads=["target_surface"], writes=["behavior_inventory"]),
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
                step("build_from_inventory", "继续执行 build_contract：选择密度、翻译行为库存、压缩、写入、机械验证和语义审查；明确单文件 rewrite 不需要重复确认。", reads=["behavior_inventory"], produces=["skill_markdown", "frontmatter_description", "review_notes", "validation_evidence"]),
            ],
            description="把已有 Skill 改写为 DSL 契约形式。",
            forbidden=["silent behavior deletion", "scope expansion without user approval"],
        ),
        mode(
            "review",
            trigger="用户要审查 DSL-backed Skill、contract block 或 contract.pyi 一致性",
            workflow=[
                step("load_review_scope", "读取目标 Skill、contract.pyi 和被引用的 examples/references；不要批量加载无关资源。", writes=["review_scope"]),
                step("check_activation", "检查 frontmatter description 是否能在正文加载前正确触发，并且不宽于 activate_when。", reads=["review_scope"], writes=["findings"]),
                step("check_contract_api", "检查 contract 只使用 references/contract.pyi 中存在的函数、参数和字面量。", reads=["review_scope"], writes=["findings"]),
                step("check_behavior_completeness", "检查 required inputs/outputs 是否被步骤、节点、规则或模式消费和产出。", reads=["review_scope"], writes=["findings"]),
                step("check_calls_and_gates", "检查 call_* 是否只嵌入自然语言字符串；检查 ask_user、human_input、ask_when_uncertain、approval_required 等结构化用户闸门是否被保留。", reads=["review_scope"], writes=["findings"]),
                step("check_taste", "按 review_dimensions 执行品味审查；每个 finding 必须指出违反的具体维度、证据和对 Agent 执行的影响。", reads=["review_scope"], writes=["findings"]),
                step("report_review", "按严重级别输出证据、Agent 影响和具体修复建议；除非用户要求，不直接改文件。", produces=["review_notes"]),
            ],
            description="审查 DSL Skill 的触发、接口、控制流、调用标记、验证质量和品味审查维度。",
            forbidden=["editing during review-only requests"],
        ),
        mode(
            "self_bootstrap",
            trigger="用户要求本 SKILL.md 完全使用 DSL 编写、自举、dogfood 或中文化",
            workflow=[
                step("load_self_contract", "读取本 SKILL.md、references/contract.pyi 和 examples/*.md；把 contract.pyi 作为规范本体。", writes=["self_surface"]),
                step("remove_prose_guide", "将正文收敛为 frontmatter 后的单个 Python DSL contract block；把原 prose guide 规则转写进 DSL 参数字符串。", reads=["self_surface"], writes=["self_contract_draft"]),
                step("preserve_progressive_disclosure", "主文件只放核心 contract；复杂语法和示例继续放 examples/*.md，并在 resources 中说明何时读取。", reads=["self_contract_draft"], writes=["self_contract_draft"]),
                step("encode_self_modes", "明确 create、rewrite、review、self_bootstrap 四种模式及其边界。", reads=["self_contract_draft"], writes=["self_contract_draft"]),
                step("compress_contract", "写入前压缩去重：主文件保留核心规则和核心例子，避免把 examples/*.md 的全部内容复制进 SKILL.md。", reads=["self_contract_draft"], writes=["self_contract_draft"]),
                step(
                    "validate_python_shape",
                    f"""
                    使用内置验证脚本验证 contract.pyi、SKILL.md 和 examples/*.md。
                    使用 {call_script(
                        "scripts/validate_contract.py",
                        how="在 create-dsl-skills 目录执行 python3 scripts/validate_contract.py . --examples",
                        expect="JSON validation report with ok=true",
                        on_failure="报告解析失败位置，不提交、不继续扩大修改",
                    )}。
                    """,
                    produces=["validation_evidence"],
                ),
                step(
                    "validate_text_surface",
                    f"""
                    检查是否还残留与 DSL contract 重复的主文件 prose guide。
                    使用 {call_tool(
                        "rg",
                        how="搜索 SKILL.md 中 Core Rule、Workflow、Writing Rules、Review Checklist 等旧 prose section 标题",
                        expect="除 frontmatter 和 Python code fence 外，不存在旧 guide section",
                        on_failure="报告残留标题并等待用户决定是否继续清理",
                    )}。
                    """,
                    produces=["validation_evidence"],
                ),
                step("report_self_bootstrap", "报告 self-bootstrap 改动、验证结果、保留的 examples 和未提交状态。", produces=["review_notes", "validation_evidence"]),
            ],
            description="用本 DSL 重写本 Skill，使 SKILL.md 正文由 DSL contract 承载。",
            forbidden=["modifying contract.pyi signatures without explicit user request", "committing without explicit user request"],
        ),
    ],
    default="create",
    selection="按用户请求选择模式；如果目标是本 Skill 自身或用户说自举、dogfood、完全 DSL 化、中文化，选择 self_bootstrap。",
)

decision_rules([
    when("Skill 是简单脚本型、单 CLI、单 reference、少量安全边界或 lark-notify 这类通知/包装工具", then="选择 compact 密度"),
    when("Skill 需要教学型示例、审查词汇、多 mode、状态机、复杂图工作流或跨 Skill 委托", then="选择 full 密度"),
    when("密度为 compact", then="只保留 identity、activation、inputs/outputs、resources、workflow 或 modes、safety_policy、quality_bar 和 validation"),
    when("密度为 full", then="可以加入 activation_examples、examples、output_format、severity_levels、review_dimensions 和高级 references；但主文件只保留当前任务真正需要的块"),
    when("任务主要是线性创建或改写", then="使用 workflow 或 mode 内联 workflow 表达，不要引入 workflow_graph"),
    when("任务需要 DAG、并行、join、重试或非线性终止", then="读取 examples/graph-workflow.md 并使用 workflow_graph"),
    when("任务需要持续人工审查、批准或生命周期状态", then="读取 examples/human-review-vocabulary.md 并使用 state_machine"),
    when("任务需要重复评估多个 case", then="读取 examples/iteration-aggregation.md 并使用 loop、map_each 或 reduce"),
    when("Skill 是 CLI-backed compact 形态", then="读取 examples/cli-backed-skill.md，不套用 full 档通用模板"),
    prefer("frontmatter description derived from activate_when", over="generic marketing wording", reason="description 是正文加载前的主要触发入口"),
    prefer("examples/*.md on demand", over="copying every advanced example into SKILL.md", reason="保持主 Skill 紧凑并符合 progressive disclosure"),
    prefer("compact", over="full", reason="除非复杂性真实存在，否则默认避免生成偏重 contract"),
])

failure_modes([
    when("required input missing", then="只询问缺失输入，不发散到完整需求访谈"),
    when("contract.pyi lacks a specialized construct", then="用 step、when、quality_bar 或现有 DSL 函数的自然语言参数表达"),
    when("target resource path is missing", then="报告缺失路径并继续处理可用上下文"),
    when("validation fails", then="报告具体失败文件、代码块或规则；不要把失败隐藏成成功"),
    when("user requested review only", then="保持只读并返回 findings"),
])

fallback_strategy(
    [
        when("deterministic validation tool is unavailable", then="执行人工静态审查并明确说明验证缺口"),
        when("advanced example file is unavailable", then="只使用 contract.pyi 和当前 SKILL.md，避免编造示例 API"),
        when("fallback path would edit or overwrite files", then="先请求用户明确批准"),
    ],
    require_user_approval="when_destructive",
)

safety_policy(
    must=[
        "contract.pyi 是 DSL 规范本体；SKILL.md 不得发明 contract.pyi 中没有的 API",
        "frontmatter description 必须与 activate_when 和 do_not_activate_when 对齐",
        "修改现有 Skill 时必须说明保留、删除和新增的行为边界",
        "call_* marker 只用于自然语言字符串中的具体调用点",
        "结构化用户输入闸门必须使用固定参数表达",
    ],
    must_not=[
        "不要把 call_human 当成 ask_user、human_input 或 approval_required 的替代品",
        "不要在 review-only 请求中编辑文件",
        "不要自行提交、推送或执行破坏性 git 命令",
        "不要为了自举而把所有 examples 内容复制进 SKILL.md",
    ],
    approval_required=[
        "目标文件不明确或会修改多个文件",
        "修改 references/contract.pyi 的函数签名或字面量集合",
        "删除 examples/*.md",
        "真实执行会发送通知、调用 webhook、写入外部系统或产生费用",
        "提交 git commit",
    ],
)

quality_bar(
    must=[
        "SKILL.md 的 frontmatter description 能独立触发正确 Skill",
        "正文行为由一个 Python DSL contract block 承载",
        "contract 只使用 references/contract.pyi 中存在的函数和参数",
        "required inputs、required outputs、workflow/modes 和 validation 互相可追踪",
        "resources 声明每个 reference 的用途和加载时机",
        "自举模式能说明如何审查和改写本 SKILL.md 自身",
        "写入前必须经过 choose_density 和 compress_contract，避免简单 Skill 膨胀",
        "语义审查必须覆盖 review_dimensions 中定义的品味审查规则",
    ],
    should=[
        "简单 Skill 只使用 workflow、decision_rules、quality_bar 和 validation",
        "复杂控制流按需加载 examples/*.md",
        "主 SKILL.md 保持紧凑，复杂语法放入 examples/*.md",
        "中文 Skill 使用中文说明，除函数名、文件名、工具名和稳定字面量外不混用英文",
        "最终回复说明验证证据和未提交状态",
    ],
    must_not=[
        "不要让 Markdown prose 定义 contract 中不存在的行为",
        "不要让 frontmatter description 比 activate_when 更宽",
        "不要为了形式化而删除用户需要的自然语言上下文",
    ],
)

review_dimensions([
    "一致性：frontmatter、activate_when、do_not_activate_when、modes、workflow、resources 和 examples 不得互相冲突；同一行为只能有一个权威表达位置。",
    "可执行清晰度：Agent 读完 contract 后必须知道下一步读什么、问什么、运行什么、写什么；不得出现多条同级路径但没有选择规则。",
    "简洁密度：简单脚本型 Skill 不得套用 full 模板；同一规则不得在 modes、decision_rules、failure_modes、quality_bar、validation 或 examples 中重复展开。",
    "接口完整性：required inputs/outputs、script/reference/tool/call marker、用户审批点和失败路径必须能追踪到具体步骤或验证项。",
    "引导强度：关键边界必须写成明确禁止、优先级或选择规则；不得依赖弱提示、泛泛价值判断或让 Agent 自行补全隐含流程。",
    "用户参与可见性：需要询问用户、征求同意、等待人工审查或真实外部执行时，必须在结构化参数或具体自然语言调用点中显式出现。",
    "结构合法性：主 SKILL.md 只承载核心 contract 和核心例子；复杂语法放入按需 examples，Markdown prose 不得在 contract 外新增行为。",
    "开闭原则: 只对 Agent 暴露公开接口，隐藏内部实现细节、开发者信息"
])

validation(
    [
        check("mechanical_python_contract_valid", "机械检查：contract.pyi、SKILL.md 和 examples/*.md 可被 AST 解析，且主 contract 只使用 contract.pyi 中存在的 DSL API。"),
        check("mechanical_identity_and_resources_valid", "机械检查：主 contract 恰好一个 skill(...)，frontmatter name 与 skill(name=...) 一致，声明的 resources 路径存在。"),
        check("mechanical_call_markers_valid", "机械检查：call_* marker 只出现在自然语言 f-string 中，并包含具体 how。"),
        check("semantic_trigger_boundary_valid", "语义审查：frontmatter description 不宽于 activate_when，且不与 do_not_activate_when 冲突。"),
        check("semantic_density_and_compression_valid", "语义审查：按 compact/full 选择密度，写入前执行 compress_contract，且 modes、safety_policy、quality_bar、decision_rules、failure_modes、examples 不重复表达同一规则。"),
        check("semantic_interface_and_behavior_closed", "语义审查：required inputs/outputs 被 workflow 或 modes 消费/产出，所有分支、循环、图工作流和状态机都有输出、停止条件或用户问题。"),
        check("semantic_user_gates_preserved", "语义审查：结构化用户输入闸门不被 call_human 替代，contract-only 约束只在 self_bootstrap 或用户明确要求时启用。"),
        check("semantic_taste_review", "语义审查：review_dimensions 中每个品味维度都被检查，finding 必须说明违反的维度、证据和 Agent 影响。"),
    ],
    on_failure="report",
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
    example(
        user="frontmatter description 应该怎么写？",
        expected_behavior="""
        frontmatter description 是正文加载前的触发摘要，应从 skill(..., purpose=...)、
        activate_when(...) 和 do_not_activate_when(...) 推导出来。

        示例：

        description: Write or rewrite agent skills using the Python Skill Contract DSL. Use when the user wants a SKILL.md with a formal Python contract block, asks to encode a skill as DSL, or asks for the Skill Contract DSL spec/guide.

        规则：
        - 第一部分说明 Skill 的可复用能力。
        - 第二部分用 Use when 或等价中文列出具体用户意图、制品、关键词或 workflow 名称。
        - 不要比 activate_when 更宽，不要与 do_not_activate_when 冲突。
        - 避免只有 helps with、improves workflow 这类泛化描述。
        """,
        output="frontmatter_description",
    ),
    example(
        user="如何在自然语言字符串里标记脚本调用？",
        expected_behavior="""
        在实际调用点嵌入 call_script(...)，不要把 call_* 当成 resource 声明：

        workflow([
            step(
                "scan_references",
                f\"\"\"
                Inspect the target skill and build a reference map.
                If deterministic scanning is useful, run {call_script(
                    "scripts/scan_refs.py",
                    how="pass the skill root path and read JSON output describing referenced files",
                    expect="a JSON reference graph",
                    on_failure="continue manually and report that deterministic scanning was unavailable",
                )}.
                \"\"\",
            ),
        ])
        """,
        output="embedded_call_example",
    ),
    example(
        user="给我一个线性 Skill 的 DSL 示例",
        expected_behavior="""
        线性 Skill 使用 workflow([...])，示例：

        skill(
            name="skill-audit",
            purpose="Review agent skills from an agent-usage perspective.",
            summary="Find trigger, workflow, ambiguity, and resource defects.",
        )

        metadata(
            short_description="Review SKILL.md files and referenced resources.",
            tags=["skills", "review", "agent-instructions"],
        )

        activate_when([
            "user asks to review, audit, critique, improve, or rewrite a skill",
            "user provides a SKILL.md file, skill directory, or slash-command instructions",
        ], strength="strong")

        do_not_activate_when([
            "user asks to execute the target skill rather than review it",
        ])

        inputs(
            required=[
                input("target_skill", type=File | Directory | Text),
            ],
        )

        outputs(
            required=[
                output("review_report", type=Text, format="severity_grouped_markdown"),
            ],
        )

        workflow([
            step("load_scope", "Read the target skill and referenced files.", writes=["scope"]),
            step("analyze", "Find activation, interface, workflow, and resource defects.", reads=["scope"], writes=["issues"]),
            step("report", "Return severity-ranked findings and concrete fixes.", reads=["issues"], produces=["review_report"]),
        ])

        quality_bar(
            must=["Findings are evidence-backed and actionable."],
            must_not=["Do not rewrite the skill unless the user requested it."],
        )
        """,
        output="linear_skill_example",
    ),
    example(
        user="给我一个脚本或工具辅助 Skill 的 DSL 示例",
        expected_behavior="""
        脚本先在 resources(...) 中声明，再在 workflow 的自然语言字符串中用 call_script(...) 标记调用：

        resources(
            scripts=[
                script(
                    "scripts/render_docx.py",
                    purpose="Render a docx into page images for visual review.",
                    interface="python scripts/render_docx.py <input.docx> --out <dir>",
                    run_help_first=True,
                ),
            ],
        )

        workflow([
            step(
                "render_pages",
                f\"\"\"
                Render before judging layout quality.
                Use {call_script(
                    "scripts/render_docx.py",
                    how="pass the generated docx path and inspect the produced page images",
                    expect="one image per page",
                    on_failure="report that visual verification could not be completed",
                )}.
                \"\"\",
            ),
        ])
        """,
        output="script_assisted_example",
    ),
    example(
        user="给我一个分支或审批 Skill 的 DSL 示例",
        expected_behavior="""
        分支、模式和审批应同时表达控制流和用户闸门：

        decision_rules([
            when("target skill has no contract block", then="draft a new contract", else_="review existing contract"),
            prefer("workflow", over="workflow_graph", reason="linear workflows are easier for agents to follow"),
        ])

        modes(
            [
                mode("review", trigger="user asks for critique or audit", workflow="review_workflow"),
                mode("rewrite", trigger="user explicitly asks to patch the skill", workflow="rewrite_workflow"),
            ],
            default="review",
            selection="Do not switch from review to rewrite unless the user requested edits.",
        )

        workflow([
            step(
                "confirm_edit",
                f\"\"\"
                Before overwriting the skill, request explicit approval.
                Use {call_human(
                    "approve_skill_rewrite",
                    how="show the planned file changes and ask whether to proceed with editing them",
                    expect="explicit approval or rejection",
                    on_failure="stop without editing",
                )}.
                \"\"\",
                ask_user="Confirm whether to overwrite the target skill after reviewing the planned changes.",
            ),
        ])

        safety_policy(
            must=["State when review is read-only."],
            must_not=["Do not edit files during review-only mode."],
            approval_required=["overwrite an existing skill"],
        )
        """,
        output="branching_approval_example",
    ),
    example(
        user="用 DSL 写一个新的 Skill",
        expected_behavior="读取 contract.pyi，选择 create 模式，产出带 frontmatter 和 Python contract block 的 SKILL.md。",
        output="skill_markdown",
    ),
    example(
        user="把这个 SKILL.md 改成 DSL",
        expected_behavior="选择 rewrite 模式，先抽取原行为，再在获得必要批准后改写为 DSL contract。",
        input_files=["SKILL.md"],
        output="skill_markdown",
    ),
    example(
        user="review 这个 contract.pyi 和 SKILL.md 是否一致",
        expected_behavior="选择 review 模式，返回按严重级别组织的 findings，不直接编辑文件。",
        input_files=["SKILL.md", "references/contract.pyi"],
        output="review_notes",
    ),
    example(
        user="让 create-dsl-skills 完全自举，并改成中文",
        expected_behavior="选择 self_bootstrap 模式，把本 SKILL.md 正文收敛为中文 Python DSL contract，并报告验证证据。",
        input_files=["skills/productivity/create-dsl-skills/SKILL.md"],
        output="skill_markdown",
    ),
])
```
