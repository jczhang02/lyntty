# R84 — Final Bun-only integration evidence

Date: 2026-07-19

Branch: `refactor/bun-migration`

Bead: `lyntty-6o0.9`

Initial local integration HEAD: `2a952a1110f4da96a7fa2717dbecc2f46ca70c6a`
PR-remediation HEAD before this evidence update: `7a2e095b019596e68f197739c1c9ecf53ddd2811`
Android application source verification HEAD: `e63a93f66d89b2372da9e24562d47c44b84bef3c`

## Result

**LOCAL PASS; PROTECTED PR #14 OPEN.**

The isolated branch satisfies the locally executable Bun-only migration gates. The post-review-fix source passed a frozen install, lifecycle/dependency audits, all four package suites, compiled CLI/daemon/Relay integration, isolated developer lifecycle tests, and a clean current-source release-style Android build under a Node-family execution audit. All 35 migration commits through the PR-remediation HEAD have valid GPG signatures.

Protected PR #14 produced an all-green required matrix on head `76ed6ec`; a final current-head recheck is required after the claim-preservation and evidence commits. This document does not claim a Stable release, production deployment, permanent Android signing, macOS notarization, Windows Authenticode, physical-phone run, or production-data migration.

## Definition-of-Done audit

| # | Requirement | Evidence | Status |
|---|---|---|---|
| 1 | Bun is pinned and only App, CLI, Relay, and Wire remain active workspaces. | `.bun-version`, root `packageManager`, root `workspaces`; removal audit found no Codium, standalone agent/app-logs, Tauri, EAS, pnpm lock/workspace, or old release scripts. | Pass |
| 2 | Frozen install and lifecycle trust are deterministic. | `bun install --frozen-lockfile` changed no lockfile; `bun pm untrusted` reported 0. | Pass |
| 3 | Project/user paths do not require Node/npm/pnpm/npx/tsx. | Active package-script scan found no Node-family command. Compiled CLI/daemon/Relay sentinels passed. Current Android `strace` found 0 Node-family `execve` and 0 sentinel invocation. | Pass |
| 4 | Tests use Bun and all active packages pass. | Wire 33; CLI 584; Relay 119; App 791; developer lifecycle 13; all failed 0. Typechecks/builds passed. | Pass |
| 5 | Product is Android-first and Pi-only with legacy product surfaces removed. | `docs/evidence/r77-bun-app-product-boundary.md`, `docs/evidence/r78-bun-native-tests-api-boundary.md`; current removed-surface/workspace audit. | Pass |
| 6 | `lyntty` and `lynttyd` are runtime-free compiled artifacts. | `docs/evidence/r79-cli-artifact-service-update.md`; current `ci:daemon-integration` rebuilt both executables and exercised them against a compiled isolated Relay. | Pass |
| 7 | Installer, native user service, update, interrupted recovery, and rollback are fail-closed. | R79 artifact/service/update tests and evidence; retained five-target manifests and exact self-check inventories. | Pass; native signatures remain external |
| 8 | Relay is standalone, migration-aware, recoverable, and supports PGlite/PostgreSQL. | `docs/evidence/r80-relay-standalone-migration-recovery.md`; current compiled smoke reran migrate, doctor, backup/restore, health, shutdown, and runtime sentinels; 119 tests passed. | Pass; production-data rehearsal remains separately authorized |
| 9 | Android release-style APK builds through Bun with no Node-family execution. | Current-source R84 APK/audit artifacts below; R81 additionally proves Production configuration fails closed without permanent inputs. | Pass for local Preview evidence; Production signing external |
| 10 | Android shared-control/recovery acceptance remains covered. | R81 guarded Maestro 01–10 passed first run, pairing, shared control, reconnect, daemon replay, recovered reply, reload ownership, `history_gap`, full update, and bad digest. R84 reran a signed Preview Wire/account smoke after Wire/BOM changes; the later control-policy change only narrows malformed identity and has direct test coverage. | Pass on isolated emulator; no physical phone claimed |
| 11 | Component SemVer, Wire capabilities, signed BOM, compatibility history, and replay protection exist. | `docs/evidence/r82-compatibility-release-system.md`; current Wire suite and compiled daemon integration passed. | Pass; R82 fixture key is not a release key |
| 12 | Stable/Preview publication, SBOM/provenance, immutable GHCR promotion, rollback, and Relay deploy are protected and isolated. | R82 workflows/evidence; post-review hardening binds native manifests to clean exact source commits and adds required PR lifecycle/release/platform gates. Workflow hardening, YAML parsing, Bash syntax, and ShellCheck passed. | Implementation pass; real promotion/deploy external |
| 13 | Two worktrees can run isolated development safely. | `docs/evidence/r83-isolated-development-workflow.md`; current 13-test suite includes concurrent lifecycle, port lease, durable receipt recovery, whole-group ownership, and shutdown-race coverage. Protected Linux and macOS jobs passed. | Pass |
| 14 | Documentation/evidence are current and redact auth/signing material. | R76–R84 evidence, current READMEs/release/deploy/development docs; evidence-redaction suite passed. | Pass |
| 15 | Changes are signed and independently reviewed with no unresolved P0/P1/P2. | Phase reviews are recorded in R76–R83. Whole-branch and PR-gate findings were fixed; final focused Standards, Spec, and PR-gate reviews all approved with no P0/P1/P2 blocker. | Pass |
| 16 | Integration occurs only through a protected PR with required CI. | GitHub `main` ruleset is active and requires PR, linear history, signed commits, and 12 named status checks. PR #14 is open; all required checks passed on `76ed6ec`, and merge remains conditional on the final current-head rerun. | Pending final rerun and merge |

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
- CLI: typecheck/build passed, 584 tests passed across 72 files;
- compiled CLI/daemon integration: passed against an isolated compiled Relay with forbidden-runtime sentinels;
- Relay: typecheck/build passed, compiled lifecycle smoke passed, 119 tests passed across 19 files;
- App: typecheck/i18n/Expo introspection passed, 791 tests and 3,183 assertions passed across 87 files;
- development lifecycle: 13 tests and 88 assertions passed; after the final cleanup-safety fix, two serial and two parallel suites each passed 13/13 with no supervisor or state residue;
- all 10 workflow YAML files parsed;
- Bash syntax and ShellCheck passed for 10 active shell files;
- whitespace validation passed.

The final CLI package fix intentionally makes the root CLI entry ESM-only so pkgroll does not generate an invalid CommonJS build for top-level-await `src/index.ts`. `./lib` remains dual ESM/CommonJS, the Bun bin wrapper keeps top-level await, and compiled end-user artifacts are unchanged. Frozen install, package resolution, `ci:cli`, and compiled daemon integration passed after this fix. Independent focused review returned `APPROVE — no P0/P1/P2 ESM-entry blockers.`

Post-review hardening also requires new artifact manifests to carry the exact source commit, rejects dirty source attribution, verifies that commit in native-signing/candidate workflows, adds frozen lifecycle trust and release-contract tests to required PR CI, and runs five supported CLI target artifacts on matching PR runners. Concurrent `dev.test.ts` processes receive private test namespaces while the public per-worktree path remains unchanged. Test teardown now preserves ownership state when `dev:down` fails and restores deliberately corrupted fixtures in `finally` blocks.

## Current-source Android artifact

A clean release-style Preview APK was rebuilt from verification HEAD `e63a93f` with an isolated HOME, Gradle home, Android state, fixed Preview-only signer, `CCACHE_DISABLE=1`, and `strace -f -e execve`.

```text
application_id=dev.jczhang.lyntty.preview
version_name=1.1.0
version_code=910002
debuggable=false
signer_sha256=ebd23c222b690e2be635fe3e52bd70b6fb86c5570ab279bc4e8c1f22ed90ef9c
Node-family execve matches: 0
Sentinel invocations: 0
APK SHA-256: 2424177e210a4182816e56aa8b107e631c73c2976bd0ed14038981a2c4882d6b
```

The signer is the fixed local Preview validation identity, not the permanent Production certificate. `packages/lyntty-app/scripts/apk-audit.sh` confirmed package/version/code, non-debuggable state, and signer. The immediately preceding versionCode `910001` APK was installed on the isolated API 35 AVD `lyntty_r84_api35`; its signed Preview Wire/account Maestro smoke passed. The final `910002` rebuild changes only the now-tested exact Pi-control policy plus review/CI/docs files, and was audited rather than reinstalled. The AVD, emulator, Relay, state, signing fixture, and raw logs were removed afterward.

Tracked summaries are under `docs/evidence/artifacts/r84-final-integration/`.

## Review status

Phase reviews recorded in R76–R83 resolved all reported P0/P1 issues before their signed commits. The post-R83 shutdown snapshot/exit race fix received `APPROVE — no P0/P1/P2 shutdown-race blockers.` The ESM-only package-entry fix received `APPROVE — no P0/P1/P2 ESM-entry blockers.`

The first whole-branch reviews found five P1 mechanisms: whitespace/case-normalized Pi control identity; concurrent test-suite state collision and default timeout; native archive source misattribution; missing PR lifecycle/release-contract checks; and missing Linux arm64/full supported-platform artifact smoke. The implementation now requires exact `flavor === 'pi'`, namespaces test suites, raises the real concurrent lifecycle timeout, binds clean source commits through manifests/native verification, and makes all five target smokes PR gates. A replacement Standards review then found one cleanup-only P1 in the test harness; the final fix preserves ownership state on teardown failure and restores corrupted state in `finally` blocks.

Final focused verdicts:

- `APPROVE — no P0/P1/P2 standards blockers.`
- `APPROVE — no P0/P1/P2 spec blockers.`
- `APPROVE — no P0/P1/P2 PR-gate blockers.`

## Protected PR evidence

PR [#14](https://github.com/jczhang02/lyntty/pull/14) exercised the branch under active ruleset `18673628`. The first complete all-green required head was `76ed6ec81cbddac4dc64b8ca138a2bcde648c73c`:

- Lyntty CI run `29659248984`: Repo hygiene, Wire, CLI plus compiled daemon integration, Relay, App, and isolated development on Ubuntu/macOS all passed.
- CLI Smoke Test run `29659248980`: Linux x64/arm64, macOS x64/arm64, and Windows x64 artifacts all built on matching runners and passed runtime-free self-check/build-info; Linux systemd and macOS LaunchAgent lint passed.
- Relay image run `29659248983`: multi-platform OCI build passed without publication.

Earlier protected failures exposed clean-checkout-only defects that local warm state had hidden: bundled test tools were not unpacked, App/Relay module mocks leaked between files, macOS lacked `flock`, lifecycle tests inherited Bun's five-second timeout, Darwin rejected hard-linking a symlink, the artifact smoke pre-created state it expected absent, and `AGENTS.md`/`agents.md` collided on case-insensitive hosts. Each mechanism received a source fix and reran green. A final P2 review then found that simultaneous pointer publication/restoration failure could discard the claimed old symlink; `7a2e095` preserves and reports that claim, with a 9/9 fault-injection suite and focused approval. The same required checks must rerun on the final documentation head before merge.

## External and protected gates

The following are deliberately not claimed locally:

- permanent Production Android keystore/Firebase inputs/certificate pin and a production-signed APK;
- macOS Developer ID signing/notarization and Windows Authenticode/timestamping;
- real Stable/Preview candidate signing, GitHub Release publication, GHCR push/attestation/promotion, or rollback rehearsal;
- production Relay deployment;
- any rehearsal against a production VPS data copy without separate authorization;
- physical-phone and iOS validation.

These gates remain enforced by protected workflows and environments. Missing credentials or authorization must fail closed and must not be replaced by local fixture evidence.

Before opening the protected PR, active ruleset `18673628` was updated to remove the deleted `lyntty-agent` check and require Repo hygiene, all four active package checks, Linux/macOS isolated-development checks, and all five supported CLI artifact-smoke contexts. No check was bypassed.
