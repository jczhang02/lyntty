# R49 Whole-Code Review and Fix Pass

Date: 2026-07-04
Beads: `lyntty-wox`

## Scope

User requested another whole-project review until no blockers remained. Review covered:

- mobile app sync/render/session state/E2E selectors
- daemon/Pi extension/current-session mirror lifecycle
- relay auth/presence/session message persistence/security
- `lyntty-wire` session/message schemas
- committed Maestro/release-matrix coverage

## Review rounds

1. Four read-only reviews: app, daemon/Pi, relay/security, E2E matrix.
2. Four post-fix rechecks: app, daemon/Pi, relay/security, final coverage.
3. Final unblock review after second-round fixes.

Final review result: no blocking review remains after the last fixes. Last artifact/blocker recheck reported `no blockers`. Residual risks are listed below.

## Fixes

### App

- `ToolFullView` now receives session metadata from the message detail route.
- Unknown generic Pi/Gemini tools no longer show raw `input`/`result` payloads in full-view UI, including dev raw JSON view.
- `syncReset()` now clears socket config/listeners, sync queues/maps, encryption key caches, and volatile Zustand state.
- Full session fetch now applies a replace snapshot, so stale rows from old accounts/servers/deleted relay sessions are removed.
- Sessions Home/recent rows now expose stable `lyntty-session-row-<sessionId>` test IDs and labels.

### Daemon / Pi extension

- Installed Pi extension payloads now carry monotonic `eventId` values.
- Daemon drops duplicate/retried extension events and detects sequence gaps.
- If a message-update gap occurs, `agent_end` does not mark assistant JSONL entries delivered; JSONL fallback can repair the tail.
- `session_shutdown` stops the mirror and sends `session-end` through the relay session client so the app does not keep it active.

### Relay / wire

- Auth-request rows now have `expiresAt`/`consumedAt`; token minting consumes requests once and old/null-expiry authorized rows are rejected.
- Auth logs use public-key fingerprints instead of full public keys.
- Machine socket disconnect uses an atomic `lastActiveAt <= disconnectedAt` guard and emits offline only if the DB row was actually changed.
- Session activity cache uses guarded `updateMany` so stale queued alive updates do not resurrect sessions after `session-end`.
- v3 session messages reject same `localId` with different encrypted content, including same-batch conflicts.
- Socket message path rejects same `localId` with different encrypted content.
- `lyntty-wire` adds caps for encrypted content/localId/timestamps/session-protocol text/tool payloads/file sizes and aggregate update-session/update-machine bodies.

### E2E infrastructure

- Added `scripts/e2e/release-matrix.sh` and `pnpm e2e:release-matrix`.
- Matrix supports explicit `LYNTTY_RELEASE_MATRIX_MODE=local|production`:
  - `local`: emulator HTTP relay, `APP_ENV=preview`, `http://10.0.2.2:3005` app URL.
  - `production`: requires HTTPS server URL and builds with `APP_ENV=production`.
- Script redacts pairing URLs and encryption-key fields from artifacts after run.

## Verification

Automated checks passed:

- `pnpm --filter ./packages/lyntty-wire build`
- `pnpm --filter ./packages/lyntty-cli test -- --run` — 88 files / 764 tests
- `pnpm --filter ./packages/lyntty-app test -- --run` — 68 files / 739 tests
- `pnpm --filter ./packages/lyntty-relay test -- --run` — 14 files / 93 tests
- `pnpm --filter ./packages/lyntty-wire test -- --run` — 2 files / 19 tests
- `pnpm --filter ./packages/lyntty-agent test -- --run` — 9 files / 227 tests
- app/relay/wire/agent typechecks passed
- focused post-fix checks passed for Pi extension/mirror/session-protocol, app tool payload policy, v3 messages, wire schemas
- `bash -n scripts/e2e/release-matrix.sh scripts/e2e/run-maestro.sh`
- `git diff --check`

Maestro smoke:

- `04_reconnect_smoke` passed in 25s with a visible session row configured through `LYNTTY_MAESTRO_HISTORY_TITLE`.
- Artifacts: `docs/evidence/artifacts/r49-review-e2e/04_reconnect_smoke-fixed/`
- Artifact sensitive scan found no pairing URLs, encryption-key fields, bearer tokens, or JWT-like strings.

## Residual risks

- Full release matrix script was syntax-checked and reviewed but not executed end-to-end in R49.
- Existing ordinary Pi processes still need `/reload` or restart to load newly installed extension changes.
- Auth request proof-of-possession over a server nonce is still future hardening; R49 closes replayable token minting via expiry/consumption and redacted logs without changing the mobile/CLI pairing protocol.
