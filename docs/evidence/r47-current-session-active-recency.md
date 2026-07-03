# R47 current session active/recency fix

Date: 2026-07-04
Beads: `lyntty-j9w`

## User-visible bug

Phone opened the current ordinary Pi session but showed no active session and a last-updated time about 8 hours old.

## Workflow review finding

Four read-only review lanes inspected the app, daemon/Pi extension, relay presence/session routes, and full ordinary `pi -> extension -> lynttyd -> relay -> app` path. All agreed this can be caused by code, not only local configuration.

Root causes:

1. Ordinary Pi extension mirrors wrote messages but did not send `session-alive`, so relay presence timeout could mark the session inactive after 10 minutes.
2. Relay `/v3/sessions/:sessionId/messages` wrote `SessionMessage` rows but did not bump parent `Session.updatedAt`, `lastActiveAt`, or `active`, so cold app fetches could keep showing stale recency.
3. Machine-scoped socket connect/keepalive paths did not reliably persist `Machine.active=true`, so fresh app discovery could skip the current node.
4. Daemon `list-pi-sessions` active detection ignored `externalPiMirrors`, so ordinary Pi extension mirrors were not reported as active runtimes.
5. App Pi discovery merge preserved stale `modifiedAt` over fresh relay/heartbeat `registeredUpdatedAt` for active real relay rows.

## Fixes

### Relay activity persistence

- `packages/lyntty-relay/sources/app/api/routes/v3SessionRoutes.ts`
  - When new v3 messages are created, parent session is updated with `active=true`, `lastActiveAt`, and `updatedAt` based on the newest created message.
- `packages/lyntty-relay/sources/app/api/routes/sessionRoutes.ts`
  - Existing stable-tag session lookup now touches `active=true`, `lastActiveAt`, and `updatedAt`, so deterministic Pi relay sessions revive when reused.
- `packages/lyntty-relay/sources/app/api/socket.ts`
  - Machine-scoped socket connect now persists `Machine.active=true` and `lastActiveAt` before emitting the online ephemeral update.
- `packages/lyntty-relay/sources/app/presence/sessionCache.ts`
  - Session and machine keepalive cache entries track current `active` state.
  - Rows with `active=false` are queued for persistence even if the timestamp delta is under the normal 30s write threshold.
  - Machine keepalive flush now writes `active=true`.

### Daemon / Pi extension live state

- `packages/lyntty-cli/src/pi/piExtensionInstall.ts`
  - Global Pi extension now sends `remote_heartbeat` every 60s while enabled.
  - Heartbeat starts on `session_start`, any outgoing event, and `/remote`/`/lyntty` status checks; it stops on `session_shutdown`.
- `packages/lyntty-cli/src/pi/piExtensionEvent.ts`
  - `remote_heartbeat` is treated as a lifecycle event, so it touches mirror presence without producing chat messages.
- `packages/lyntty-cli/src/daemon/run.ts`
  - External Pi mirror sends `session.keepAlive(...)` on extension events.
  - Mirror state is included in registered Pi discovery and active-runtime detection if recently seen.
  - A 30s daemon keepalive interval maintains active presence while extension events are recent.

### App active/recency merge

- `packages/lyntty-app/sources/sync/storageTypes.ts`
  - `PiMachineSessionRecord` includes `registeredUpdatedAt`.
- `packages/lyntty-app/sources/sync/piDiscoveredSessions.ts`
  - Active Pi records prefer fresh `registeredUpdatedAt` over stale local JSONL `modifiedAt`.
  - Real relay rows are marked `active=true`, `presence='online'`, and `activeAt` when discovery reports `active_runtime`.

## Review rounds

- Initial workflow review: found five root causes above.
- Implementation review: found app merge still lost fresh `registeredUpdatedAt` when local `modifiedAt` existed.
- Final blocker recheck: **no blockers**.

## Verification

```bash
pnpm --filter ./packages/lyntty-relay test
pnpm --filter ./packages/lyntty-app exec vitest run sources/sync/piDiscoveredSessions.test.ts sources/sync/sessionRecency.test.ts sources/utils/sessionUtils.test.ts
pnpm --filter ./packages/lyntty-cli exec vitest run --project unit src/pi/piExtensionEvent.test.ts src/daemon/controlServer.piExtension.test.ts src/pi/runPiRecovery.test.ts src/pi/runPiExternalMirror.test.ts
pnpm --filter ./packages/lyntty-relay typecheck
pnpm --filter ./packages/lyntty-app typecheck
pnpm --filter ./packages/lyntty-cli typecheck
pnpm --filter ./packages/lyntty-cli test -- --run
pnpm --filter ./packages/lyntty-app test -- --run
git diff --check
```

Results:

- Relay full suite: 14 files / 92 tests passed.
- App focused session tests: 3 files / 12 tests passed.
- CLI focused Pi/daemon tests: 4 files / 34 tests passed.
- Relay/app/CLI typechecks passed.
- CLI full suite: 88 files / 760 tests passed.
- App full suite: 67 files / 737 tests passed.
- `git diff --check` passed.
- Final reviewer: no blockers.
- Local install/update smoke passed:
  - `pnpm --filter ./packages/lyntty-cli run cli:install`
  - `lyntty remote install`
  - `grep -n "HEARTBEAT_MS\\|remote_heartbeat" /home/jc/.pi/agent/extensions/lyntty/index.ts`

## Operational note

Existing ordinary `pi` processes must load the updated global Lyntty extension before the new heartbeat behavior applies. Run `/reload` in an existing Pi TUI or restart `pi`. The updated extension is installed at `/home/jc/.pi/agent/extensions/lyntty/index.ts` and contains `HEARTBEAT_MS` / `remote_heartbeat`.
