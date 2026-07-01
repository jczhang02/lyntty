# R18 Sessions Home Pi History Sync

## Problem

User reported R17 fixed the wrong surface. Node Management could list Pi history, but Lyntty's main `Sessions Home` still did not show all sessions on the node. Required behavior:

- `Sessions Home` must show local node `pi` sessions, not only relay-created sessions.
- Session title must sync from the canonical Pi session title, not show a Pi/session id.
- Rows must show useful Pi history info.
- Opening a discovered node session must attach to the matching Pi JSONL session.
- Human-style APK E2E must verify the flow.

## Fix

### Sessions Home merges node Pi history

- Added `mergePiDiscoveredSessions()` in `packages/lyntty-app/sources/sync/piDiscoveredSessions.ts`.
- `sync.fetchSessions()` now also asks online machines for `list-pi-sessions` and merges those records into the normal session store.
- Discovered local Pi sessions become local synthetic rows with stable ids `pi-local:<machineId>:<piSessionId>`.
- Registered/active relay sessions are enriched with Pi discovery metadata instead of duplicated.
- `applySessions()` deletes stale synthetic rows when a real relay session for the same `machineId + piSessionId` appears.

### Row information

- Session metadata now carries Pi discovery fields:
  - `piDiscoveryState`
  - `piMessageCount`
  - `piFirstMessage`
  - `piRecoveryReason`
  - `piHasHistoryGap`
  - `piSynthetic`
- `getSessionName()` already prefers `metadata.name`; now Pi discovered rows are built with `name = Pi session title`.
- `getSessionSubtitle()` shows Pi history info such as `~/dev/lyntty • 2 messages • discovered_local`.
- `SessionsList` shows this full subtitle for Pi history rows instead of only folder basename.

### Opening discovered local Pi sessions

- Tapping a synthetic Pi row calls `machineSpawnNewSession({ sessionId: piSessionId, agent: 'pi' })`.
- `lynttyd/runPi` opens the exact local Pi JSONL via `LYNTTY_PI_SESSION_ID` + `SessionManager.open(...)`.

### RPC size fix found by E2E

Human E2E exposed a real blocker: `list-pi-sessions` initially returned a 25MB encrypted response, causing websocket transport close and leaving `Sessions Home` empty. Root cause: large Pi text fields were passed through discovery records.

Fix:

- Truncate Pi `name` and `firstMessage` fields to 240 chars before machine RPC exposure.
- Post-fix `list-pi-sessions` encrypted response size dropped to about `338968` bytes and completed successfully.

## Verification commands

```bash
pnpm --filter ./packages/lyntty-cli run typecheck
pnpm --filter ./packages/lyntty-cli exec vitest run \
  src/pi/runPiRecovery.test.ts \
  src/api/apiMachine.codexFork.test.ts

pnpm --filter ./packages/lyntty-app run typecheck
pnpm --filter ./packages/lyntty-app exec vitest run \
  sources/sync/piDiscoveredSessions.test.ts \
  sources/sync/piSessionOps.test.ts \
  sources/utils/sessionUtils.test.ts

git diff --check
```

Results:

- CLI typecheck passed.
- CLI focused tests: 19 passed.
- App typecheck passed.
- App focused tests: 7 passed.
- `git diff --check` passed.

## Human-style Android E2E

Environment:

- Emulator: `emulator-5554`.
- Relay: `lyntty server --host 0.0.0.0 --port 3005 --reset --no-persist`.
- App: Expo dev client, `EXPO_PUBLIC_LYNTTY_SERVER_URL=http://192.168.100.21:3005`.
- Node: isolated `LYNTTY_HOME_DIR=/tmp/lyntty-e2e-r18-node`.

Validated flow:

1. Cleared emulator app state and created fresh local Lyntty account.
2. Paired node with terminal deep link.
3. Started `lynttyd` for the paired node.
4. `Sessions Home` populated directly with node-local Pi sessions.
5. Rows showed Pi titles, not ids:
   - `jc: pi sum calculation session`
   - `dev: greeting session naming baseline`
   - `lyntty: pong reply session naming`
   - `lyntty: e2e pong reply session`
6. Rows showed Pi history details, for example:
   - `~ • 2 messages • discovered_local`
   - `~/dev/lyntty • 2 messages • discovered_local`
7. Tapped `jc: pi sum calculation session` from `Sessions Home`.
8. App opened `Session Remote` with header title `jc: pi sum calculation session` and Pi runtime connected to session `019f1ce6-aee1-72b5-8020-178c4c499320`.
9. Sent message via phone and confirmed Pi reply `R18_PONG` rendered in mobile UI.
10. Returned to `Sessions Home`; duplicate synthetic row for the opened session was removed. Title count for `jc: pi sum calculation session` was `1`.
11. Logcat scan showed no fatal Lyntty/ReactNative errors.

Key artifacts:

- `docs/evidence/artifacts/r18-session-home-pi-history/21-session-home-after-compact-rpc.png` — Sessions Home shows node Pi history titles/details.
- `docs/evidence/artifacts/r18-session-home-pi-history/22-open-discovered-session.png` — discovered Pi history row opens Session Remote.
- `docs/evidence/artifacts/r18-session-home-pi-history/24-r18-pong-retry.png` — phone-to-Pi-to-phone reply `R18_PONG` visible.
- `docs/evidence/artifacts/r18-session-home-pi-history/27-session-home-deduped.png` — duplicate synthetic row removed after relay session exists.

## Remaining limitations

- This is dev-client APK E2E, not release APK E2E.
- Full bulk backfill of every historical Pi message into relay storage is still not implemented; opening a discovered row attaches to the canonical local Pi JSONL runtime. `Sessions Home` now shows session metadata/history summary for all node-local Pi sessions.
