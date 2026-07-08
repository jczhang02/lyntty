# Lyntty CI matrix

Date: 2026-07-08
Status: active target for `lyntty-uu8`

## Goals

- Keep pull-request gates fast, parallel, and deterministic.
- Keep workflow permissions minimal by default.
- Cancel stale PR runs when new commits arrive.
- Run heavier package, Android, relay image, deploy, and CLI packaging checks only in explicit tiers.
- Keep local developer commands close to CI commands.

## Fast PR / main gate

Workflow: `.github/workflows/typecheck.yml`

| Job | Command | Purpose |
| --- | --- | --- |
| `repo-hygiene` | `git diff --check` | whitespace/conflict-marker hygiene |
| `wire` | `pnpm ci:wire` | shared schema build and tests |
| `cli` | `pnpm ci:cli` | `lyntty` CLI typecheck and unit tests |
| `relay` | `pnpm ci:relay` | relay typecheck, runtime build, tests |
| `app` | `pnpm ci:app` | app typecheck, i18n ESLint guard, tests, Expo config inspection |
| `agent` | `pnpm ci:agent` | retained agent package typecheck and tests |

This workflow uses `contents: read` and `cancel-in-progress: true`.

## Manual / release tiers

| Workflow | Trigger | Tier | Notes |
| --- | --- | --- | --- |
| `.github/workflows/cli-smoke-test.yml` | `workflow_dispatch` | CLI packaging smoke | Packs/install `lyntty`; Linux also boots packaged `lyntty server` with temp `LYNTTY_HOME_DIR`. |
| `.github/workflows/relay-image.yml` | PR/main path changes + manual | Relay container smoke/release | PR builds image without pushing; main/manual on `main` push pinned GHCR tags. |
| `.github/workflows/relay-deploy.yml` | `workflow_dispatch` | Production deploy | Requires pinned `sha-*` image tag; no floating deploy tags. |
| `.github/workflows/android-release.yml` | `workflow_dispatch` | Android release APK | Signed production APK and `latest.json`; protected by Android secrets. |
| `.github/workflows/docs.yml` | docs/main + manual | Docs | Builds Fumadocs site and deploys Pages. |

## Local developer commands

- `pnpm ci:fast` — run all fast checks sequentially plus `git diff --check`.
- `pnpm ci:wire`, `pnpm ci:cli`, `pnpm ci:relay`, `pnpm ci:app`, `pnpm ci:agent` — package-scoped equivalents.

## Deferrals / rationale

- Android release-style APK build stays manual because it needs signing/Firebase secrets and is slow.
- Full emulator/Maestro E2E remains evidence-driven/manual for now; flows are flaky without dedicated emulator state control.
- Relay production deploy stays manual because it creates external side effects.
- CLI packaging smoke stays manual because it installs global packages and boots a packaged server; fast PR gates still cover CLI build/tests.
