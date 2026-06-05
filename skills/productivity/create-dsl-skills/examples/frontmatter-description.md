# Frontmatter Description Example

Use this when a DSL-backed Skill needs a frontmatter `description` that triggers reliably before the contract body is loaded.

```python
skill(
    name="repo-release",
    purpose="Guide an agent through preparing and verifying a repository release.",
)

activate_when([
    "user asks to prepare a repository release using this skill",
    "user asks to review or rewrite a DSL-backed release Skill",
])

do_not_activate_when([
    "user only asks for general release-management advice",
    "user asks to run a release workflow that does not involve this Skill",
])

workflow([
    step("derive_description", "Derive the frontmatter description from purpose, activate_when, and do_not_activate_when.", writes=["frontmatter_description"]),
])

quality_bar(
    must=[
        "Frontmatter description names the reusable capability.",
        "Frontmatter description includes concrete use-when triggers from activate_when.",
        "Frontmatter description is not broader than activate_when and does not contradict do_not_activate_when.",
    ],
    must_not=[
        "Do not use generic wording such as helps with, improves workflow, or useful for agents without concrete triggers.",
    ],
)
```
