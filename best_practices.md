# Hushh Tech PR Review Best Practices

Use these rules as high-signal review priorities for this repository.

## Protect production and deployment safety

- Do not allow pull request workflows to deploy to UAT or production.
- Keep deployments gated to approved, smoke-green `main` SHAs only.
- Treat deploy workflow changes as high risk. Verify SHA provenance, environment scope, and smoke gating.

## Keep secrets out of the browser

- Browser-visible `VITE_*` variables must never expose production-only vendor secrets.
- `VITE_ALLOW_INSECURE_BROWSER_LLM` must stay `false` in CI, UAT, and production paths.
- Sensitive credentials belong in server runtime config or GCP Secret Manager, not committed files or browser env.

## Preserve the environment contract

- Any new required environment variable must be reflected in `.env.local.example`, `src/vite-env.d.ts`, `scripts/ci/env-contract.json`, and relevant workflows.
- Critical server-side env usage in API routes must also be injected in governed deploy workflows.
- Missing env wiring is a correctness issue, not a docs-only issue.

## Do not weaken required checks

- `npm ci`, tests, TypeScript validation, env contract checks, lint checks, secret scanning, and security audit reporting must remain intact.
- Do not swallow failures with `|| true`, `|| echo`, or non-blocking fallbacks on required validation jobs.
- `npm run build:web` is the authoritative production build path because it refreshes generated assets before bundling.

## Review auth, API, and data access defensively

- API routes should validate inputs, fail closed on missing secrets, and avoid leaking internal errors.
- Changes touching auth, sessions, account deletion, notifications, metrics, or Supabase service-role usage need especially careful review.
- If a risky path changes without tests or smoke coverage, call that out.

## Prefer actionable findings

- Prioritize correctness, security, deploy safety, and operational regressions over style nits.
- Reference exact files and behavior so maintainers can act quickly.
