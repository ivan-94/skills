#!/usr/bin/env python3
"""Validate Python-shaped Skill Contract DSL files.

This script is intentionally small and conservative. It validates the main
SKILL.md contract for a skill directory and, when requested, parses example
Markdown files without treating their illustrative resource paths as real files.
"""

from __future__ import annotations

import argparse
import ast
import json
import re
import sys
from pathlib import Path
from typing import Any


PY_BLOCK_RE = re.compile(r"```python\n(.*?)```", re.S)


def read_text(path: Path) -> str:
    try:
        return path.read_text(encoding="utf-8")
    except OSError as exc:
        raise ValueError(f"cannot read {path}: {exc}") from exc


def extract_python_blocks(path: Path) -> list[str]:
    blocks = PY_BLOCK_RE.findall(read_text(path))
    if not blocks:
        raise ValueError(f"{path}: no python code block found")
    return blocks


def load_spec(spec_path: Path) -> dict[str, set[str]]:
    tree = ast.parse(read_text(spec_path), filename=str(spec_path))
    functions: dict[str, set[str]] = {}
    for node in tree.body:
        if isinstance(node, ast.FunctionDef):
            args = node.args.posonlyargs + node.args.args + node.args.kwonlyargs
            functions[node.name] = {arg.arg for arg in args}
    return functions


def literal_string(node: ast.AST) -> str | None:
    if isinstance(node, ast.Constant) and isinstance(node.value, str):
        return node.value
    return None


def call_name(node: ast.Call) -> str | None:
    if isinstance(node.func, ast.Name):
        return node.func.id
    return None


def parent_map(tree: ast.AST) -> dict[ast.AST, ast.AST]:
    parents: dict[ast.AST, ast.AST] = {}
    for parent in ast.walk(tree):
        for child in ast.iter_child_nodes(parent):
            parents[child] = parent
    return parents


def inside_joined_string(node: ast.AST, parents: dict[ast.AST, ast.AST]) -> bool:
    current: ast.AST | None = node
    while current is not None:
        if isinstance(current, ast.JoinedStr):
            return True
        current = parents.get(current)
    return False


def frontmatter_name(markdown: str, path: Path) -> str | None:
    if not markdown.startswith("---\n"):
        return None
    parts = markdown.split("---\n", 2)
    if len(parts) < 3:
        return None
    for line in parts[1].splitlines():
        if line.startswith("name:"):
            return line.split(":", 1)[1].strip()
    return None


def skill_name_from_tree(tree: ast.AST) -> str | None:
    for node in ast.walk(tree):
        if not isinstance(node, ast.Call) or call_name(node) != "skill":
            continue
        for kw in node.keywords:
            if kw.arg == "name":
                return literal_string(kw.value)
    return None


def resource_paths_from_tree(tree: ast.AST) -> list[str]:
    paths: list[str] = []
    for node in ast.walk(tree):
        if not isinstance(node, ast.Call):
            continue
        if call_name(node) not in {"reference", "script", "asset"}:
            continue
        if not node.args:
            continue
        value = literal_string(node.args[0])
        if value is not None:
            paths.append(value)
    return paths


def validate_tree(
    *,
    tree: ast.AST,
    filename: str,
    spec_functions: dict[str, set[str]],
    check_call_markers: bool,
) -> list[dict[str, Any]]:
    findings: list[dict[str, Any]] = []
    parents = parent_map(tree)
    builtin_names = {"dict", "list", "str", "int", "float", "bool", "set", "tuple"}

    for node in ast.walk(tree):
        if not isinstance(node, ast.Call):
            continue
        name = call_name(node)
        if not name:
            continue
        if name in spec_functions:
            allowed = spec_functions[name]
            for kw in node.keywords:
                if kw.arg and kw.arg not in allowed:
                    findings.append(
                        {
                            "severity": "error",
                            "file": filename,
                            "line": node.lineno,
                            "message": f"{name}() has unknown keyword argument {kw.arg!r}",
                        }
                    )
            if check_call_markers and name.startswith("call_") and not inside_joined_string(node, parents):
                findings.append(
                    {
                        "severity": "error",
                        "file": filename,
                        "line": node.lineno,
                        "message": f"{name}() must appear inside a natural-language f-string",
                    }
                )
        elif not name[0].isupper() and name not in builtin_names:
            findings.append(
                {
                    "severity": "error",
                    "file": filename,
                    "line": node.lineno,
                    "message": f"unknown DSL function {name}()",
                }
            )
    return findings


def validate_skill(skill_dir: Path, spec_path: Path, include_examples: bool) -> dict[str, Any]:
    findings: list[dict[str, Any]] = []
    spec_functions = load_spec(spec_path)
    skill_md = skill_dir / "SKILL.md"
    markdown = read_text(skill_md)
    blocks = PY_BLOCK_RE.findall(markdown)

    if len(blocks) != 1:
        findings.append(
            {
                "severity": "error",
                "file": str(skill_md),
                "message": f"expected exactly one python code block, found {len(blocks)}",
            }
        )
        main_tree = None
    else:
        main_tree = ast.parse(blocks[0], filename=str(skill_md))
        findings.extend(
            validate_tree(
                tree=main_tree,
                filename=str(skill_md),
                spec_functions=spec_functions,
                check_call_markers=True,
            )
        )

    if main_tree is not None:
        fm_name = frontmatter_name(markdown, skill_md)
        contract_name = skill_name_from_tree(main_tree)
        if fm_name and contract_name and fm_name != contract_name:
            findings.append(
                {
                    "severity": "error",
                    "file": str(skill_md),
                    "message": f"frontmatter name {fm_name!r} does not match skill(name={contract_name!r})",
                }
            )
        for path_text in resource_paths_from_tree(main_tree):
            path = skill_dir / path_text
            if not path.exists():
                findings.append(
                    {
                        "severity": "error",
                        "file": str(skill_md),
                        "message": f"declared resource path does not exist: {path_text}",
                    }
                )

    if include_examples:
        for example_path in sorted((skill_dir / "examples").glob("*.md")):
            for index, block in enumerate(extract_python_blocks(example_path), 1):
                tree = ast.parse(block, filename=f"{example_path}#block{index}")
                findings.extend(
                    validate_tree(
                        tree=tree,
                        filename=f"{example_path}#block{index}",
                        spec_functions=spec_functions,
                        check_call_markers=True,
                    )
                )

    return {
        "ok": not findings,
        "skill_dir": str(skill_dir),
        "spec": str(spec_path),
        "findings": findings,
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Validate Python-shaped Skill Contract DSL files.")
    parser.add_argument("skill_dir", nargs="?", default=".", help="Skill directory containing SKILL.md")
    parser.add_argument(
        "--spec",
        default=None,
        help="Path to contract.pyi. Defaults to <skill_dir>/references/contract.pyi.",
    )
    parser.add_argument("--examples", action="store_true", help="Also parse examples/*.md code blocks")
    args = parser.parse_args(argv)

    skill_dir = Path(args.skill_dir).resolve()
    spec_path = Path(args.spec).resolve() if args.spec else skill_dir / "references" / "contract.pyi"

    try:
        result = validate_skill(skill_dir, spec_path, args.examples)
    except (SyntaxError, ValueError) as exc:
        result = {"ok": False, "skill_dir": str(skill_dir), "spec": str(spec_path), "findings": [{"severity": "error", "message": str(exc)}]}

    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0 if result["ok"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
