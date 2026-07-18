# R84 — Final Bun-only integration evidence

Date: 2026-07-19

Branch: `refactor/bun-migration`

Bead: `lyntty-6o0.9`

Post-review-fix implementation HEAD: `abd206b` (full SHA recorded after final evidence commit)

## Result

**LOCAL PACKAGE GATES PASS; FINAL CURRENT-SOURCE APK AND PROTECTED-PR GATES PENDING.**

The isolated branch satisfies the package-level Bun-only migration gates. The post-review-fix source passed a frozen install, lifecycle/dependency audits, all four package suites, compiled CLI/daemon/Relay integration, and isolated developer lifecycle tests. The retained Android release-style audit and API 35 smoke were produced immediately before the final exact-Pi-control fix; a final current-source APK rebuild is still required. All committed migration changes through the implementation HEAD have valid GPG signatures.

This document does not claim a Stable release, production deployment, permanent Android signing, macOS notarization, Windows Authenticode, physical-phone run, or production-data migration. The branch must still pass the protected GitHub PR checks before merge.

## Definition-of-Done audit

| # | Requirement | Evidence | Status |
|---|---|---|---|
| 1 | Bun is pinned and only App, CLI, Relay, and Wire remain active workspaces. | `.bun-version`, root `packageManager`, root `workspaces`; removal audit found no Codium, standalone agent/app-logs, Tauri, EAS, pnpm lock/workspace, or old release scripts. | Pass |
| 2 | Frozen install and lifecycle trust are deterministic. | `bun install --frozen-lockfile` changed no lockfile; `bun pm untrusted` reported 0. | Pass |
| 3 | Project/user paths do not require Node/npm/pnpm/npx/tsx. | Active package-script scan found no Node-family command. Compiled CLI/daemon/Relay sentinels passed. Current Android `strace` found 0 Node-family `execve` and 0 sentinel invocation. | Pass |
| 4 | Tests use Bun and all active packages pass. | Wire 33; CLI 582; Relay 119; App 791; developer lifecycle 13; all failed 0. Typechecks/builds passed. | Pass |
| 5 | Product is Android-first and Pi-only with legacy product surfaces removed. | `docs/evidence/r77-bun-app-product-boundary.md`, `docs/evidence/r78-bun-native-tests-api-boundary.md`; current removed-surface/workspace audit. | Pass |
| 6 | `lyntty` and `lynttyd` are runtime-free compiled artifacts. | `docs/evidence/r79-cli-artifact-service-update.md`; current `ci:daemon-integration` rebuilt both executables and exercised them against a compiled isolated Relay. | Pass |
| 7 | Installer, native user service, update, interrupted recovery, and rollback are fail-closed. | R79 artifact/service/update tests and evidence; retained five-target manifests and exact self-check inventories. | Pass; native signatures remain external |
| 8 | Relay is standalone, migration-aware, recoverable, and supports PGlite/PostgreSQL. | `docs/evidence/r80-relay-standalone-migration-recovery.md`; current compiled smoke reran migrate, doctor, backup/restore, health, shutdown, and runtime sentinels; 119 tests passed. | Pass; production-data rehearsal remains separately authorized |
| 9 | Android release-style APK builds through Bun with no Node-family execution. | R84 retained APK/audit artifacts below and R81 Production fail-closed evidence. A post-review exact-Pi-control fix requires one final current-source rebuild. | Pending final local rebuild; Production signing external |
| 10 | Android shared-control/recovery acceptance remains covered. | R81 guarded Maestro 01–10 passed first run, pairing, shared control, reconnect, daemon replay, recovered reply, reload ownership, `history_gap`, full update, and bad digest. R84 reran a signed Preview Wire/account smoke after Wire/BOM changes; the later control-policy change only narrows malformed identity and has direct test coverage. | Pass on isolated emulator; no physical phone claimed |
| 11 | Component SemVer, Wire capabilities, signed BOM, compatibility history, and replay protection exist. | `docs/evidence/r82-compatibility-release-system.md`; current Wire suite and compiled daemon integration passed. | Pass; R82 fixture key is not a release key |
| 12 | Stable/Preview publication, SBOM/provenance, immutable GHCR promotion, rollback, and Relay deploy are protected and isolated. | R82 workflows/evidence; post-review hardening binds native manifests to clean exact source commits and adds required PR lifecycle/release/platform gates. Workflow hardening, YAML parsing, Bash syntax, and ShellCheck passed. | Implementation pass; real promotion/deploy external |
| 13 | Two worktrees can run isolated development safely. | `docs/evidence/r83-isolated-development-workflow.md`; current 13-test suite includes concurrent lifecycle, port lease, durable receipt recovery, whole-group ownership, and shutdown-race coverage. | Pass locally; macOS PR matrix pending |
| 14 | Documentation/evidence are current and redact auth/signing material. | R76–R84 evidence, current READMEs/release/deploy/development docs; evidence-redaction suite passed. | Pass |
| 15 | Changes are signed and independently reviewed with no unresolved P0/P1. | Phase reviews are recorded in R76–R83. First whole-branch Standards/Spec review found exact-Pi identity, test isolation, provenance, PR trust/release tests, and supported-platform smoke gaps; all have implementation fixes. Replacement verdicts are pending. | Pending final re-review |
| 16 | Integration occurs only through a protected PR with required CI. | GitHub `main` ruleset is active and requires PR, linear history, signed commits, and status checks. Branch is not merged or directly pushed to `main`. | Pending protected PR |

## Latest local gates

Commands ran from `/home/jc/dev/lyntty/worktrees/bun-migration` with Bun `1.3.14`:

```bash
bun install --frozen-lockfile
bun pm untrusted
bun audit
bun run test:repo-hardening
bun run ci:wire
bun run ci:cli
bun run ci:daemon-integration
bun run ci:relay
bun run ci:app
bun run ci:dev
git diff --check
```

Results:

- dependency audit: no vulnerabilities;
- repository hardening/redaction: 16 passed;
- Wire: build passed, 33 tests passed across 5 files;
- CLI: typecheck/build passed, 583 tests passed across 72 files;
- compiled CLI/daemon integration: passed against an isolated compiled Relay with forbidden-runtime sentinels;
- Relay: typecheck/build passed, compiled lifecycle smoke passed, 119 tests passed across 19 files;
- App: typecheck/i18n/Expo introspection passed, 791 tests and 3,183 assertions passed across 87 files;
- development lifecycle: 13 tests and 88 assertions passed;
- all 10 workflow YAML files parsed;
- Bash syntax and ShellCheck passed for 10 active shell files;
- whitespace validation passed.

The final CLI package fix intentionally makes the root CLI entry ESM-only so pkgroll does not generate an invalid CommonJS build for top-level-await `src/index.ts`. `./lib` remains dual ESM/CommonJS, the Bun bin wrapper keeps top-level await, and compiled end-user artifacts are unchanged. Frozen install, package resolution, `ci:cli`, and compiled daemon integration passed after this fix. Independent focused review returned `APPROVE — no P0/P1/P2 ESM-entry blockers.`

Post-review hardening also requires new artifact manifests to carry the exact source commit, rejects dirty source attribution, verifies that commit in native-signing/candidate workflows, adds frozen lifecycle trust and release-contract tests to required PR CI, and runs five supported CLI target artifacts on matching PR runners. Two concurrent `dev.test.ts` processes passed independently after receiving private test namespaces; the public per-worktree state path is unchanged.

## Retained pre-final-review Android artifact

A clean release-style Preview APK was built with an isolated HOME, Gradle home, Android state, throwaway Preview signer, and `strace -f -e execve`. The final emulator-targeted build used `CCACHE_DISABLE=1`; an earlier attempt failed only because the host ccache wrapper returned `Permission denied`, before a usable APK was produced.

```text
application_id=dev.jczhang.lyntty.preview
version_name=1.1.0
version_code=910001
debuggable=false
signer_sha256=ebd23c222b690e2be635fe3e52bd70b6fb86c5570ab279bc4e8c1f22ed90ef9c
Node-family execve matches: 0
Sentinel invocations: 0
APK SHA-256: 428dde244258fe97f4d78fc3b0f7b0ab6fec6a3de138f56597d02cafb4da823b
```

This artifact predates only the final exact `flavor === 'pi'` fail-closed policy change and is therefore retained as build/smoke evidence, not yet claimed as the final current-source APK. The signer is the fixed local Preview validation identity, not the permanent Production certificate. `packages/lyntty-app/scripts/apk-audit.sh` confirmed package/version/code, non-debuggable state, and signer. The APK was installed on the isolated API 35 AVD `lyntty_r84_api35`; the current signed Preview Wire/account Maestro smoke passed. The AVD, emulator, Relay, state, signing fixture, and raw logs were removed afterward.

Tracked summaries are under `docs/evidence/artifacts/r84-final-integration/`.

## Review status

Phase reviews recorded in R76–R83 resolved all reported P0/P1 issues before their signed commits. The post-R83 shutdown snapshot/exit race fix received `APPROVE — no P0/P1/P2 shutdown-race blockers.` The ESM-only package-entry fix received `APPROVE — no P0/P1/P2 ESM-entry blockers.`

The first whole-branch reviews found five P1 mechanisms: whitespace/case-normalized Pi control identity; concurrent test-suite state collision and default timeout; native archive source misattribution; missing PR lifecycle/release-contract checks; and missing Linux arm64/full supported-platform artifact smoke. The implementation now requires exact `flavor === 'pi'`, namespaces test suites, raises the real concurrent lifecycle timeout, binds clean source commits through manifests/native verification, and makes all five target smokes PR gates. Final replacement verdicts will be inserted after re-review.

## External and protected gates

The following are deliberately not claimed locally:

- permanent Production Android keystore/Firebase inputs/certificate pin and a production-signed APK;
- macOS Developer ID signing/notarization and Windows Authenticode/timestamping;
- real Stable/Preview candidate signing, GitHub Release publication, GHCR push/attestation/promotion, or rollback rehearsal;
- production Relay deployment;
- any rehearsal against a production VPS data copy without separate authorization;
- physical-phone and iOS validation.

These gates remain enforced by protected workflows and environments. Missing credentials or authorization must fail closed and must not be replaced by local fixture evidence.
