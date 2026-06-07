---
name: migrate-frontend-i18n
description: 编排大型前端项目 i18n 迁移：先确认方案，再规划切片、冻结源语言基线、按需多智能体实施、建立 i18n 反馈链路、完成视觉/文案验收并沉淀规范。用于前端国际化、语言包迁移、locale 方案、硬编码文案清理和多模块迁移。
---

```python
from skill_contract import *

skill(name="migrate-frontend-i18n", purpose="为前端项目编排自适应 i18n 迁移，按方案、规划、基线、实现、验收、收尾推进。")

activate_when([
    "用户要求对前端项目做国际化、i18n、本地化或语言包迁移",
    "用户要求清理前端硬编码文案并接入 locale、翻译函数、消息目录或 i18n 框架",
    "用户要求为大型前端项目设计 i18n 迁移计划、验收方式或多智能体协作流程",
    "用户要求验证翻译后的前端页面是否出现溢出、遮挡、换行、截断或视觉回归",
])

do_not_activate_when([
    "用户只要求翻译普通文本或文档，且不涉及前端代码迁移",
    "用户只要求解释 i18n 库接口，且没有要求改造项目或设计迁移流程",
    "用户要求后端、移动端、图片或文档本地化，且不涉及浏览器前端项目",
    "用户只要求普通 UI 视觉还原或样式修复，且没有 i18n 迁移目标",
])

environment(
    commands=["rg", "git", "npm", "pnpm", "yarn"],
    dependencies=["只有项目选择浏览器验收时才需要 Browser、Chrome 或 Playwright 能力"],
    network="optional",
    filesystem="workspace",
)

I18N_PLANNING_FILE_TEMPLATE = """
# 前端 i18n 迁移规划

## 来源清单（Source Manifest）
- 原始需求：
- 已批准方案：
- 已读取项目文件/目录：
- 摸排来源：
- 关键人工决策：
- 后续智能体必须重读的文件：

## 总体计划
- 源语言：
- 首个目标语言：
- 范围：
- 非范围：
- i18n 技术选择：
- locale 识别方式：
- 语言包维护和加载策略：
- 共享/通用文案策略：
- 翻译质量规则：
- 并发和 worktree 策略：
- 暂停线：

## 验证矩阵
| 类型 | 命令或方式 | 覆盖范围 | 通过标准 | 证据位置 | 失败处理 |
| --- | --- | --- | --- | --- | --- |
| 静态检查 |  |  |  |  |  |
| 构建 |  |  |  |  |  |
| 回归测试 |  |  |  |  |  |
| i18n 检查 |  |  |  |  |  |
| 浏览器验收 |  | 源语言和目标语言的关键页面/状态 | 无溢出、遮挡、截断、异常换行和源语言回归 |  |  |

## 基线冻结计划
- 源语言基线范围：
- 关键页面/状态：
- 需要截图或浏览器证据的点：
- 需要记录的命令：
- 已知问题：
- 无法覆盖项：
- 基线批准要求：

## Slice 总览
| Slice ID | 标题 | 类型 | Owner Agent | Blocked by | 涉及文件数 | 门禁 | 状态 |
| --- | --- | --- | --- | --- | --- | --- | --- |

## Slice 详细任务
### Slice <id>: <title>
- 请求：
- Owner Agent：
- Blocked by：
- 目标：
- 非目标：
- 允许修改范围：
- 只读参考：
- 需要返回：

#### 文件级 TODO
| 文件路径 | 操作 | 当前文案/问题 | 目标 key/namespace | 目标文案或决策 | 验收点 | 状态 |
| --- | --- | --- | --- | --- | --- | --- |

#### Slice 门禁
- [ ] 修改范围只包含允许文件
- [ ] 翻译质量满足规划规则
- [ ] 共享文案边界未越界
- [ ] i18n 反馈链路通过或记录缺口
- [ ] lint/test/build 中本 slice 需要的项已通过或记录原因
- [ ] 视觉风险已标记或验证
- [ ] 交接说明包含变更、证据、风险和未决问题

## 共享文案和术语决策
| 源文案/概念 | 使用场景 | 决策 | key/namespace | 目标文案 | 原因 | 状态 |
| --- | --- | --- | --- | --- | --- | --- |

## i18n 反馈链路计划
- 硬编码新增扫描：
- 缺失 key 检查：
- 未注册 namespace 检查：
- 未使用或未定义 key 检查：
- 插值/复数/ICU 结构检查：
- 运行时缺失 key 反馈：
- CI 或本地命令接入：

## 执行状态
| Slice ID | 状态 | 最新负责人 | 最新证据 | 阻塞 |
| --- | --- | --- | --- | --- |

## 开放问题和风险
-
"""

agents([
    agent(
        "manager",
        purpose="维护阶段闸门、项目规则、切片边界、集成状态和来源清单。",
        responsibilities=["只在方案、规划、基线和验收批准后推进下一阶段", "派遣切片、审查结果、协调依赖，把切片问题退回原负责人", "记录风险、暂停线、未完成范围和交接说明"],
        permissions=agent_permissions(filesystem="workspace_write", tools=["rg", "git", "npm", "pnpm", "yarn"], can_edit=True),
        outputs=["strategy_approval", "execution_plan", "planning_file", "planning_approval", "baseline_approval", "implementation_summary", "acceptance_approval"],
        forbidden=["绕过用户批准闸门", "静默接手失败的业务切片"],
    ),
    agent(
        "architect",
        purpose="基于项目事实提出 i18n 技术方案和关键决策。",
        responsibilities=["识别前端框架、渲染方式、路由、构建、测试和已有 i18n 设施", "提出 locale 识别、语言包加载、回退、键名和命名空间策略候选"],
        permissions=agent_permissions(filesystem="read_only", tools=["rg", "git"], can_edit=False),
        outputs=["current_state_summary", "migration_charter"],
        forbidden=["未确认前替用户做最终技术决策", "修改代码"],
    ),
    agent(
        "scout",
        purpose="只读摸排指定范围内的文案、动态文案、视觉风险和共享候选。",
        responsibilities=["按项目生成的任务说明扫描指定模块、路由或业务域", "输出源码路径、文案上下文、风险、共享候选和未确认问题"],
        permissions=agent_permissions(filesystem="read_only", tools=["rg"], can_edit=False),
        outputs=["inventory_findings"],
        forbidden=["编辑文件", "生成翻译或决定最终键名策略"],
    ),
    agent(
        "evidence_qa",
        purpose="冻结改造前源语言基线，并在改造后采集视觉和文案验收证据。",
        responsibilities=["记录源语言关键页面、状态、命令结果、截图证据或无法覆盖原因", "对照冻结基线检查源语言回归、目标语言可用性、溢出、遮挡、截断、异常换行和误译"],
        permissions=agent_permissions(filesystem="read_only", tools=["rg", "git", "npm", "pnpm", "yarn", "Browser", "Chrome", "Playwright"], can_edit=False),
        outputs=["baseline_snapshot", "baseline_risks", "visual_i18n_findings"],
        forbidden=["改造业务代码", "把无法采集的页面说成已覆盖"],
    ),
    agent(
        "copy_owner",
        purpose="定义并审查翻译质量、术语、语气、长度预算和共享文案边界。",
        responsibilities=["确保目标文案语义匹配源语言、符合目标语言本地表达、避免机械翻译", "识别术语、语气和长度风险，保守判定共享文案，歧义交回确认"],
        permissions=agent_permissions(filesystem="read_only", tools=["rg"], can_edit=False),
        outputs=["translation_quality_rules", "shared_string_decisions", "translation_review_findings"],
        forbidden=["机械逐字翻译", "忽略 UI 容器长度风险", "语义不清时自行定稿核心术语"],
    ),
    agent(
        "framework_builder",
        purpose="实现已批准的 i18n 基础设施和反馈链路切片。",
        responsibilities=["接入或调整 i18n 基础设施、locale 解析、语言包加载、回退、共享/通用语言包边界和类型/测试辅助", "建立项目选择的反馈链路：硬编码拦截、缺失/未使用/未定义键名、插值/复数/ICU 结构校验、运行时缺失键名报警或等价机制"],
        permissions=agent_permissions(filesystem="workspace_write", tools=["rg", "git", "npm", "pnpm", "yarn"], can_edit=True),
        outputs=["framework_changes", "i18n_feedback_loop", "validation_evidence"],
        forbidden=["迁移大批业务模块", "改变未批准运行时策略", "声称未接入的检查已具备"],
    ),
    agent(
        "module_migrator",
        purpose="在一个已批准切片内迁移模块文案并自证质量。",
        responsibilities=["只修改切片允许范围内的源码和语言包区域", "使用已批准的调用方式、键名规则、翻译质量规则和反馈链路"],
        permissions=agent_permissions(filesystem="workspace_write", tools=["rg", "git", "npm", "pnpm", "yarn"], can_edit=True),
        outputs=["slice_results", "validation_evidence"],
        forbidden=["改出切片边界", "重定义全局 i18n 策略", "默认迁移多个目标语言"],
    ),
    agent(
        "reviewer",
        purpose="只读审查切片和验收结果是否满足范围、基线、翻译质量和验证要求。",
        responsibilities=["检查切片范围、键名/语言包策略、反馈链路、源语言基线回归和验证证据", "把切片问题退回原负责人，把跨切片问题交给管理者裁决"],
        permissions=agent_permissions(filesystem="read_only", tools=["rg", "git"], can_edit=False),
        outputs=["review_evidence", "acceptance_report"],
        forbidden=["替迁移者大改代码", "通过缺少验证证据的切片"],
    ),
    agent(
        "docs_owner",
        purpose="把已验收的项目决策沉淀为维护规范和智能体入口。",
        responsibilities=["记录如何新增文案、维护语言包、运行反馈链路、处理缺失键名和执行验收", "更新 AGENTS.md、CLAUDE.md 或等价入口，并保留来源清单"],
        permissions=agent_permissions(filesystem="workspace_write", tools=["rg", "git"], can_edit=True),
        outputs=["i18n_operating_guide", "agent_entry_updates", "source_manifest"],
        forbidden=["编写脱离项目真实选择的泛化教程", "遗漏验收缺口和开放风险"],
    ),
])

modes([
    mode(
        "strategy",
        trigger="迁移方案、技术选型、语言策略、范围或成功标准尚未经过用户确认",
        inputs=[
            input("project_surface", type=Directory | NaturalLanguage, description="要迁移的前端项目、包、路由范围或用户描述。"),
            input("migration_intent", type=NaturalLanguage, description="用户希望达成的 i18n 迁移目标。"),
            input("user_constraints", type=Text, description="目标语言、源语言、技术偏好、范围、时间、验收或禁止事项。", required=False),
        ],
        outputs=[output("current_state_summary"), output("migration_charter"), output("strategy_approval")],
        workflow=[
            step("explore_project", "读取项目结构、包配置、前端入口、路由、已有 i18n 设施、测试命令和智能体指南。", actor="architect", reads=["project_surface", "migration_intent"], writes=["current_state_summary"]),
            step("draft_charter", "生成迁移章程：范围、非目标、技术选型、locale、语言包、验收目标和风险。", actor="architect", reads=["current_state_summary", "user_constraints"], writes=["migration_charter"]),
            step("request_strategy_gate", f"展示迁移章程并等待用户批准后才能进入详细规划。使用 {call_human('approve_i18n_strategy', how='请用户确认方案、范围、目标语言、源语言、技术选择和不做范围', expect='明确批准、修改意见或停止决定', on_failure='停在方案阶段')}。", actor="manager", reads=["migration_charter"], writes=["strategy_approval"], ask_user="确认 i18n 迁移章程是否可以进入详细规划。"),
        ],
        forbidden=["未经方案批准就实现", "读取项目前预设项目规则"],
    ),
    mode(
        "planning",
        trigger="方案已批准，需要把大型迁移拆成摸排、角色、切片和验收计划",
        inputs=[
            input("project_surface", type=Directory | NaturalLanguage, description="已批准方案对应的前端项目或范围。"),
            input("migration_charter", type=Text, description="已批准的项目专属迁移方案。"),
            input("planning_constraints", type=Text, description="用户对并发、工作树、模块边界、产物位置或验收强度的约束。", required=False),
        ],
        outputs=[
            output("inventory_findings"),
            output("translation_quality_rules"),
            output("shared_string_decisions"),
            output("execution_plan"),
            output(
                "planning_file",
                type=File,
                description="写入项目工作区的 i18n 迁移规划文件，作为后续基线和实现任务清单。",
                template=I18N_PLANNING_FILE_TEMPLATE,
                required_sections=["来源清单（Source Manifest）", "总体计划", "验证矩阵", "基线冻结计划", "Slice 总览", "Slice 详细任务", "文件级 TODO", "Slice 门禁", "共享文案和术语决策", "i18n 反馈链路计划", "执行状态", "开放问题和风险"],
            ),
            output("planning_approval"),
        ],
        workflow=[
            step("define_project_rules", "把迁移章程转成本次迁移的临时项目规则：角色、产物、测试、浏览器验收、基线、翻译质量、反馈链路和来源清单。", actor="manager", reads=["project_surface", "migration_charter", "planning_constraints"], writes=["project_rules"]),
            step("define_translation_quality", "生成翻译质量规则：语义匹配、本地表达、非机械翻译、术语/语气、长度预算和视觉风险。", actor="copy_owner", reads=["migration_charter", "project_rules"], writes=["translation_quality_rules"]),
            step("run_read_only_inventory", f"项目规模较大或模块边界不清时派遣只读摸排；小项目可由当前智能体顺序完成。使用 {call_subagent('scout', '只读扫描指定模块的前端文案、动态文案、视觉风险和共享候选', how='禁止改代码；返回源码路径、上下文、风险、共享候选和未确认问题', context='项目规则、指定模块范围、迁移章程和必要源码路径', effort='low', expect='可汇总的只读摸排结果', on_failure='记录未完成范围并请求缩小范围或保守静态摸排')}。", actor="scout", reads=["project_rules"], writes=["inventory_findings"]),
            step("decide_shared_strings", "基于摸排和翻译质量规则，保守决定哪些文案可共享，哪些必须保持模块局部。", actor="copy_owner", reads=["inventory_findings", "translation_quality_rules"], writes=["shared_string_decisions"]),
            step("synthesize_execution_plan", "按 I18N_PLANNING_FILE_TEMPLATE 生成并写入规划文件；每个 slice 必须有可执行请求、门禁、允许修改范围和文件级 TODO。路径未确定的项只能标为探索 TODO，不能派发为实现 TODO。", actor="manager", reads=["inventory_findings", "translation_quality_rules", "shared_string_decisions"], writes=["execution_plan", "planning_file"]),
            step("request_planning_gate", f"展示详细计划和规划文件路径，等待用户批准后才能冻结基线、创建工作树、派遣迁移者或修改代码。使用 {call_human('approve_i18n_execution_plan', how='请用户确认规划文件、切片、依赖、文件级 TODO、并发方式、角色边界、基线方式、验收路径和不做范围', expect='明确批准、修改意见或停止决定', on_failure='停在规划阶段')}。", actor="manager", reads=["execution_plan", "planning_file", "translation_quality_rules"], writes=["planning_approval"], ask_user="确认详细 i18n 执行计划是否可以进入基线冻结。"),
        ],
        forbidden=["未经规划批准就改代码", "摸排员改代码", "忽略项目上下文套用固定模板"],
    ),
    mode(
        "baseline",
        trigger="详细计划已批准，但源语言回归基线尚未冻结",
        inputs=[
            input("project_surface", type=Directory | NaturalLanguage, description="要冻结基线的项目、包、路由或应用入口。"),
            input("execution_plan", type=Text, description="已批准的切片、范围、基线方式和验收计划。"),
            input("planning_file", type=File, description="已批准的 i18n 迁移规划文件。"),
        ],
        outputs=[output("baseline_snapshot"), output("baseline_risks"), output("baseline_approval")],
        workflow=[
            step("collect_baseline", "按规划文件在改造前记录源语言状态：测试/构建能力、关键路由、页面状态、截图证据、已知失败和无法覆盖原因。", actor="evidence_qa", reads=["project_surface", "execution_plan", "planning_file"], writes=["baseline_snapshot", "baseline_risks"]),
            step("request_baseline_gate", f"展示基线冻结结果并等待用户批准后才能开始实现迁移。使用 {call_human('approve_i18n_baseline', how='请用户确认源语言基线、已知失败、无法覆盖范围和后续回归比较依据', expect='明确批准、修改意见或停止决定', on_failure='停在基线阶段')}。", actor="manager", reads=["baseline_snapshot", "baseline_risks"], writes=["baseline_approval"], ask_user="确认改造前源语言基线是否已冻结，可以进入实现。"),
        ],
        forbidden=["冻结基线前改造业务代码", "把无法采集的基线伪装成已覆盖"],
    ),
    mode(
        "implementation",
        trigger="详细计划和源语言基线都已批准，需要按切片实施迁移并集成审查",
        inputs=[
            input("project_surface", type=Directory | NaturalLanguage, description="要实施的项目、包或工作区。"),
            input("execution_plan", type=Text, description="已批准的切片、角色、依赖和验收计划。"),
            input("planning_file", type=File, description="已批准的 i18n 迁移规划文件；实现阶段必须按其中的文件级 TODO 推进。"),
            input("translation_quality_rules", type=Text, description="已批准的翻译质量规则。"),
            input("shared_string_decisions", type=Text, description="已批准的共享文案边界。"),
            input("baseline_snapshot", type=Text, description="改造前冻结的源语言回归基线。"),
        ],
        outputs=[output("i18n_feedback_loop"), output("implementation_summary"), output("review_evidence"), output("translation_review_findings"), output("validation_evidence")],
        workflow=[
            step("prepare_execution", "读取规划文件，准备分支、工作树、任务说明、来源清单、状态清单和冲突协议；不支持多智能体时降级为顺序切片。", actor="manager", reads=["project_surface", "execution_plan", "planning_file", "translation_quality_rules", "shared_string_decisions", "baseline_snapshot"], writes=["execution_state"]),
            step("run_framework_slice", f"如果规划文件包含基础设施切片，派遣框架搭建者。使用 {call_subagent('framework_builder', '完成已批准的 i18n 基础设施和反馈链路切片', how='只传规划文件中的基础设施切片、文件级 TODO、项目规则、冻结基线和验证矩阵；返回基础设施变更、反馈链路和验证证据', context='基础设施源码、规划文件、执行计划、翻译质量规则和冻结基线', effort='medium', expect='framework_changes, i18n_feedback_loop, validation_evidence', on_failure='保留失败证据并阻塞依赖它的模块切片')}。", actor="framework_builder", reads=["execution_state", "planning_file", "translation_quality_rules", "baseline_snapshot"], writes=["framework_changes", "i18n_feedback_loop", "validation_evidence"], when="规划文件包含基础设施或反馈链路切片"),
            step("run_module_slices", f"按规划文件依赖派遣模块迁移者；每个迁移者只负责一个已批准切片。使用 {call_subagent('module_migrator', '完成一个被批准的模块 i18n 迁移切片', how='只传当前切片源码、文件级 TODO、允许修改范围、翻译质量规则、共享文案边界、反馈链路和冻结基线', context='当前切片源码、规划文件、执行计划、翻译质量规则、共享文案边界、反馈链路和冻结基线', effort='medium', expect='slice_results and validation_evidence', on_failure='保留失败证据；阻塞依赖切片；不要由管理者静默接手业务迁移')}。", actor="module_migrator", reads=["execution_state", "planning_file", "translation_quality_rules", "shared_string_decisions", "baseline_snapshot", "i18n_feedback_loop"], writes=["slice_results", "validation_evidence"], when="规划文件包含模块迁移切片"),
            step("review_translation_quality", "检查目标文案是否语义匹配、符合本地表达、避免机械翻译、满足长度预算且不引入明显视觉风险。", actor="copy_owner", reads=["slice_results", "translation_quality_rules", "baseline_snapshot"], writes=["translation_review_findings"]),
            step("review_slice_results", "只读审查切片范围、键名/语言包策略、翻译质量、反馈链路、源语言基线回归、测试证据和冲突。", actor="reviewer", reads=["framework_changes", "i18n_feedback_loop", "slice_results", "translation_review_findings", "baseline_snapshot"], writes=["review_evidence"]),
            step("integrate_reviewed_slices", "根据审查结论集成已通过切片，汇总实现范围、反馈链路状态、返工项和未完成范围。", actor="manager", reads=["review_evidence", "framework_changes", "i18n_feedback_loop", "slice_results"], writes=["implementation_summary"]),
            step("run_project_validation", "运行项目计划中的反馈链路和验证矩阵；无法运行的命令、浏览器或外部依赖必须记录原因和风险。", actor="manager", reads=["implementation_summary", "execution_plan", "translation_quality_rules", "i18n_feedback_loop", "baseline_snapshot"], writes=["validation_evidence"]),
        ],
        forbidden=["未批准扩张范围", "管理者静默重写失败切片", "未经用户明确批准迁移多个目标语言", "无冻结基线就开始改造"],
    ),
    mode(
        "acceptance",
        trigger="实现完成后需要根据冻结基线做源语言回归、目标语言可用性、视觉和文案验收",
        inputs=[
            input("implementation_surface", type=Directory | URL | NaturalLanguage, description="要验收的本地应用、路由、页面、组件或部署入口。"),
            input("execution_plan", type=Text, description="已批准的验收范围、语言、页面、状态和工具选择。"),
            input("translation_quality_rules", type=Text, description="已批准的翻译质量规则。"),
            input("baseline_snapshot", type=Text, description="改造前冻结的源语言回归基线。"),
            input("validation_evidence", type=Text, description="实现阶段已有的 lint、测试、构建、反馈链路和其他验证证据。", required=False),
        ],
        outputs=[output("acceptance_report"), output("visual_i18n_findings"), output("acceptance_approval")],
        workflow=[
            step("run_browser_acceptance", f"使用项目计划选择的工具验收，不强制某个工具。需要用户 Chrome 状态时使用 {call_skill('chrome:control-chrome', how='打开已批准页面和语言状态，对照冻结基线检查关键流程、视觉回归、文案显示和截图证据', mode='compose', expect='浏览器证据', on_failure='改用 Browser/Playwright 或记录真实登录态不可用')}；适合隔离验证时使用 {call_tool('Browser 或 Playwright', how='启动或连接项目应用，切换源语言和目标语言，对照冻结基线检查页面状态和视觉风险', expect='截图、页面证据、控制台错误和覆盖情况', on_failure='执行静态审查并记录验收缺口')}。", actor="evidence_qa", reads=["implementation_surface", "execution_plan", "translation_quality_rules", "baseline_snapshot"], writes=["visual_i18n_findings"]),
            step("classify_acceptance_results", "关键流程阻断、源语言基线回归、lint/test/build 失败、遮挡、严重溢出、异常换行、截断或语义误译必须回到实现阶段修复。", actor="reviewer", reads=["visual_i18n_findings", "validation_evidence", "translation_quality_rules", "baseline_snapshot"], writes=["acceptance_report"]),
            step("request_acceptance_gate", f"展示验收报告、视觉/文案问题和剩余风险，等待用户确认后才能进入收尾。使用 {call_human('approve_i18n_acceptance', how='请用户确认源语言回归、目标语言可用性、翻译质量、视觉问题和剩余风险是否可接受', expect='明确批准、修改意见或停止决定', on_failure='停在验收阶段')}。", actor="manager", reads=["acceptance_report", "visual_i18n_findings"], writes=["acceptance_approval"], ask_user="确认 i18n 迁移验收结果是否可以进入收尾。"),
        ],
        forbidden=["目标语言可用但源语言相对冻结基线回归仍通过验收", "隐藏浏览器或测试缺口"],
    ),
    mode(
        "closeout",
        trigger="迁移已通过验收，需要沉淀项目规范、后续新增文案流程和智能体入口",
        inputs=[
            input("implementation_summary", type=Text, description="最终实现范围和迁移结果。"),
            input("acceptance_report", type=Text, description="最终验收报告和剩余风险。"),
            input("acceptance_approval", type=Text, description="用户已批准的验收结果。"),
            input("project_docs_surface", type=Directory | NaturalLanguage, description="项目文档、AGENTS.md、CLAUDE.md 或开发者指南位置。", required=False),
        ],
        outputs=[output("i18n_operating_guide"), output("agent_entry_updates"), output("source_manifest")],
        workflow=[
            step("write_operating_guide", "基于本项目真实选择写规范；不要写通用 i18n 教程。", actor="docs_owner", reads=["implementation_summary", "acceptance_report", "acceptance_approval", "project_docs_surface"], writes=["i18n_operating_guide"]),
            step("update_agent_entries", "按项目约定更新 AGENTS.md、CLAUDE.md 或等价入口，只保留短规则和指南链接。", actor="docs_owner", reads=["i18n_operating_guide", "project_docs_surface"], writes=["agent_entry_updates"]),
            step("preserve_source_manifest", "对持久交接产物保留来源清单：原始需求、方案、计划、基线、切片、验证证据、关键决策和开放风险。", actor="docs_owner", reads=["implementation_summary", "acceptance_report", "acceptance_approval", "i18n_operating_guide"], writes=["source_manifest"]),
        ],
        forbidden=["编写脱离项目真实选择的泛化文档"],
    ),
], default="strategy", selection="从当前事实选择阶段；如果缺少上一阶段批准或冻结基线，回到最早缺失的人类闸门。")

decision_rules([
    when("缺少方案、规划、基线或验收批准", then="回到对应阶段，不向后推进"),
    when("项目规则未知", then="从项目探索和用户批准的迁移章程生成规则"),
    when("项目很大、涉及多模块或摸排超过单次上下文", then="启用只读摸排和切片派遣"),
    when("项目不需要多智能体执行", then="保留相同闸门，由当前智能体顺序执行切片"),
    when("详细规划尚未写入规划文件", then="停在规划阶段；不要进入基线冻结或实现"),
    when("规划文件缺少模板必填章节、slice 请求、门禁或文件级 TODO", then="停在规划阶段补齐；不要把不完整 slice 派给实现者"),
    when("翻译质量规则尚未生成", then="停在规划阶段，由文案负责人定义语义、本地表达、术语、语气、长度和视觉风险规则"),
    when("i18n 反馈链路尚未建立或登记", then="阻塞依赖它的模块迁移，或在执行计划中明确不适用原因"),
    when("实现后的 lint、测试或构建证据缺失", then="在验收报告中登记缺口；不能声称回归已完整通过"),
    when("首次迁移涉及多个目标语言", then="提示范围风险，并在接受计划前请求明确批准"),
    when("浏览器验收不可用", then="记录缺口并使用静态/测试证据；不要声称视觉验收已通过"),
])

quality_bar(
    must=[
        "方案、详细规划、基线冻结和验收都必须有人类批准闸门。",
        "详细规划必须按模板写入规划文件，包含整体计划、验证矩阵、所有 slice 的文件级 TODO、依赖、允许修改范围、验收证据和来源清单。",
        "每个可实现 slice 必须包含请求、Owner Agent、Blocked by、目标/非目标、允许修改范围、涉及文件、文件级 TODO、门禁和需要返回的证据。",
        "实现前必须冻结源语言基线，记录覆盖范围、已知失败、无法覆盖项和回归比较依据。",
        "项目具体规则必须从项目事实和用户需求生成，不硬编码框架、文件布局、命名空间、键名规则或浏览器工具。",
        "翻译质量规则必须覆盖语义匹配、本地表达、非机械翻译、术语/语气一致、长度预算和视觉风险。",
        "框架切片必须建立或登记本项目 i18n 反馈链路；不适用项必须说明原因。",
        "回归验证必须覆盖 lint、单元/回归测试和 build；无法运行必须记录原因和风险。",
        "首次迁移默认只做一种目标语言，除非用户明确批准更多。",
        "源语言视觉行为是回归基线；目标语言验收不能掩盖源语言回归。",
        "每个被派遣的执行者都有有界任务说明、允许修改范围、预期输出、验证证据和交接说明。",
        "最终文档必须记录实际项目决策、反馈链路运行方式、人工验收缺口和来源清单。",
    ],
    should=[
        "优先沿用项目现有 i18n、路由、测试、包管理器和设计系统约定。",
        "文件很多时使用结构化或半结构化摸排，但具体产物形态由项目决定。",
        "共享翻译键名保持保守，直到重复且稳定的语义被证明。",
    ],
    must_not=[
        "不要在方案、规划和基线批准前改代码。",
        "不要让只读角色编辑文件。",
        "不要让模块迁移者重新定义全局 i18n 策略。",
        "不要接受语义、语气、布局或本地化表达明显错误的机械翻译。",
    ],
)
```
