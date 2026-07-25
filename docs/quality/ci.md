# Lyntty CI matrix

Date: 2026-07-26
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
| `repo-hygiene` | frozen root/docs installs + root/docs lifecycle trust + docs audit + hardening/release tests + `docs:check` + `docs:build` + Git whitespace check | lifecycle trust, docs dependency advisories, workflow/evidence/release contracts, complete docs links/anchors/locales/static export, and diff hygiene |
| `wire` | `bun run ci:audit` + `bun run ci:wire` | dependency audit, shared protocol build and tests |
| `cli` | `bun run ci:cli` | `lyntty`/`lynttyd` typecheck and tests |
| `relay` | `bun run ci:relay` | Relay typecheck, compiled build, and tests |
| `app` | `bun run ci:app` | Android app typecheck, i18n guard, tests, and Expo config inspection |
| `dev-isolation` | `bun run ci:dev` | Real isolated Relay/daemon lifecycle, crash receipts, exact ownership, and fail-closed shutdown on Ubuntu and macOS |

Every package job installs with `bun install --frozen-lockfile`. `repo-hygiene` also installs the independent `docs/.site` lockfile, verifies its lifecycle trust and audit, and runs the complete Fumadocs check and static build on every PR, even when no Markdown path changed. The separate `wire` job runs the root dependency audit. This keeps the existing required contexts authoritative for both dependency graphs, generated routes, locale counterparts, internal links, anchors, the Pages base path, and the global 404.

The separately required CLI artifact-smoke workflow runs all five supported target/host pairs on pull requests: Linux x64/arm64, macOS x64/arm64, and Windows x64. Actions are pinned to full commit SHAs. The workflows have `contents: read` and cancel stale runs.

## Docs-only PR short-circuit

All 12 required context names still materialize on every pull request. Neither required workflow uses trigger-level `paths` filters, and no package or matrix job has a job-level condition. `Repo hygiene` always performs its complete root/docs installs, lifecycle checks, repository contracts, docs audit/check/build, and whitespace gate.

The remaining required jobs run the same local classifier after checkout and Bun setup. Only additions or modifications to regular files in the explicit current-guide allowlist or `docs/assets/` image formats are docs-only. A code, workflow, lockfile, package, patch, security, release, deploy, evidence, architecture, or other unlisted path triggers the full gate. Empty diffs, invalid SHAs, Git errors, deletions, renames, type changes, pushes, and manual runs also fail-open to the full gate.

For a verified docs-only pull request, package and artifact matrix jobs stay present and successful but skip expensive work at step-level. This preserves branch-protection identity while avoiding installs, builds, package tests, daemon integration, lifecycle exercises, and five-architecture artifact smoke that cannot validate the changed files.

## Dependency and static-analysis maintenance

Dependabot checks three bounded targets each week: root Bun dependencies, the independent docs Bun lockfile, and SHA-pinned GitHub Actions. Minor and patch updates are grouped per target, maintenance windows are staggered, and each target allows at most three open version-update PRs. Dependabot does not auto-merge. CODEOWNERS routes these files to the owner, while every merge remains subject to the normal required checks.

`.github/workflows/codeql.yml` runs a SHA-pinned CodeQL JavaScript/TypeScript baseline on PRs, main pushes, a weekly schedule, and manual dispatch. It uses `build-mode: none`, does not replace package tests, and is non-required until the first external run is triaged. Any alerts need source-level review before the owner considers adding the CodeQL context to the main ruleset.

## Manual / release tiers

| Workflow | Trigger | Tier | Notes |
| --- | --- | --- | --- |
| `.github/workflows/cli-smoke-test.yml` | PR + manual | CLI artifact smoke | Builds and executes all five supported target artifacts on matching Linux/macOS/Windows architectures, runs exact-inventory self-checks with isolated state and no runtime fallback, and validates native service definitions. It does not publish. |
| `.github/workflows/relay-image.yml` | PR + manual | Relay image verification | Builds the amd64/arm64 OCI layout without publishing, scans both exact platform manifests with Syft, and assembles their hash-bound SPDX 2.3 index. Ordinary main pushes do not publish stable images. |
| `.github/workflows/native-signing.yml` | manual | optional native signature verification | Future-only tooling that verifies externally signed CLI archives, notarization or Authenticode identity/timestamp, complete inventory, and source SHA. The owner-operated first Stable does not invoke or consume it. |
| `.github/workflows/release-candidate.yml` | manual | build-once candidate | Builds channel-bound App/CLI/Relay bytes, SPDX/provenance, signed BOM, checksums, and rolling matrix under a candidate environment; uploads an attested Actions artifact and cannot publish. |
| `.github/workflows/release-promote.yml` | manual | protected promotion | Verifies the exact candidate, pushes the existing OCI layout by digest, resumes an exact draft safely, attests assets, discloses platform-unsigned macOS/Windows archives for self-use Stable, and atomically publishes Stable or Preview without rebuilding. |
| `.github/workflows/release-rollback.yml` | manual | protected Stable rollback | Reuses retained immutable bytes in a new higher signed BOM; no component build runs. |
| `.github/workflows/relay-deploy.yml` | manual | production deployment | Verifies the current signed Stable head plus image signature/provenance/SBOM, deploys its monotonic `@sha256:` image after backup/migrate/doctor, and remains separate from publication while sharing its Stable serialization lock. |
| `.github/workflows/android-release.yml` | manual | Android candidate verification | Builds and audits the signed Stable APK under protected Android credentials, then uploads a short-lived artifact without publishing. |
| `.github/workflows/docs.yml` | docs or published root-document changes on main + manual | docs | Checks/builds the Fumadocs site and deploys Pages. Root SECURITY, PRIVACY, and CONTRIBUTING language pairs are watched because the manifest publishes them. |

Compatibility-BOM publication, component tags, installers, optional native signing, and release promotion are explicit protected workflows; they are never side effects of a normal main push. Stable is the only non-prerelease GitHub latest channel; Preview always uses its separate prerelease identity.

## Local developer commands

- `bun run ci:fast` — repository hardening, audit, all four workspace gates, isolated development lifecycle, and `git diff --check`.
- `bun run ci:wire`, `bun run ci:cli`, `bun run ci:relay`, `bun run ci:app` — workspace-scoped gates.
- `bun run ci:dev` — isolated development lifecycle and crash/ownership safety gate.
- `bun install --frozen-lockfile` — prove the lockfile is complete.
- `bun pm untrusted` — must report zero blocked lifecycle scripts.
- `bun run --cwd docs/.site docs:audit` — audit the independent docs dependency graph.
- `bun run --cwd docs/.site docs:check` — generate manifest-owned pages and typecheck the Fumadocs site.
- `bun run --cwd docs/.site docs:build` — export the site and validate every localized page, raw Markdown file, internal link, anchor, base-path URL, and 404.

## Deferrals / rationale

- Android release-style APK and Maestro E2E remain manual/evidence-driven because they require isolated emulator state and signing inputs.
- Relay image verification does not publish; production deployment is a separate authorized operation.
- CLI packaging smoke is a protected PR gate. `lyntty --self-check` must not create HOME/Pi state, and install/update tests keep all mutable fixtures under ignored package build state rather than the live user environment.
- iOS is best-effort and does not block Android releases.
