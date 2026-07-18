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
| `repo-hygiene` | frozen install + `bun pm untrusted` + hardening/release tests + Git whitespace check | lifecycle trust, workflow/evidence/release contracts, and diff hygiene |
| `wire` | `bun run ci:audit` + `bun run ci:wire` | dependency audit, shared protocol build and tests |
| `cli` | `bun run ci:cli` | `lyntty`/`lynttyd` typecheck and tests |
| `relay` | `bun run ci:relay` | Relay typecheck, compiled build, and tests |
| `app` | `bun run ci:app` | Android app typecheck, i18n guard, tests, and Expo config inspection |
| `dev-isolation` | `bun run ci:dev` | Real isolated Relay/daemon lifecycle, crash receipts, exact ownership, and fail-closed shutdown on Ubuntu and macOS |

Every package job installs with `bun install --frozen-lockfile`. The separately required CLI artifact-smoke workflow runs all five supported target/host pairs on pull requests: Linux x64/arm64, macOS x64/arm64, and Windows x64. Actions are pinned to full commit SHAs. The workflows have `contents: read` and cancel stale runs.

## Manual / release tiers

| Workflow | Trigger | Tier | Notes |
| --- | --- | --- | --- |
| `.github/workflows/cli-smoke-test.yml` | PR + manual | CLI artifact smoke | Builds and executes all five supported target artifacts on matching Linux/macOS/Windows architectures, runs exact-inventory self-checks with isolated state and no runtime fallback, and validates native service definitions. It does not publish. |
| `.github/workflows/relay-image.yml` | PR + manual | Relay image verification | Builds the compiled Relay image without publishing. Ordinary main pushes do not publish stable images. |
| `.github/workflows/native-signing.yml` | manual | native signature verification | On matching macOS/Windows runners, verifies the exact externally signed CLI archives, notarization or Authenticode identity/timestamp, complete inventory, source SHA, and emits pinned GitHub attestations. It does not publish. |
| `.github/workflows/release-candidate.yml` | manual | build-once candidate | Builds channel-bound App/CLI/Relay bytes, SPDX/provenance, signed BOM, checksums, and rolling matrix under a candidate environment; uploads an attested Actions artifact and cannot publish. |
| `.github/workflows/release-promote.yml` | manual | protected promotion | Verifies the exact candidate, pushes the existing OCI layout by digest, re-verifies native attestations, resumes an exact draft safely, attests assets, and atomically publishes Stable or Preview without rebuilding. |
| `.github/workflows/release-rollback.yml` | manual | protected Stable rollback | Reuses retained immutable bytes in a new higher signed BOM; no component build runs. |
| `.github/workflows/relay-deploy.yml` | manual | production deployment | Verifies the current signed Stable head plus image signature/provenance/SBOM, deploys its monotonic `@sha256:` image after backup/migrate/doctor, and remains separate from publication while sharing its Stable serialization lock. |
| `.github/workflows/android-release.yml` | manual | Android candidate verification | Builds and audits the signed Stable APK under protected Android credentials, then uploads a short-lived artifact without publishing. |
| `.github/workflows/docs.yml` | docs/main + manual | docs | Checks/builds the Fumadocs site and deploys Pages. |

Compatibility-BOM publication, component tags, installers, native signing, and release promotion are explicit protected workflows; they are never side effects of a normal main push. Stable is the only non-prerelease GitHub latest channel; Preview always uses its separate prerelease identity.

## Local developer commands

- `bun run ci:fast` — repository hardening, audit, all four workspace gates, isolated development lifecycle, and `git diff --check`.
- `bun run ci:wire`, `bun run ci:cli`, `bun run ci:relay`, `bun run ci:app` — workspace-scoped gates.
- `bun run ci:dev` — isolated development lifecycle and crash/ownership safety gate.
- `bun install --frozen-lockfile` — prove the lockfile is complete.
- `bun pm untrusted` — must report zero blocked lifecycle scripts.

## Deferrals / rationale

- Android release-style APK and Maestro E2E remain manual/evidence-driven because they require isolated emulator state and signing inputs.
- Relay image verification does not publish; production deployment is a separate authorized operation.
- CLI packaging smoke is a protected PR gate. `lyntty --self-check` must not create HOME/Pi state, and install/update tests keep all mutable fixtures under ignored package build state rather than the live user environment.
- iOS is best-effort and does not block Android releases.
