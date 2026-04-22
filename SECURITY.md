# Security Policy

## Supported versions

Security fixes are applied on the latest `main` branch state.

## Reporting a vulnerability

Do not open a public GitHub issue for a security vulnerability.

Preferred path:

1. Use GitHub private vulnerability reporting for this repository if it is enabled.
2. If private reporting is unavailable, contact the maintainers privately through the repository owner or organization profile.

Include:

- affected area or route
- reproduction steps
- impact
- any proof-of-concept or logs that help confirm the issue

## Contribution safety

- Fork and first-time contributor pull requests may require maintainer approval before code-executing workflows can run.
- CODEOWNERS review and maintainer approval are required for protected branches.
- Automated AI review and CI findings are advisory inputs to maintainers, not a substitute for human approval.
- Production deploys are promoted from approved, smoke-green `main` SHAs only.

## Scope

Please report issues involving:

- credential exposure
- secret handling
- auth or session flaws
- injection vulnerabilities
- insecure direct object references
- production deployment or infrastructure misconfiguration
