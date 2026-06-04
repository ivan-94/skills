# 子 Agent 委托示例

当 Skill 需要把有边界的工作交给另一个 Agent，同时保留可审计的委托说明时，使用这个示例。

`context="fork"` 表示子 Agent 完全继承当前上下文。普通字符串表示隔离上下文，并描述只传递哪些材料。

父 Agent 派发子 Agent 并要求下游写入结果时，用 `input(..., required_when=...)` 表达条件必填，而不是把这个约束塞进自然语言。

```python
inputs(
    required=[
        input("review_target", type=File | Directory, description="需要交给子 Agent 审查的目标。"),
    ],
    optional=[
        input(
            "result_path",
            type=Path,
            description="子 Agent 写入审查结果的路径。",
            required=False,
            required_when="当前 Skill 以父 Agent 身份派发子 Agent，并要求下游 Agent 产出可读取的交付物",
        ),
    ],
)

workflow([
    step(
        "independent_review",
        f"""
        在定稿前请求一次独立只读审查。
        通过 {call_subagent(
            "contract-reviewer",
            "审查重写后的 SKILL.md 是否存在触发、DSL、验证和品味问题",
            how="启动一个独立 reviewer；只传 SKILL.md 和 references/contract.pyi；要求输出 findings，不要求直接改文件",
            context="只传 SKILL.md 和 references/contract.pyi",
            effort="medium",
            expect="按严重级别排序的 findings，包含证据和修复建议",
            on_failure="继续执行自审，并说明子 Agent 审查不可用",
        )}.
        """,
    ),
])
```
