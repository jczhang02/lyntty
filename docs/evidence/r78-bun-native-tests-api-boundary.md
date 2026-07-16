# R78 — Bun-native tests and API/product boundary

Date: 2026-07-16

Branch: `refactor/bun-migration`

Bead: `lyntty-6o0.2`

## Scope

This round completes the four-workspace Bun test boundary and removes the remaining current App/Relay browser, SaaS, and non-Pi control surfaces without altering historical evidence or applied database migrations.

Implemented:

- App, CLI, Relay, and Wire tests use native `bun:test`; Vitest configs/dependencies are removed.
- App is Android-native/Pi-only. Web/Tauri/EAS/OTA, social/voice/subscription/artifact/provider-selection, and unused telemetry state are absent from current product paths.
- Only explicit `flavor: 'pi'` sessions can send, execute runtime/file/git/history RPC, answer permissions, stop a runtime, or clean a worktree. Flavorless and old-provider sessions remain encrypted history only.
- New Session binds worktree inventory to exact machine, normalized base path, connectivity, and request generation. Loading/failure/stale results cannot silently retarget a spawn.
- Machine RPC results use runtime schemas and reject malformed, conflicting, or enriched success/error envelopes.
- Relay is API-only and keeps auth, account settings, machines, sessions, v3 messages, attachments, push/presence, and current Pi/worktree/file/history/permission RPCs. Static browser serving and inherited artifact/access-key/KV/social/feed/voice/vendor/dev routes are removed.
- Prisma schema and all applied migrations remain for expand–migrate–contract compatibility. PGlite remains default and PostgreSQL remains explicit.
- `LYNTTY_MASTER_SECRET` is canonical; the legacy name is compatibility-only and the existing token derivation domain is unchanged.
- Compiled Relay command dispatch now works in the executable. Automated smoke proves help, all PGlite migrations, health serving, and graceful shutdown.
- The stale authenticated integration harness was replaced by an isolated compiled `lyntty`/`lynttyd` + compiled Relay test. It uses temporary HOME/state/database/port and sentinels that fail if a shipped runtime invokes Bun, Node, npm, pnpm, npx, or tsx.
- Obsolete Node/pnpm web/server Dockerfiles and stale voice/Web postinstall patches are removed.

## Verification

All commands ran from `/home/jc/dev/lyntty/worktrees/bun-migration`.

```bash
bun install --frozen-lockfile
bun pm untrusted
bun audit
bun run ci:fast
bun run ci:daemon-integration
git diff --check
```

Results:

- frozen install: 1,362 installs / 1,434 packages, no changes;
- lifecycle audit: 0 untrusted dependencies with scripts;
- dependency audit: no vulnerabilities found;
- repository hardening: 6/6;
- Wire: build pass, 19/19 native Bun tests;
- CLI: typecheck/build pass, 530/530 native Bun tests;
- Relay: typecheck/compiled build pass, 96/96 native Bun tests;
- compiled Relay smoke: help, 39 migrations, persisted PGlite files, `/health`, SIGTERM shutdown pass;
- App: typecheck/i18n pass, 787/787 native Bun tests;
- compiled daemon integration: auth, machine registration, detached compiled CLI daemon, foreground compiled `lynttyd`, status/list/stop, Relay shutdown, and forbidden-runtime sentinel pass;
- `git diff --check`: pass.

The integration and compiled smoke use temporary directories under `/tmp` and remove them after completion. They do not read or write live `~/.pi`, `~/.lyntty`, active Pi/tmux sessions, or production Relay state.

## Independent review

Two independent closure reviews returned **APPROVE** with no unresolved P0/P1 or important P2:

- App boundary/control review: explicit-Pi controls, attachment ordering/atomicity, machine RPC validation, draft delivery, activation/takeover, worktree request identity, and dynamic git control checked.
- Relay/API/runtime review: API-only route/RPC contract, master-secret compatibility, compiled dispatch/smoke, ESM typecheck, database compatibility, and compiled daemon integration checked.

Earlier review findings were fixed before approval, including flavorless control, malformed RPC success envelopes, legacy git/worktree runtime control, stale worktree selection, compiled Relay no-op dispatch, and compiled daemon self-spawn through Bun.

## Not run in this round

- A new release-style APK and Maestro run were not produced after these source changes. Existing R77 APK hashes do not represent this diff.
- Production Android signing/release and production Relay deployment were not attempted.
- macOS Developer ID/notarization and Windows Authenticode remain external stable-release gates.
- PostgreSQL old-data migration/rollback was not rerun because this round did not change Prisma schema or migrations; the compiled PGlite migration path was rerun. Cross-provider release evidence remains required before stable.

## Residual work

The Bun-only epic remains open. Next work covers reproducible release archives, installer/service/updater rollback, developer orchestration, Wire capability negotiation, signed Compatibility BOM/SBOM/provenance, stable/preview release isolation, clean Android APK/Maestro evidence, supported-platform smoke, and protected-PR integration.
