#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat >&2 <<'USAGE'
Usage:
  list_sub_issues.sh [--repo owner/repo] <parent-issue-number>

Outputs a JSON array of GitHub sub-issues with only:
  number, title, state, labels, body
USAGE
}

repo=""
parent=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --repo)
      if [[ $# -lt 2 || -z "${2:-}" ]]; then
        echo "ERROR: --repo requires an owner/repo value." >&2
        usage
        exit 2
      fi
      repo="$2"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    -*)
      echo "ERROR: Unknown option: $1" >&2
      usage
      exit 2
      ;;
    *)
      if [[ -n "$parent" ]]; then
        echo "ERROR: Unexpected extra argument: $1" >&2
        usage
        exit 2
      fi
      parent="$1"
      shift
      ;;
  esac
done

if [[ -z "$parent" ]]; then
  echo "ERROR: Missing parent issue number." >&2
  usage
  exit 2
fi

if ! [[ "$parent" =~ ^[0-9]+$ ]]; then
  echo "ERROR: Parent issue number must be numeric: $parent" >&2
  exit 2
fi

if ! command -v gh >/dev/null 2>&1; then
  echo "ERROR: GitHub CLI 'gh' is required." >&2
  exit 127
fi

if [[ -z "$repo" ]]; then
  if ! repo="$(gh repo view --json nameWithOwner --jq .nameWithOwner 2>/dev/null)"; then
    echo "ERROR: Could not infer repository. Run inside a GitHub repo or pass --repo owner/repo." >&2
    exit 2
  fi
fi

if ! [[ "$repo" =~ ^[^/]+/[^/]+$ ]]; then
  echo "ERROR: Repository must be in owner/repo form: $repo" >&2
  exit 2
fi

numbers="$(
  gh api "repos/$repo/issues/$parent/sub_issues" \
    --paginate \
    --jq '.[].number' 2>/dev/null
)" || {
  echo "ERROR: Failed to list sub-issues for $repo#$parent." >&2
  exit 1
}

if [[ -z "$numbers" ]]; then
  printf '[]\n'
  exit 0
fi

first=1
declare -a objects=()
while IFS= read -r number; do
  [[ -z "$number" ]] && continue
  if ! object="$(
    gh issue view "$number" \
    --repo "$repo" \
    --json number,title,state,labels,body \
    --jq '{number, title, state: (.state | ascii_downcase), labels: [.labels[].name], body: (.body // "")}'
  )"; then
    echo "ERROR: Failed to fetch issue $repo#$number." >&2
    exit 1
  fi
  objects+=("$object")
done <<< "$numbers"

printf '['
for object in "${objects[@]}"; do
  if [[ "$first" -eq 0 ]]; then
    printf ','
  fi
  first=0
  printf '%s' "$object"
done
printf ']\n'
