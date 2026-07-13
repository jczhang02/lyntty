# R75 Three-round hardening

Date: 2026-07-13

Goal: `19c76cd7-efde-436f-97f0-392563151751`

Beads epic: `lyntty-8z4`

## Round 1 — security boundaries

Status: complete after an implementation pass, an independent blocking review, blocker fixes, and a clean follow-up review.

### Changes

- Protected every `lynttyd` local HTTP endpoint in the `onRequest` phase with the daemon control token.
- Updated control clients and the retained agent integration helper to send the token.
- Rejected case-insensitive process-loader and command-resolution environment variables, including `NODE_OPTIONS`, `PATH`, `PATHEXT`, `COMSPEC`, and reserved `LYNTTY_*` keys.
- Restricted Lyntty state/log directories to `0700` and credentials, daemon state/lock, and session encryption ledger files to `0600` where POSIX permissions are available.
- Redacted the daemon control token from doctor output.
- Made Android release and relay deploy main-only and full-SHA-bound; moved production jobs behind named GitHub environments; separated relay PR image builds from main publishing.
- Migrated pnpm overrides/build allowlisting to `pnpm-workspace.yaml`, upgraded vulnerable runtime dependencies, and added a high/critical production audit gate.
- Redacted six tracked pairing URLs, removed 18 auth/pairing screenshots that could expose auth material, and added byte-level evidence scanning with deceptive-suffix and sensitive-image guards.
- Excluded `.env*` files from Docker build context except explicit `.env.example` files.

### Verification

```text
HOME=<temporary> LYNTTY_HOME_DIR=<temporary> pnpm ci:fast
```

Result:

- repository hardening: 6/6 passed;
- production audit: 0 critical, 0 high; 27 moderate and 6 low remain;
- wire: 19 tests passed;
- CLI: typecheck passed, 798 tests passed;
- relay: typecheck/build passed, 101 tests passed;
- app: typecheck/i18n/config checks passed, 795 tests passed;
- agent: typecheck passed, 227 tests passed;
- `git diff --check`: passed.

Independent follow-up review result: no remaining P0/P1 blocker in Round 1.

### Not run / residual risk

- No production Android release, relay image publish, SSH deploy, npm publish, or push was performed.
- GitHub currently has no configured `production-android` or `production-relay` environment protection rules. The workflows enforce `main == origin/main` in code, but required reviewers and deployment-branch rules still need repository-owner configuration.
- The remaining moderate/low advisories were not treated as proven runtime vulnerabilities; they remain visible through `pnpm audit`.
- Existing historical short relay image tags are no longer accepted by the deploy workflow; a new full-SHA image is required before the next deploy/rollback exercise.

## Round 2 — runtime reliability

Pending.

## Round 3 — mobile and Maestro E2E

Pending.
