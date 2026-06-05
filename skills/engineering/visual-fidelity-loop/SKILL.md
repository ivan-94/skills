---
name: visual-fidelity-loop
description: 使用设计稿、Figma、截图或参考图进行 UI 视觉还原和设计系统化。用于用户要求对齐设计稿、按截图改 UI、做视觉 review、提升 UI 品味、建立设计纪律、提取设计 token，或通过 Chrome/Browser 截图循环修到没有低级视觉问题。
---

```python
from skill_contract import *

skill(
    name="visual-fidelity-loop",
    purpose="用截图驱动的闭环把前端 UI 对齐视觉目标，并把稳定的设计规律沉淀为组件、token 和响应式规范。",
)

activate_when(
    [
        "用户要求按 Figma、设计稿、截图、参考图或现有页面还原 UI",
        "用户要求使用 Chrome、Browser、Playwright 或截图循环 review 页面视觉效果",
        "用户要求从专业设计师或前端视角找出视觉差异并修改代码",
        "用户要求提升 UI 品味、设计纪律、响应式展示或设计 token 化",
        "用户要求重复截图、对比、调整，直到没有明显低级美感问题",
    ],
    match="any",
)

do_not_activate_when([
    "用户只要求实现业务逻辑、接口、数据模型或后端功能，且没有视觉目标或 UI 质量要求",
    "用户只要求普通代码 review，重点是 bug、性能、安全或测试，而不是视觉还原",
    "用户要求创建全新设计但没有任何目标稿、参考图、产品气质或视觉约束",
    "用户只要求解释 CSS、Tailwind 或组件代码，不需要截图闭环或视觉判断",
])

inputs(
    required=[
        input("visual_target", type=File | URL | NaturalLanguage, description="目标设计来源：Figma 节点、截图、参考图、现有页面或用户描述。"),
        input("implementation_surface", type=Directory | URL | NaturalLanguage, description="要还原或 review 的页面、路由、组件或本地应用入口。"),
    ],
    optional=[
        input("viewports", type=Text, description="需要验证的断点，例如 390、430、768、1440、1920。"),
        input("states", type=Text, description="需要覆盖的状态，例如 loading、empty、active、hover、sheet open、long text、missing image。"),
        input("design_system_constraints", type=Text, description="项目已有 tokens、组件库、品牌规范或禁止事项。"),
    ],
    ask_when_missing=True,
)

outputs(
    required=[
        output("visual_diff_report", type=Text, description="按可执行差异点列出的视觉问题、证据和优先级。"),
        output("patched_implementation", type=Text, description="完成的代码修改或明确的修改建议。"),
        output("verification_evidence", type=Text, description="截图、断点、状态、lint/build/test 命令和结果。"),
    ],
    optional=[
        output("design_discipline_notes", type=Text, description="从目标稿提炼出的层级、间距、对齐、状态和 token 规律。"),
        output("remaining_gaps", type=Text, description="因缺失数据、登录态、设计稿状态或外部依赖无法验证的风险。"),
    ],
)

environment(
    commands=["rg", "git", "pnpm", "npm", "yarn"],
    dependencies=["Chrome plugin or Browser plugin", "Playwright when available"],
    network="optional",
    filesystem="workspace",
)

workflow([
    step(
        "establish_target",
        """
        明确目标稿、产品气质、页面任务和必须验证的 viewport/state。
        如果目标来自 Figma 或外部设计系统，优先读取官方设计上下文；如果目标来自截图，使用同尺寸 viewport 对齐。
        不要先量像素，先判断页面类型：工具型、内容型、营销型、品牌型或移动操作流。
        """,
        reads=["visual_target", "implementation_surface", "viewports", "states"],
        writes=["target_model"],
    ),
    step(
        "extract_design_discipline",
        """
        从目标稿提炼设计纪律，而不是机械复制单个像素值。
        必须识别：视觉层级、页面边距、对齐规则、卡片/面板半径、icon 槽位、字体层级、active/inactive 状态、阴影/透明度、sheet/modal/tabbar 等模式。
        """,
        reads=["target_model", "design_system_constraints"],
        writes=["design_discipline_notes"],
    ),
    step(
        "capture_current_ui",
        f"""
        使用可复现方式打开当前实现并截图。
        当需要用户现有登录态、Chrome profile 或真实浏览器状态时，使用 {call_skill(
            "chrome:control-chrome",
            how="连接用户 Chrome，打开目标页面，设置与目标稿一致的窗口尺寸，截图并检查可见页面状态；结束前释放 Chrome 控制",
            mode="compose",
            expect="current UI screenshot and visible state evidence",
            on_failure="改用 Browser/Playwright 或报告真实登录态不可用",
        )}。
        当需要隔离验证本地页面时，使用 {call_tool(
            "browser or playwright",
            how="在本地 dev server 或 file URL 中打开目标路由，设置指定 viewport，截图并读取关键 DOM 尺寸",
            expect="screenshot plus scrollWidth/clientWidth and visible state",
            on_failure="报告无法截图的原因并继续静态审查",
        )}。
        """,
        reads=["implementation_surface", "target_model"],
        writes=["current_screenshots", "current_state_evidence"],
    ),
    step(
        "compare_with_taste",
        """
        以顶级产品设计师和资深前端的标准做 diff。
        差异必须写成可执行语言：布局、间距、对齐、字体、颜色、状态、图标、头像、圆角、阴影、层级、响应式、空态/加载态。
        禁止只写“有点丑”“不高级”；必须说明哪个视觉规律被破坏，以及用户任务或设计系统会受到什么影响。
        """,
        reads=["visual_target", "current_screenshots", "design_discipline_notes"],
        writes=["visual_diff_report"],
    ),
    step(
        "patch_with_system_constraints",
        """
        修改代码时优先使用项目已有组件、tokens、CSS 变量、Tailwind 语义类和局部常量。
        如果同类数值重复出现 2-3 次，考虑沉淀为 token、局部常量或组件契约；不要把页面改成散落的魔法像素。
        每次 patch 只处理上一轮明确观察到的问题，不做无关重构。
        """,
        reads=["visual_diff_report", "design_system_constraints"],
        writes=["patched_implementation"],
    ),
    step(
        "verify_responsive_regression",
        """
        复查目标 viewport 和必要状态。
        如果有响应式要求，至少覆盖 mobile narrow、mobile normal、tablet、desktop；移动样式修改后必须确认桌面没有被污染。
        检查 horizontal scroll、遮挡、错位、文本溢出、safe-area、长文本、缺图、loading、empty、active、sheet/modal open。
        """,
        reads=["patched_implementation", "viewports", "states"],
        writes=["verification_evidence"],
    ),
    step(
        "closeout",
        """
        总结改了什么、为什么这样改、验证了哪些截图/断点/状态、还有哪些缺口。
        结束标准不是 100% 像素一致，而是主视觉层级、关键对齐、间距、状态语言和响应式行为与目标一致，并且实现没有明显硬编码堆砌。
        """,
        reads=["visual_diff_report", "patched_implementation", "verification_evidence", "design_discipline_notes"],
        writes=["remaining_gaps"],
    ),
])

loop(
    name="visual_repair_loop",
    body=[
        step("capture_iteration", "重新截图当前 UI，保持与目标稿一致的 viewport 和状态。", writes=["current_screenshots"]),
        step("diff_iteration", "对比目标稿和当前截图，输出可执行视觉差异。", reads=["current_screenshots", "design_discipline_notes"], writes=["visual_diff_report"]),
        step("patch_iteration", "只修复上一轮观察到的差异，并优先沉淀可复用 token 或组件规则。", reads=["visual_diff_report"], writes=["patched_implementation"]),
        step("verify_iteration", "重新截图并运行相关 lint/build/test；记录通过、失败或无法验证原因。", reads=["patched_implementation"], writes=["verification_evidence"]),
    ],
    continue_when=[
        "仍存在明显低级视觉问题",
        "目标稿关键层级、对齐、间距、状态或响应式行为尚未达成",
    ],
    stop_when=[
        "主视觉层级、关键尺寸、对齐、状态语言和响应式行为已与目标一致",
        "继续修复需要用户补充目标稿、真实数据、登录态或产品决策",
        "用户要求停止",
    ],
    max_iterations=6,
    invariant=[
        "每轮修改必须对应截图或设计纪律中观察到的具体差异",
        "不要用一次性魔法像素掩盖可复用的设计规律",
        "不要为了移动端还原破坏桌面端或其他已验收状态",
    ],
    writes=["visual_diff_report", "patched_implementation", "verification_evidence"],
)

decision_rules([
    when("目标稿和当前实现 viewport 不一致", then="先统一 viewport 再比较，不用不同尺寸截图判断视觉差异"),
    when("存在布局、遮挡、横向滚动或主要层级错误", then="先修结构性问题，再修颜色、阴影、圆角和微间距"),
    when("设计稿只给 happy path", then="主动验证 loading、empty、error、active、long text、missing asset 和 modal/sheet 状态"),
    when("真实登录态或数据不可用", then="使用安全 fixture 或隔离 storage state 验证布局，并在最终说明真实性缺口"),
    when("同类视觉数值开始重复", then="提取局部常量、设计 token、组件 prop 或共享样式规则"),
    when("参考图和现有设计系统冲突", then="优先保持产品设计纪律，并把冲突作为需要用户或设计师确认的 remaining gap"),
    when("截图 diff 只能靠主观描述", then="把描述转成可执行维度，例如尺寸、对齐、视觉重量、层级、状态或响应式影响"),
])

quality_bar(
    must=[
        "必须先建立目标模型和设计纪律，再进入截图修复循环",
        "每个视觉 diff 都必须有截图、目标稿或设计纪律证据",
        "必须以专业设计师品味判断层级、克制、统一、产品气质和任务效率",
        "必须从前端维护性角度避免散落魔法像素，优先沉淀 token、组件契约或局部常量",
        "必须验证目标 viewport；有响应式要求时必须覆盖移动、平板或桌面回归中相关断点",
        "必须检查 loading、empty、active、long text、missing asset、sheet/modal 等非 happy path 中相关状态",
        "必须报告验证命令、截图断点和无法验证的真实数据/登录态缺口",
    ],
    should=[
        "优先使用 Chrome 验证真实登录态页面，使用 Browser/Playwright 做隔离回归",
        "按布局/层级、间距/对齐、字体、颜色、图标/图片、状态、响应式顺序组织 diff",
        "保持改动小步快跑，每轮修复不超过当前 diff 的必要范围",
        "在最终回复中说明哪些规律被沉淀为 token、组件或共享规则",
    ],
    must_not=[
        "不要把设计还原做成机械一比一复制而忽略设计纪律",
        "不要只凭感觉写“丑”“不高级”“差不多”，必须落到可执行差异",
        "不要用硬编码像素堆砌替代 token、组件规则或项目已有设计系统",
        "不要只验收当前截图而忽略响应式、状态矩阵或桌面回归",
        "不要在没有用户授权时提交、推送或更改外部设计文件",
    ],
)
```
