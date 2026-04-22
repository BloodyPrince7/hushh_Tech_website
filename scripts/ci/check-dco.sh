#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

BASE_REF="${1:-${GITHUB_BASE_REF:-main}}"
REPORT_PATH="${DCO_REPORT_PATH:-tmp/ci/dco-report.txt}"

mkdir -p "$(dirname "$REPORT_PATH")"

git fetch --no-tags origin "$BASE_REF" >/dev/null 2>&1 || true

if git rev-parse --verify "origin/$BASE_REF" >/dev/null 2>&1; then
  RANGE="origin/$BASE_REF..HEAD"
else
  RANGE="HEAD"
fi

COMMITS="$(git rev-list --reverse --no-merges "$RANGE")"

{
  echo "DCO check range: $RANGE"
  echo "Base ref: $BASE_REF"
  echo
} >"$REPORT_PATH"

if [ -z "$COMMITS" ]; then
  echo "No non-merge commits found for DCO validation." | tee -a "$REPORT_PATH"
  exit 0
fi

FAILED=0

while IFS= read -r SHA; do
  [ -n "$SHA" ] || continue
  SUBJECT="$(git log -1 --format=%s "$SHA")"
  if git log -1 --format=%B "$SHA" | grep -Eiq '^Signed-off-by:[[:space:]]+.+ <.+>$'; then
    printf 'PASS %s %s\n' "$SHA" "$SUBJECT" | tee -a "$REPORT_PATH"
  else
    printf 'FAIL %s %s\n' "$SHA" "$SUBJECT" | tee -a "$REPORT_PATH"
    echo "::error::Commit $SHA is missing a Signed-off-by trailer. Recreate or amend it with 'git commit -s'." >&2
    FAILED=1
  fi
done <<EOF
$COMMITS
EOF

if [ "$FAILED" -ne 0 ]; then
  exit 1
fi
