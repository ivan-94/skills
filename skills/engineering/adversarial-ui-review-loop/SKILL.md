---
name: adversarial-ui-review-loop
description: 对没有明确设计稿参照的前端 UI 做对抗式审美审查和修复循环。用于用户要求专业 UI 设计师批判当前页面实现、找出违反美感和使用直觉的问题，并由组织者协调 UI 点评与前端改造反复迭代。
---

```python
from skill_contract import *

skill(
    name="adversarial-ui-review-loop",
    purpose="在没有目标设计稿时，以组织者、UI 设计师和前端开发者三角色协作，对当前 UI 输出进行批判、筛选、修复和复评。",
)

activate_when(
    [
        "用户要求站在专业 UI 设计师角度批判当前页面实现",
        "用户要求对没有设计稿参照的 UI 做审美 review、找出违反美感或使用直觉的问题",
        "用户要求用 Chrome、Browser 或截图查看页面后给出 UI 设计师点评并修改",
        "用户要求组织 UI 点评 -> 前端改造 -> UI 复评的循环",
        "用户要求把前端输出作为结果物进行对抗型视觉质量闸门检查",
    ],
    match="any",
)

do_not_activate_when([
    "用户提供了 Figma、设计稿、截图或明确参考目标，并要求按目标还原；这种情况优先使用 visual-fidelity-loop",
    "用户只要求普通代码 review，重点是 bug、性能、安全或测试，而不是 UI 审美和使用直觉",
    "用户只要求实现业务逻辑、接口、数据模型或后端功能",
    "用户只要求生成全新设计方案，而不是审查现有页面输出",
])

inputs(
    required=[
        input("review_surface", type=URL | Directory | NaturalLanguage, description="要被审查的页面、路由、组件、应用入口或非前端视觉输出。"),
    ],
    optional=[
        input("product_context", type=Text, description="产品类型、用户任务、目标用户、品牌气质或业务场景。"),
        input("viewports", type=Text, description="需要覆盖的断点，例如 390、430、768、1440、1920。"),
        input("states", type=Text, description="需要覆盖的状态，例如 loading、empty、error、active、sheet open、long text、missing image。"),
        input("fix_scope", type=Text, description="只审查、修 P0/P1、或允许继续修 P2。"),
    ],
    ask_when_missing=True,
)

outputs(
    required=[
        output("ui_critic_findings", type=Text, description="UI 设计师视角的审美和使用直觉 findings，包含证据、原则、用户影响和建议方向。"),
        output("organizer_decisions", type=Text, description="组织者筛选后的修复范围、优先级、取舍和停止条件。"),
        output("frontend_changes", type=Text, description="前端开发者完成的代码改动或在 review-only 模式下的可执行修改建议。"),
        output("verification_evidence", type=Text, description="截图、断点、状态、lint/build/test 命令和复评结果。"),
    ],
    optional=[
        output("remaining_findings", type=Text, description="未修复的 P2/P3、偏好类问题、产品决策问题或验证缺口。"),
    ],
)

environment(
    commands=["rg", "git", "pnpm", "npm", "yarn"],
    dependencies=["Chrome plugin or Browser plugin", "Playwright when available"],
    network="optional",
    filesystem="workspace",
)

agents([
    agent(
        "organizer",
        purpose="界定审查范围、筛选 UI findings、决定修复边界和停止条件。",
        responsibilities=[
            "根据页面类型和产品语境校准审美标准",
            "区分真实问题、产品决策、个人偏好和过度设计请求",
            "只批准默认修复范围内的 P0/P1 findings",
        ],
        context=None,
        effort="medium",
        permissions=agent_permissions(filesystem="read_only", tools=["rg", "git", "pnpm", "npm", "yarn"], can_edit=False),
        outputs=["organizer_decisions", "verification_evidence"],
        forbidden=[
            "机械执行 UI 设计师的所有意见",
            "在没有证据时把主观偏好升级成 P0/P1",
            "替前端开发者做未批准的代码修改",
        ],
    ),
    agent(
        "ui_designer_critic",
        purpose="只读审查当前视觉输出，找出审美、直觉、层级、一致性和可用性问题。",
        responsibilities=[
            "基于截图、可见状态和产品语境输出 UI findings",
            "每条 finding 必须包含证据、违反原则、用户影响和建议方向",
            "只做审查和复评，不直接修改代码",
        ],
        context="visual_evidence plus product_context only",
        effort="medium",
        permissions=agent_permissions(filesystem="read_only", tools=["Chrome", "Browser"], can_edit=False),
        outputs=["ui_critic_findings"],
        forbidden=[
            "编辑代码",
            "跳过证据直接给审美结论",
            "替 organizer 决定哪些 finding 必须修",
        ],
    ),
    agent(
        "frontend_implementer",
        purpose="只修复 organizer 批准的 UI 问题，并保持组件、token 和响应式纪律。",
        responsibilities=[
            "只接收 approved findings 和相关代码边界",
            "复用现有组件、tokens、CSS 变量或局部常量",
            "报告代码改动、验证命令和剩余风险",
        ],
        context="approved organizer_decisions plus relevant screenshots and code paths",
        effort="medium",
        permissions=agent_permissions(filesystem="workspace_write", tools=["rg", "git", "pnpm", "npm", "yarn"], can_edit=True),
        outputs=["frontend_changes"],
        forbidden=[
            "执行未经 organizer 批准的 UI 意见",
            "做无关重构",
            "为了美化引入与产品气质不符的装饰、动效或复杂布局",
        ],
    ),
])

workflow([
    step(
        "organizer_define_scope",
        """
        组织者先界定审查范围和产品语境。
        判断页面类型：工具型、管理后台、SaaS、消费型 App、营销页、内容阅读页、移动任务流或数据密集工作台。
        没有产品语境时，先从页面结构和用户任务做合理推断；只有无法判断审查标准时才询问用户。
        """,
        actor="organizer",
        reads=["review_surface", "product_context", "viewports", "states", "fix_scope"],
        writes=["organizer_decisions"],
    ),
    step(
        "capture_visual_output",
        f"""
        获取当前视觉呈现作为审查证据。
        前端页面优先使用 {call_skill(
            "chrome:control-chrome",
            how="当需要真实登录态、用户 Chrome profile 或浏览器状态时，打开页面、设置 viewport、截图、读取可见状态，并在结束前释放控制",
            mode="compose",
            expect="截图和可见状态证据",
            on_failure="改用 Browser/Playwright 或报告真实状态不可用",
        )}。
        隔离本地验证使用 {call_tool(
            "browser or playwright",
            how="打开本地 URL 或应用入口，设置 viewport，截图并记录 scrollWidth/clientWidth、可见文本和关键状态",
            expect="可复现截图和基础 DOM 尺寸证据",
            on_failure="报告无法获取视觉证据并退回静态审查",
        )}。
        非前端输出使用对应开发者工具获取可见结果、渲染图或产物截图。
        """,
        actor="organizer",
        reads=["review_surface", "viewports", "states"],
        writes=["visual_evidence"],
    ),
    step(
        "ui_designer_critique",
        f"""
        UI 设计师作为点评者执行只读审查。
        可用子 Agent 时，通过 {call_subagent(
            "ui_designer_critic",
            "以专业 UI 设计师身份审查当前视觉输出，找出审美、直觉、层级、一致性和可用性问题",
            how="只传页面截图、产品语境、viewport/state 和审查 rubric；要求输出 findings，不允许改代码",
            context="visual_evidence plus product_context only",
            effort="medium",
            expect="按 P0/P1/P2/P3 排序的 UI findings，每条包含证据、违反原则、用户影响和建议方向",
            on_failure="父 Agent 以 UI 设计师角色完成同样的只读审查，并说明未使用独立子 Agent",
        )}。
        finding 必须可执行，不能只是“丑”“不高级”“不舒服”。
        """,
        actor="ui_designer_critic",
        reads=["visual_evidence", "product_context"],
        writes=["ui_critic_findings"],
    ),
    step(
        "organizer_arbitrate",
        """
        组织者筛选 UI findings。
        区分真实问题、产品决策、个人偏好和过度设计请求；默认只批准 P0/P1 进入修复。
        如果 finding 与产品气质、工程边界或用户任务冲突，记录为 rejected 或 needs_product_decision，不交给前端机械执行。
        """,
        actor="organizer",
        reads=["ui_critic_findings", "fix_scope"],
        writes=["organizer_decisions"],
    ),
    step(
        "frontend_implement",
        f"""
        前端开发者只修组织者批准的问题。
        可用子 Agent 时，通过 {call_subagent(
            "frontend_implementer",
            "修复组织者批准的 UI P0/P1 findings",
            how="只传 approved findings、相关截图和目标代码边界；要求复用现有组件、tokens 和设计系统，不做无关重构",
            context="approved findings plus relevant code paths",
            effort="medium",
            expect="代码改动、验证命令和剩余风险",
            on_failure="父 Agent 直接实现批准的修复，并说明未使用独立子 Agent",
        )}。
        如果用户只要求 review，不修改文件，只输出可执行建议。
        """,
        actor="frontend_implementer",
        reads=["organizer_decisions"],
        writes=["frontend_changes"],
    ),
    step(
        "verify_and_collect",
        """
        组织者运行必要 lint/build/test，并重新截图相关 viewport/state。
        验证修复是否解决批准 findings，且没有造成响应式回归、桌面污染、横向滚动、遮挡或状态破坏。
        """,
        actor="organizer",
        reads=["frontend_changes", "viewports", "states"],
        writes=["verification_evidence"],
    ),
])

loop(
    name="critic_repair_loop",
    body=[
        step("recapture", "重新获取页面截图和可见状态。", actor="organizer", writes=["visual_evidence"]),
        step("recritique", "UI 设计师复评，只报告仍存在或新引入的 P0/P1/P2 问题。", actor="ui_designer_critic", reads=["visual_evidence"], writes=["ui_critic_findings"]),
        step("rearbitrate", "组织者筛选 findings，拒绝偏好化、过度设计或不值得修的问题。", actor="organizer", reads=["ui_critic_findings"], writes=["organizer_decisions"]),
        step("repatch", "前端开发者只修组织者批准的问题，并保持组件和 token 纪律。", actor="frontend_implementer", reads=["organizer_decisions"], writes=["frontend_changes"]),
        step("reverify", "重新截图并运行相关验证，记录通过和剩余缺口。", actor="organizer", reads=["frontend_changes"], writes=["verification_evidence"]),
    ],
    continue_when=[
        "仍存在 P0/P1 审美、直觉、层级、一致性或响应式问题",
        "前端修复引入新的明显视觉问题",
    ],
    stop_when=[
        "没有明显 P0/P1 视觉问题，剩余问题是可接受的 P2/P3、偏好项或产品决策",
        "继续改造需要用户补充产品语境、真实数据、登录态或授权",
        "用户要求停止",
    ],
    max_iterations=5,
    invariant=[
        "UI 设计师只读批判，不直接改代码",
        "前端开发者只修组织者批准的问题",
        "组织者必须防止无限挑刺、过度设计和偏好化重做",
        "每轮修复都必须对应截图或可见状态中的具体问题",
    ],
    writes=["ui_critic_findings", "organizer_decisions", "frontend_changes", "verification_evidence"],
)

decision_rules([
    when("用户提供明确设计稿、Figma 或参考截图并要求对齐", then="改用 visual-fidelity-loop；本 skill 不负责目标稿还原"),
    when("用户只要求 review 不要求修改", then="保持只读，输出 UI findings、组织者筛选结果和建议，不编辑文件"),
    when("页面类型是工具型、SaaS 或管理后台", then="以清晰、克制、可扫描、低干扰和高重复使用效率作为品味标准"),
    when("页面类型是营销页或品牌页", then="允许更强视觉表达，但仍要求层级、节奏、可读性和首屏目标清楚"),
    when("finding 只是个人偏好或装饰取向", then="组织者降级为 P3 或拒绝，不进入默认修复"),
    when("finding 涉及横向滚动、遮挡、错位、不可读、触控目标过小或主任务不清", then="提升为 P0/P1 并优先修复"),
    when("修复会引入大量复杂度或破坏现有设计系统", then="组织者要求更小方案或记录为产品/设计决策"),
    when("真实数据或登录态不可用", then="用安全 fixture 或隔离环境验证布局，并在最终说明缺口"),
])

quality_bar(
    must=[
        "组织者、UI 设计师、前端开发者三种职责必须分离",
        "UI 设计师 finding 必须包含证据、违反原则、用户影响和建议方向",
        "组织者必须筛选 finding，默认只批准 P0/P1 进入修复",
        "前端开发者必须复用现有组件、tokens、CSS 变量或局部常量，避免散落魔法像素",
        "必须验证相关 viewport 和状态，至少覆盖当前页面的默认态以及可见的 loading/empty/error/active/sheet/modal 状态",
        "必须防止过度设计、无限循环和偏好化重做",
        "最终必须报告已修问题、拒绝或延期的问题、验证证据和剩余风险",
    ],
    should=[
        "按页面类型校准审美标准，不用营销页标准批判工具型产品",
        "优先用截图和可见状态做证据，避免纯想象式审查",
        "将反复出现的问题沉淀为组件规则或设计 token",
        "每轮循环先修结构性问题，再修细节问题",
    ],
    must_not=[
        "不要把 UI 设计师的所有意见机械交给前端执行",
        "不要把没有证据的主观感受包装成 P0/P1",
        "不要在 review-only 请求中编辑文件",
        "不要为了美化引入与产品气质不符的装饰、动效或复杂布局",
        "不要只看 happy path 后就宣布 UI 质量通过",
    ],
)
```
