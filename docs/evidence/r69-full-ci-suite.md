# r69 — Full CI suite

Date: 2026-07-08
Bead: `lyntty-uu8`

## Scope

Established the Lyntty CI suite shape across fast PR gates, manual/release gates, local developer commands, and reviewer checklist.

## Changes

- Split `.github/workflows/typecheck.yml` into parallel fast jobs:
  - repo hygiene
  - `lyntty-wire`
  - `lyntty-cli`
  - `lyntty-relay`
  - `lyntty-app`
  - `lyntty-agent`
- Added workflow `permissions: contents: read` and stale-run cancellation for fast CI.
- Added root local commands:
  - `pnpm ci:wire`
  - `pnpm ci:cli`
  - `pnpm ci:relay`
  - `pnpm ci:app`
  - `pnpm ci:agent`
  - `pnpm ci:fast`
- Integrated br3 app i18n guard into `pnpm ci:app` and fast CI.
- Added Expo config inspection to app CI as cheap Android/app-config smoke.
- Tightened manual/heavy workflows:
  - Android release workflow has explicit concurrency.
  - CLI smoke workflow has `contents: read`, concurrency, timeouts, temp `HOME`/`LYNTTY_HOME_DIR`, and no broad `pkill -f` cleanup.
  - Relay image workflow runs no-push image builds on PR path changes and pushes only on `main` non-PR runs.
  - Relay deploy workflow has explicit concurrency.
- Added CI matrix doc: `docs/quality/ci.md`.
- Added PR checklist: `.github/PULL_REQUEST_TEMPLATE.md`.

## Verification commands

```bash
pnpm ci:wire
# pass: 2 test files, 19 tests

pnpm ci:relay
# pass: 15 test files, 97 tests

pnpm ci:agent
# pass: 9 test files, 227 tests

pnpm ci:cli
# pass: 91 test files, 785 tests

pnpm ci:app
# pass: 82 test files, 793 tests; includes typecheck, lint:i18n, Expo config inspection

pnpm ci:fast
# pass

python3 - <<'PY'
from pathlib import Path
import yaml
for path in Path('.github/workflows').glob('*.yml'):
    yaml.safe_load(path.read_text())
PY
# pass

git diff --check
# pass
```

## Not run

- GitHub Actions themselves were not run from this local session.
- `cli-smoke-test.yml` was not run locally because it installs packages globally and boots packaged services.
- `relay-image.yml` Docker build was not run locally; PR workflow now builds without push, main/manual on `main` can push.
- `android-release.yml` was not run; it needs signing/Firebase secrets and is intentionally manual.
- `relay-deploy.yml` was not run; it deploys production and must stay manual.
- Maestro/release-matrix E2E was not run; remains evidence-driven/manual because it needs emulator/device, relay, isolated node state, and pairing redaction.

## Residual risk

- Workflow syntax was YAML-parsed locally, but not validated by `actionlint`.
- Path-filtered relay image PR builds may still be slow on cold Docker cache.
- `pnpm ci:fast` runs all package checks sequentially locally; GitHub fast CI splits them into separate jobs, so timing differs.
