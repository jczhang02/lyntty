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
- `packages/lyntty-app/sources/sync/piSessionOpenRequest.ts`
- `packages/lyntty-app/sources/sync/sync.ts`

Behavior:

- Synthetic historical rows still navigate immediately.
- The app now also asks the node to ensure a Pi mirror so a relay shell/tail can appear before full runtime spawn when possible.
- The first resolved relay session id wins to avoid mirror/spawn navigation ping-pong.
- A late `spawn-lyntty-session` timeout is suppressed once the mirror/relay session has already attached, preventing a stale modal over an otherwise usable Session Remote.
- Synthetic queued sends are protected by a per-session flush guard; concurrent flush calls cannot duplicate sends.
- Synthetic queued sends bump recency and are preserved if real session encryption is not ready.
- Synthetic metadata exposes `piHistoryHasMore` / `piHistoryTotalMessages` for the Session Remote loading affordance.

### Activation lock semantics

Files:

- `packages/lyntty-cli/src/daemon/activationLock.ts`
- `packages/lyntty-cli/src/daemon/run.ts`
- `packages/lyntty-cli/src/index.ts`

Behavior:

- Active Pi runtime reuse and activation checks now use `machineId + piSessionId` when a Pi session id is known.
- Directory locking remains the fallback for new Pi sessions without a session id.
- Same directory with different Pi session ids is no longer falsely blocked.
- Daemon-spawned `lyntty pi --started-by daemon` no longer calls `ensureDaemonRunning()`, avoiding the release-APK bug where a Pi child started a second daemon and disconnected the machine RPC target.

## Verification

Passed:

```text
pnpm --filter ./packages/lyntty-cli run typecheck
pnpm --filter ./packages/lyntty-app run typecheck
pnpm --filter ./packages/lyntty-relay run typecheck

pnpm --filter ./packages/lyntty-cli test src/api/apiDataKey.test.ts src/api/apiMachine.codexFork.test.ts src/daemon/activationLock.test.ts src/pi/runPiExternalMirror.test.ts src/pi/runPi.test.ts
# 5 files, 21 tests passed

pnpm --filter ./packages/lyntty-app test sources/sync/ops.codexFork.test.ts sources/sync/piDiscoveredSessions.test.ts sources/sync/piSessionOpen.test.ts
# 3 files, 11 tests passed after the release-APK stale-spawn-modal fix

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

## Release APK / Maestro validation

Metro/Expo Dev Client initially failed with `EMFILE: too many open files, watch '/home/jc/dev/lyntty/node_modules'` on this machine (`fs.inotify.max_user_instances=128`, no permission to raise it). To avoid treating a local watcher limit as product evidence, validation switched to a release APK with the JS bundle embedded.

Release APK fixes made during validation:

- `packages/lyntty-app/app.config.js` and `packages/lyntty-app/plugins/withEinkCompatibility.js`: development/preview Android builds now explicitly set `android:usesCleartextTraffic="true"`; the release APK built as the development variant can talk to the local relay at `http://10.0.2.2:3005`.
- `packages/lyntty-app/sources/app/(app)/index.tsx`: first-run onboarding now uses a text `LYNTTY` wordmark instead of the stale Happy-like logotype image.
- `packages/lyntty-cli/src/index.ts`: daemon-spawned `pi` sessions skip daemon self-ensure, preventing the spawned runtime from replacing the daemon that owns the machine RPC socket.
- `packages/lyntty-app/sources/hooks/useOpenPiDiscoveredSession.ts`: if mirror attach has already resolved a relay session, late spawn timeout errors are ignored instead of showing a stale modal.

Release APK build:

```text
EXPO_PUBLIC_LYNTTY_SERVER_URL=http://10.0.2.2:3005 \
CCACHE_DISABLE=1 CMAKE_C_COMPILER_LAUNCHER= CMAKE_CXX_COMPILER_LAUNCHER= \
./gradlew assembleRelease --no-daemon
# packages/lyntty-app/android/app/build/outputs/apk/release/app-release.apk, 291M
```

Release APK Maestro run with local relay `LYNTTY_HOME_DIR=/tmp/lyntty-r35-release-node`:

```text
e2e/maestro/01_first_run.yml
# passed in 14s

e2e/maestro/02_pair_node.yml
# prepare passed in 9s; accept passed in 3s

e2e/maestro/03_history_send_reply.yml
# passed in 28s with PONG marker R33_OK

e2e/maestro/04_reconnect_smoke.yml
# passed in 1m20s
```

Artifacts:

- `docs/evidence/artifacts/r33-release-apk/prebuild-cleartext-plugin.log`
- `docs/evidence/artifacts/r33-release-apk/assemble-release-after-spawn-error-fix.log`
- `docs/evidence/artifacts/r33-release-apk/run7/01_first_run/junit.xml`
- `docs/evidence/artifacts/r33-release-apk/run7/02_pair/prepare/prepare-junit.xml`
- `docs/evidence/artifacts/r33-release-apk/run7/02_pair/accept/accept-junit.xml`
- `docs/evidence/artifacts/r33-release-apk/run7/03_history/junit.xml`
- `docs/evidence/artifacts/r33-release-apk/run7/04_reconnect/junit.xml`
- `docs/evidence/artifacts/r33-release-apk/run7/final-session-screen.png`
- `docs/evidence/artifacts/r33-release-apk/run7/logcat-tail.txt`

Log checks after the passing run:

- no `FATAL EXCEPTION`, `CLEARTEXT`, `Session encryption not ready`, or `operation has timed out` errors in the captured app log tail;
- daemon-spawned Pi runtime log no longer contains `Ensuring Lyntty background service...`;
- historical Pi session opened from Sessions Home, attached to relay session `cmr3qzzh5000wovggiy5n1y9w`, and returned `R33_OK` through the release APK.

## Remaining risks / next work

- Real physical ordinary `pi` TUI mirror was covered by deterministic `PiExternalMirror` JSONL tests and release-APK mirror attach logs, but not by a separate human typing session in the desktop TUI.
- Legacy relay sessions created with old random data-key semantics may not be recoverable by deterministic-key CLI processes; new stable Pi tags use the fixed derivation.
