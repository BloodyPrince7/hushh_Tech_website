#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

mkdir -p tmp/ci

echo "Running hard-gated lint checks on governed surfaces..."
npx eslint --max-warnings=0 \
  eslint.config.js \
  vite.config.ts \
  vitest.config.ts \
  src/vite-env.d.ts \
  scripts/ci/*.mjs \
  scripts/generate-sitemap.js \
  scripts/generate-robots.js

echo "Running shell syntax checks..."
find scripts/ci scripts/security -type f -name '*.sh' -print0 | while IFS= read -r -d '' script; do
  bash -n "$script"
done

echo "Capturing full repo lint report (report-only)..."
if ! npx eslint . --format json > tmp/ci/eslint-full-report.json; then
  echo "Full repo lint violations captured in tmp/ci/eslint-full-report.json"
fi
