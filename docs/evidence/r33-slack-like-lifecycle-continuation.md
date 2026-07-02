# R33 Slack-like Pi Lifecycle Continuation

Date: 2026-07-02
Task: `lyntty-1zo`

## Scope

Continuation after R32 toward the Slack-like Pi session lifecycle goal:

- enter historical Pi sessions immediately;
- keep stable `machineId + piSessionId -> relay session` mapping;
- reuse/attach active runtimes instead of duplicate spawn;
- mirror ordinary external Pi JSONL writes;
- preserve queued sends while attach/runtime/mirror is settling;
- keep history progressive and reachable.

## Changes

### Stable data-key sessions for deterministic Pi tags

Files:

- `packages/lyntty-cli/src/api/api.ts`
- `packages/lyntty-cli/src/api/apiDataKey.test.ts`
- `packages/lyntty-cli/src/pi/piRelaySessionTag.ts`
- `packages/lyntty-cli/src/pi/runPi.ts`

R32 introduced stable Pi relay tags. Review found a data-key race: two local processes opening the same stable tag could generate different random data keys; the relay returns the existing encrypted metadata for that tag, so the loser could not decrypt it.

Fix: data-key session encryption keys are now derived from the local machine key and relay session tag. This keeps same-tag Pi mirror/runtime processes decrypt-compatible while still encrypting the data key to the app account public key for mobile sync.

### Machine-scoped Pi mirror RPC

Files:

- `packages/lyntty-cli/src/api/apiMachine.ts`
- `packages/lyntty-cli/src/daemon/run.ts`
- `packages/lyntty-relay/sources/app/api/socket/rpcHandler.ts`
- `packages/lyntty-app/sources/sync/ops.ts`

Added machine RPC `ensure-pi-session-mirror`:

- creates/loads the stable relay session for a Pi JSONL session;
- imports the latest history tail through session-protocol envelopes;
- registers `pi-history-page` for older history;
- starts a quiet-window JSONL mirror for future external writes;
- serializes concurrent mirror starts with an in-flight promise;
- suppresses mirror echo while a Lyntty-managed runtime for the same Pi session is active.

### App open path

Files:

- `packages/lyntty-app/sources/hooks/useOpenPiDiscoveredSession.ts`
- `packages/lyntty-app/sources/sync/piDiscoveredSessions.ts`
- `packages/lyntty-app/sources/sync/sync.ts`

Behavior:

- Synthetic historical rows still navigate immediately.
- The app now also asks the node to ensure a Pi mirror so a relay shell/tail can appear before full runtime spawn when possible.
- The first resolved relay session id wins to avoid mirror/spawn navigation ping-pong.
- Synthetic queued sends are protected by a per-session flush guard; concurrent flush calls cannot duplicate sends.
- Synthetic queued sends bump recency and are preserved if real session encryption is not ready.
- Synthetic metadata exposes `piHistoryHasMore` / `piHistoryTotalMessages` for the Session Remote loading affordance.

### Activation lock semantics

Files:

- `packages/lyntty-cli/src/daemon/activationLock.ts`
- `packages/lyntty-cli/src/daemon/run.ts`

Behavior:

- Active Pi runtime reuse and activation checks now use `machineId + piSessionId` when a Pi session id is known.
- Directory locking remains the fallback for new Pi sessions without a session id.
- Same directory with different Pi session ids is no longer falsely blocked.

## Verification

Passed:

```text
pnpm --filter ./packages/lyntty-cli run typecheck
pnpm --filter ./packages/lyntty-app run typecheck
pnpm --filter ./packages/lyntty-relay run typecheck

pnpm --filter ./packages/lyntty-cli test src/api/apiDataKey.test.ts src/api/apiMachine.codexFork.test.ts src/daemon/activationLock.test.ts src/pi/runPiExternalMirror.test.ts src/pi/runPi.test.ts
# 5 files, 21 tests passed

pnpm --filter ./packages/lyntty-app test sources/sync/ops.codexFork.test.ts sources/sync/piDiscoveredSessions.test.ts sources/sync/piSessionOpen.test.ts
# 3 files, 9 tests passed

pnpm --filter ./packages/lyntty-relay test sources/app/api/socket/rpcHandler.spec.ts
# 1 file, 6 tests passed

pnpm --filter ./packages/lyntty-app test
# 64 files, 719 tests passed

pnpm --filter ./packages/lyntty-relay test
# 13 files, 89 tests passed

git diff --check
```

Review:

- Multiple read-only reviewer passes were run.
- Blockers found and fixed: missing machineId payload, synthetic flush races, mirror start races, mirror/runtime duplicate risk, older history reachability, and stable-tag data-key race.
- Latest reviewer pass reported no must-fix blockers in the requested areas.

Full CLI suite note:

```text
pnpm --filter ./packages/lyntty-cli test
```

still fails in pre-existing watcher/session-scanner tests outside this Pi lifecycle diff:

- `src/claude/utils/sessionScanner.test.ts`
- `src/modules/watcher/startFileWatcher.test.ts`

The changed Pi/API/daemon areas passed targeted tests and typecheck. The same two areas were already failing before this continuation.

## APK / Maestro attempt

A fresh local relay was started successfully on `:3005` with `LYNTTY_HOME_DIR=/tmp/lyntty-r33-node`.

Metro/Expo Dev Client startup failed before Maestro could run:

```text
Error: EMFILE: too many open files, watch '/home/jc/dev/lyntty/node_modules'
```

System context:

- `fs.inotify.max_user_instances` is `128`.
- Attempting to raise it via `sysctl -w fs.inotify.max_user_instances=1024` failed with permission denied.
- Relay/Metro test processes were cleaned up after the attempt; no listeners remained on `:3005` or `:8081`.

## Remaining risks / next work

- Fresh APK/Maestro validation still needs an environment that can run Metro or a preview/release APK that embeds the bundle.
- Real physical ordinary `pi` TUI mirror should still be exercised end-to-end; this slice adds the daemon/app/RPC path and deterministic coverage but did not run a real external TUI process.
- Legacy relay sessions created with old random data-key semantics may not be recoverable by deterministic-key CLI processes; new stable Pi tags use the fixed derivation.
