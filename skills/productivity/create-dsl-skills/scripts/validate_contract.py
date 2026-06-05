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
BEHAVIOR_DECLARATIONS = {"workflow", "workflow_graph", "modes", "loop", "map_each"}
CALL_MARKER_HOW_INDEX = {
    "call_script": 1,
    "call_tool": 1,
    "call_mcp": 2,
    "call_skill": 1,
    "call_subagent": 2,
    "call_human": 1,
}


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


def literal_int(node: ast.AST) -> int | None:
    if isinstance(node, ast.Constant) and isinstance(node.value, int):
        return node.value
    return None


def literal_bool(node: ast.AST) -> bool | None:
    if isinstance(node, ast.Constant) and isinstance(node.value, bool):
        return node.value
    return None


def call_name(node: ast.Call) -> str | None:
    if isinstance(node.func, ast.Name):
        return node.func.id
    return None


def finding(severity: str, filename: str, message: str, line: int | None = None) -> dict[str, Any]:
    result: dict[str, Any] = {"severity": severity, "file": filename, "message": message}
    if line is not None:
        result["line"] = line
    return result


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


def frontmatter_field(markdown: str, field: str) -> str | None:
    if not markdown.startswith("---\n"):
        return None
    parts = markdown.split("---\n", 2)
    if len(parts) < 3:
        return None
    prefix = f"{field}:"
    for line in parts[1].splitlines():
        if line.startswith(prefix):
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


def calls_named(tree: ast.AST, name: str) -> list[ast.Call]:
    return [node for node in ast.walk(tree) if isinstance(node, ast.Call) and call_name(node) == name]


def keyword_value(node: ast.Call, name: str) -> ast.AST | None:
    for kw in node.keywords:
        if kw.arg == name:
            return kw.value
    return None


def arg_or_keyword(node: ast.Call, index: int, name: str) -> ast.AST | None:
    if len(node.args) > index:
        return node.args[index]
    return keyword_value(node, name)


def literal_string_list(node: ast.AST | None) -> list[str]:
    if isinstance(node, ast.List | ast.Tuple):
        return [value for item in node.elts if (value := literal_string(item)) is not None]
    value = literal_string(node) if node is not None else None
    return [value] if value is not None else []


def call_list_from_keyword(node: ast.Call, name: str) -> list[ast.Call]:
    value = keyword_value(node, name)
    if isinstance(value, ast.List | ast.Tuple):
        return [item for item in value.elts if isinstance(item, ast.Call)]
    return []


def call_list_from_arg_or_keyword(node: ast.Call, index: int, name: str) -> list[ast.Call]:
    value = arg_or_keyword(node, index, name)
    if isinstance(value, ast.List | ast.Tuple):
        return [item for item in value.elts if isinstance(item, ast.Call)]
    return []


def required_names_from_call(node: ast.Call) -> list[str]:
    required = keyword_value(node, "required")
    names: list[str] = []
    if not isinstance(required, ast.List | ast.Tuple):
        return names
    for item in required.elts:
        value = literal_string(item)
        if value is not None:
            names.append(value)
            continue
        if isinstance(item, ast.Call) and item.args:
            value = literal_string(item.args[0])
            if value is not None:
                names.append(value)
    return names


def input_names_from_list(node: ast.AST | None) -> list[str]:
    names: list[str] = []
    if not isinstance(node, ast.List | ast.Tuple):
        return names
    for item in node.elts:
        value = literal_string(item)
        if value is not None:
            names.append(value)
            continue
        if not isinstance(item, ast.Call) or call_name(item) != "input" or not item.args:
            continue
        required_node = keyword_value(item, "required")
        required = literal_bool(required_node) if required_node is not None else True
        if required is False:
            continue
        value = literal_string(item.args[0])
        if value is not None:
            names.append(value)
    return names


def output_names_from_list(node: ast.AST | None) -> list[str]:
    names: list[str] = []
    if not isinstance(node, ast.List | ast.Tuple):
        return names
    for item in node.elts:
        value = literal_string(item)
        if value is not None:
            names.append(value)
            continue
        if not isinstance(item, ast.Call) or call_name(item) != "output" or not item.args:
            continue
        value = literal_string(item.args[0])
        if value is not None:
            names.append(value)
    return names


def values_from_keyword_lists(tree: ast.AST, keyword_names: set[str]) -> set[str]:
    values: set[str] = set()
    for node in ast.walk(tree):
        if not isinstance(node, ast.Call):
            continue
        for kw in node.keywords:
            if kw.arg not in keyword_names:
                continue
            values.update(literal_string_list(kw.value))
    return values


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


def duplicate_call_id_findings(calls: list[ast.Call], label: str, filename: str) -> list[dict[str, Any]]:
    findings: list[dict[str, Any]] = []
    seen: dict[str, int] = {}
    for node in calls:
        if not node.args:
            continue
        value = literal_string(node.args[0])
        if value is None:
            continue
        if value in seen:
            findings.append(
                finding("error", filename, f"duplicate {label} id {value!r}; first declared on line {seen[value]}", node.lineno)
            )
        else:
            seen[value] = node.lineno
    return findings


def validate_duplicate_ids(tree: ast.AST, filename: str) -> list[dict[str, Any]]:
    findings: list[dict[str, Any]] = []
    for node in calls_named(tree, "workflow"):
        findings.extend(duplicate_call_id_findings(call_list_from_arg_or_keyword(node, 0, "steps"), "step", filename))
    for node in calls_named(tree, "mode"):
        findings.extend(duplicate_call_id_findings(call_list_from_keyword(node, "workflow"), "step", filename))
    for node in calls_named(tree, "map_each"):
        findings.extend(duplicate_call_id_findings(call_list_from_keyword(node, "do"), "step", filename))
    for node in calls_named(tree, "loop"):
        findings.extend(duplicate_call_id_findings(call_list_from_keyword(node, "body"), "step", filename))
    for node in calls_named(tree, "workflow_graph"):
        findings.extend(duplicate_call_id_findings(call_list_from_keyword(node, "nodes"), "node", filename))
    for node in calls_named(tree, "modes"):
        findings.extend(duplicate_call_id_findings(call_list_from_arg_or_keyword(node, 0, "modes"), "mode", filename))
    return findings


def validate_workflow_graphs(tree: ast.AST, filename: str) -> list[dict[str, Any]]:
    findings: list[dict[str, Any]] = []
    for graph in calls_named(tree, "workflow_graph"):
        node_calls = call_list_from_keyword(graph, "nodes")
        node_ids = [literal_string(node.args[0]) for node in node_calls if node.args]
        known = {value for value in node_ids if value is not None}
        entry = literal_string(keyword_value(graph, "entry") or ast.Constant(None))
        if entry and entry not in known:
            findings.append(finding("error", filename, f"workflow_graph entry references unknown node {entry!r}", graph.lineno))
        for exit_id in literal_string_list(keyword_value(graph, "exits")):
            if exit_id not in known:
                findings.append(finding("error", filename, f"workflow_graph exit references unknown node {exit_id!r}", graph.lineno))
        for edge_call in call_list_from_keyword(graph, "edges"):
            from_values = literal_string_list(arg_or_keyword(edge_call, 0, "from_"))
            to_values = literal_string_list(arg_or_keyword(edge_call, 1, "to"))
            for value in from_values + to_values:
                if value not in known:
                    findings.append(
                        finding("error", filename, f"edge references unknown workflow_graph node {value!r}", edge_call.lineno)
                    )
    return findings


def validate_loops(tree: ast.AST, filename: str) -> list[dict[str, Any]]:
    findings: list[dict[str, Any]] = []
    for node in calls_named(tree, "loop"):
        stop_values = literal_string_list(keyword_value(node, "stop_when"))
        max_iterations = keyword_value(node, "max_iterations")
        has_max = literal_int(max_iterations) is not None and literal_int(max_iterations) > 0
        if not stop_values and not has_max:
            findings.append(
                finding("error", filename, "loop() must declare stop_when or positive max_iterations", node.lineno)
            )
    return findings


def validate_conditional_inputs(tree: ast.AST, filename: str) -> list[dict[str, Any]]:
    findings: list[dict[str, Any]] = []
    for node in calls_named(tree, "input"):
        required_when_node = keyword_value(node, "required_when")
        if required_when_node is None:
            continue
        if isinstance(required_when_node, ast.Constant) and required_when_node.value is None:
            continue
        required_when = literal_string(required_when_node)
        if required_when is not None and required_when.strip() == "":
            findings.append(finding("error", filename, "input() required_when must be non-empty when provided", node.lineno))
            continue
        if required_when is None:
            findings.append(
                finding("warning", filename, "input() required_when is not a literal string; cannot verify it is specific", node.lineno)
            )
        required_node = keyword_value(node, "required")
        required = literal_bool(required_node) if required_node is not None else True
        if required is not False:
            findings.append(
                finding("warning", filename, "input() required_when should normally be paired with required=False", node.lineno)
            )
    return findings


def all_modes_have_interface(tree: ast.AST, keyword_name: str) -> bool:
    mode_calls = calls_named(tree, "mode")
    if not mode_calls:
        return False
    for node in mode_calls:
        value = keyword_value(node, keyword_name)
        if not isinstance(value, ast.List | ast.Tuple) or not value.elts:
            return False
    return True


def validate_required_structure(tree: ast.AST, markdown: str, filename: str) -> list[dict[str, Any]]:
    findings: list[dict[str, Any]] = []
    skill_calls = calls_named(tree, "skill")
    if len(skill_calls) != 1:
        findings.append(finding("error", filename, f"expected exactly one skill(...) call, found {len(skill_calls)}"))
    if not calls_named(tree, "activate_when"):
        findings.append(finding("error", filename, "missing required activate_when(...) declaration"))
    if not calls_named(tree, "inputs") and not all_modes_have_interface(tree, "inputs"):
        findings.append(finding("error", filename, "missing inputs interface: declare inputs(...) or inputs=[...] on every mode"))
    if not calls_named(tree, "outputs") and not all_modes_have_interface(tree, "outputs"):
        findings.append(finding("error", filename, "missing outputs interface: declare outputs(...) or outputs=[...] on every mode"))
    if not any(calls_named(tree, name) for name in BEHAVIOR_DECLARATIONS):
        findings.append(
            finding("error", filename, "missing behavior declaration: workflow, workflow_graph, modes, loop, or map_each")
        )
    if not calls_named(tree, "do_not_activate_when"):
        findings.append(finding("warning", filename, "do_not_activate_when(...) is missing; confirm this skill has no meaningful neighbor"))
    description = frontmatter_field(markdown, "description")
    if description is None:
        findings.append(finding("warning", filename, "frontmatter description is missing"))
    elif len(description) < 40 or not any(marker in description for marker in ("Use when", "用于", "用户", "当")):
        findings.append(finding("warning", filename, "frontmatter description may be too generic for reliable activation"))
    return findings


def validate_required_io_traceability(tree: ast.AST, filename: str) -> list[dict[str, Any]]:
    findings: list[dict[str, Any]] = []
    input_names: list[str] = []
    output_names: list[str] = []
    for node in calls_named(tree, "inputs"):
        input_names.extend(required_names_from_call(node))
    for node in calls_named(tree, "outputs"):
        output_names.extend(required_names_from_call(node))
    for node in calls_named(tree, "mode"):
        input_names.extend(input_names_from_list(keyword_value(node, "inputs")))
        output_names.extend(output_names_from_list(keyword_value(node, "outputs")))
    consumed = values_from_keyword_lists(tree, {"reads"})
    produced = values_from_keyword_lists(tree, {"writes"})
    for name in sorted(set(input_names) - consumed):
        findings.append(finding("warning", filename, f"required input {name!r} is not explicitly consumed by reads"))
    for name in sorted(set(output_names) - produced):
        findings.append(finding("warning", filename, f"required output {name!r} is not explicitly written by writes"))
    return findings


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
                    finding("error", filename, f"{name}() must appear inside a natural-language f-string", node.lineno)
                )
            if check_call_markers and name in CALL_MARKER_HOW_INDEX:
                how_node = arg_or_keyword(node, CALL_MARKER_HOW_INDEX[name], "how")
                how = literal_string(how_node) if how_node is not None else None
                if how_node is None or how == "":
                    findings.append(finding("error", filename, f"{name}() must include non-empty how", node.lineno))
                elif how is None:
                    findings.append(finding("warning", filename, f"{name}() how is not a literal string; cannot verify it is specific", node.lineno))
        elif not name[0].isupper() and name not in builtin_names:
            findings.append(
                finding("error", filename, f"unknown DSL function {name}()", node.lineno)
            )
    findings.extend(validate_conditional_inputs(tree, filename))
    return findings


def summarize(findings: list[dict[str, Any]]) -> dict[str, int]:
    errors = sum(1 for item in findings if item.get("severity") == "error")
    warnings = sum(1 for item in findings if item.get("severity") == "warning")
    return {"errors": errors, "warnings": warnings}


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
        findings.extend(validate_required_structure(main_tree, markdown, str(skill_md)))
        findings.extend(validate_duplicate_ids(main_tree, str(skill_md)))
        findings.extend(validate_workflow_graphs(main_tree, str(skill_md)))
        findings.extend(validate_loops(main_tree, str(skill_md)))
        findings.extend(validate_required_io_traceability(main_tree, str(skill_md)))

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
                example_filename = f"{example_path}#block{index}"
                findings.extend(
                    validate_tree(
                        tree=tree,
                        filename=example_filename,
                        spec_functions=spec_functions,
                        check_call_markers=True,
                    )
                )
                findings.extend(validate_duplicate_ids(tree, example_filename))
                findings.extend(validate_workflow_graphs(tree, example_filename))
                findings.extend(validate_loops(tree, example_filename))

    summary = summarize(findings)
    return {
        "ok": summary["errors"] == 0,
        "skill_dir": str(skill_dir),
        "spec": str(spec_path),
        "summary": summary,
        "findings": findings,
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Validate Python-shaped Skill Contract DSL files.")
    parser.add_argument("skill_dir", nargs="?", default=".", help="Skill directory containing SKILL.md")
    parser.add_argument(
        "--spec",
        default=None,
        help="Path to contract.pyi. Defaults to this script's ../references/contract.pyi.",
    )
    parser.add_argument("--examples", action="store_true", help="Also parse examples/*.md code blocks")
    args = parser.parse_args(argv)

    skill_dir = Path(args.skill_dir).resolve()
    default_spec = Path(__file__).resolve().parents[1] / "references" / "contract.pyi"
    spec_path = Path(args.spec).resolve() if args.spec else default_spec

    try:
        result = validate_skill(skill_dir, spec_path, args.examples)
    except (SyntaxError, ValueError) as exc:
        result = {
            "ok": False,
            "skill_dir": str(skill_dir),
            "spec": str(spec_path),
            "summary": {"errors": 1, "warnings": 0},
            "findings": [{"severity": "error", "message": str(exc)}],
        }

    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0 if result["ok"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
