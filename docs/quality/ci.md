# Lyntty CI matrix

Date: 2026-07-14
Status: active Bun-only target

## Goals

- Keep pull-request gates fast, parallel, deterministic, and limited to the four active workspaces.
- Use the pinned Bun toolchain for install, scripts, tests, builds, and packaging.
- Keep workflow permissions minimal and cancel stale runs.
- Separate verification, component release, and production deployment.
- Keep local commands equivalent to CI commands.

## Fast PR / main gate

Workflow: `.github/workflows/typecheck.yml`

| Job | Command | Purpose |
| --- | --- | --- |
| `repo-hygiene` | `bun run test:repo-hardening` + Git whitespace check | workflow/evidence hardening and diff hygiene |
| `wire` | `bun run ci:audit` + `bun run ci:wire` | dependency audit, shared protocol build and tests |
| `cli` | `bun run ci:cli` | `lyntty`/`lynttyd` typecheck and tests |
| `relay` | `bun run ci:relay` | Relay typecheck, compiled build, and tests |
| `app` | `bun run ci:app` | Android app typecheck, i18n guard, tests, and Expo config inspection |

Every package job installs with `bun install --frozen-lockfile`. Actions are pinned to full commit SHAs. The workflow has `contents: read` and `cancel-in-progress: true`.

## Manual / release tiers

| Workflow | Trigger | Tier | Notes |
| --- | --- | --- | --- |
| `.github/workflows/cli-smoke-test.yml` | manual | CLI artifact smoke | Builds complete standalone archives on Linux/macOS and a Windows artifact, runs exact-inventory self-checks with isolated state and no runtime fallback, and exercises native service/transaction unit gates. It does not publish. |
| `.github/workflows/relay-image.yml` | PR + manual | Relay image verification | Builds the compiled Relay image without publishing. Ordinary main pushes do not publish stable images. |
| `.github/workflows/relay-deploy.yml` | manual | production deployment | Requires an explicitly pinned image and remains separate from release. |
| `.github/workflows/android-release.yml` | manual | Android release APK | Builds the signed full APK; protected Android credentials are required. |
| `.github/workflows/docs.yml` | docs/main + manual | docs | Checks/builds the Fumadocs site and deploys Pages. |

Compatibility-BOM publication, component tags, installers, native signing, and release promotion belong to the dedicated release workflow; they must not be side effects of a normal main push.

## Local developer commands

- `bun run ci:fast` — repository hardening, audit, all four workspace gates, and `git diff --check`.
- `bun run ci:wire`, `bun run ci:cli`, `bun run ci:relay`, `bun run ci:app` — workspace-scoped gates.
- `bun install --frozen-lockfile` — prove the lockfile is complete.
- `bun pm untrusted` — must report zero blocked lifecycle scripts.

## Deferrals / rationale

- Android release-style APK and Maestro E2E remain manual/evidence-driven because they require isolated emulator state and signing inputs.
- Relay image verification does not publish; production deployment is a separate authorized operation.
- CLI packaging smoke is manual because it compiles complete platform artifacts. `lyntty --self-check` must not create HOME/Pi state, and install/update tests keep all mutable fixtures under ignored package build state rather than the live user environment.
- iOS is best-effort and does not block Android releases.
