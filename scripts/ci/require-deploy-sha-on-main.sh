#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

SHA="${1:-}"
REMOTE="${MAIN_SYNC_REMOTE:-origin}"
BRANCH="${REQUIRED_BRANCH:-main}"
REQUIRED_CHECK_NAME="${REQUIRED_CHECK_NAME:-Main Post-Merge Smoke Gate}"
REQUIRE_CI_SUCCESS="${REQUIRE_CI_SUCCESS:-1}"

if [ -z "$SHA" ]; then
  echo "Usage: bash scripts/ci/require-deploy-sha-on-main.sh <sha>"
  exit 1
fi

git fetch --no-tags "$REMOTE" "$BRANCH" --quiet

if ! git rev-parse "$SHA" >/dev/null 2>&1; then
  echo "Deployment SHA '$SHA' is not a valid commit."
  exit 1
fi

if ! git merge-base --is-ancestor "$SHA" "$REMOTE/$BRANCH"; then
  echo "Deployment SHA '$SHA' is not reachable from $REMOTE/$BRANCH."
  exit 1
fi

if [ "$REQUIRE_CI_SUCCESS" != "1" ]; then
  exit 0
fi

if [ -z "${GITHUB_REPOSITORY:-}" ]; then
  echo "GITHUB_REPOSITORY must be set to validate smoke status."
  exit 1
fi

if [ -z "${GH_TOKEN:-${GITHUB_TOKEN:-}}" ]; then
  echo "GH_TOKEN or GITHUB_TOKEN is required to validate smoke status."
  exit 1
fi

CHECK_RUNS_JSON="$(
  GH_TOKEN="${GH_TOKEN:-${GITHUB_TOKEN:-}}" \
    gh api \
    -H "Accept: application/vnd.github+json" \
    "repos/${GITHUB_REPOSITORY}/commits/${SHA}/check-runs?per_page=100"
)"

node -e '
  const payload = JSON.parse(process.argv[1]);
  const expected = process.env.REQUIRED_CHECK_NAME;
  const matches = (payload.check_runs || []).filter((run) => run.name === expected);
  const success = matches.some((run) => run.conclusion === "success");
  if (!success) {
    const states = matches.map((run) => `${run.status}:${run.conclusion}`).join(", ") || "none";
    console.error(`Required check "${expected}" is not green for deployment SHA. Found: ${states}`);
    process.exit(1);
  }
' "$CHECK_RUNS_JSON"
