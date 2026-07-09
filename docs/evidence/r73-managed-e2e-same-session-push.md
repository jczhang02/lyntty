# R73 managed E2E: same-session-visible push suppression

Date: 2026-07-09
Branch/worktree: `feat/pi-completion-push`, `/home/jc/dev/lyntty/worktrees/pi-completion-push`
Bead: `lyntty-j0u`

## Scope

Validate the branch behavior that session-event pushes (`done`/`permission`/`question` path) are suppressed only when a non-machine App/Web client is active and visibly viewing the exact Session Remote.

## Environment

- Local isolated env: `agile-star`
- Local relay: `http://localhost:45715`
- Metro/dev server: `http://localhost:46789`
- Android emulator: `emulator-5554`, Android 15, Google APIs/Play services image
- APK: `packages/lyntty-app/android/app/build/outputs/apk/debugOptimized/app-debugOptimized.apk`
- App id: `dev.jczhang.lyntty.dev`

## Commands

```bash
pnpm env:up:authenticated

# Boot emulator
/opt/android-sdk/emulator/emulator -avd lyntty_v03_api35 -no-window -no-audio -gpu swiftshader_indirect -no-snapshot-save

# Build branch dev APK. CCACHE_DIR avoids root-owned ~/.cache/ccache.
source environments/data/envs/agile-star/env.sh
export APP_ENV=development
export EXPO_PUBLIC_SERVER_URL="http://10.0.2.2:${PORT}"
export EXPO_PUBLIC_LYNTTY_SERVER_URL="http://10.0.2.2:${PORT}"
export EXPO_PUBLIC_LOG_SERVER_URL="http://10.0.2.2:8787"
export CCACHE_DIR=/tmp/lyntty-e2e-r73/ccache
cd packages/lyntty-app/android
./gradlew :app:assembleDebugOptimized

adb install -r -d packages/lyntty-app/android/app/build/outputs/apk/debugOptimized/app-debugOptimized.apk
adb shell pm grant dev.jczhang.lyntty.dev android.permission.POST_NOTIFICATIONS

# Native app / Maestro path
maestro test /tmp/lyntty-e2e-r73/maestro-open-native-session-2.yml --device emulator-5554

# API/socket relay matrix
node /tmp/lyntty-e2e-r73/same-session-visible-e2e.mjs
```

## Results

### Socket-level relay matrix

Artifact: `docs/evidence/artifacts/r73-managed-e2e-same-session-push/socket-e2e-relay-log.log`

- Active old-style client without `visibleSessionId`: allowed. Relay attempted push and Expo returned fake-token `DeviceNotRegistered`.
- Active same-session client with `visibleSessionId === sessionId`: suppressed.
- Active other-session client: allowed. Relay attempted push.
- Background client carrying same `visibleSessionId`: allowed. Relay attempted push.

Key log lines:

```text
Push partial ... session cmrd13lqq0006ovx4rmfu8mjr: ok=0 errors=["DeviceNotRegistered"]
Suppressed session-event push ... session cmrd13lqq0006ovx4rmfu8mjr: same session visible
Push partial ... session cmrd13lqq0006ovx4rmfu8mjr: ok=0 errors=["DeviceNotRegistered"]
Push partial ... session cmrd13lqq0006ovx4rmfu8mjr: ok=0 errors=["DeviceNotRegistered"]
```

### Native app + Maestro same-session case

Artifacts:

- `docs/evidence/artifacts/r73-managed-e2e-same-session-push/maestro-open-native-session.log`
- `docs/evidence/artifacts/r73-managed-e2e-same-session-push/maestro-open-native-session-junit.xml`
- `docs/evidence/artifacts/r73-managed-e2e-same-session-push/open-native-session.png`
- `docs/evidence/artifacts/r73-managed-e2e-same-session-push/native-visible-relay-log.log`

Maestro opened branch native app into target Session Remote `cmrd188om000aovx4o2oy0tqy`. Triggering a `done` push while that screen was active produced:

```text
Suppressed session-event push for user cmrd0iacm0000ovx4fnl5ny8a session cmrd188om000aovx4o2oy0tqy: same session visible
```

### Native app background case

Artifact: `docs/evidence/artifacts/r73-managed-e2e-same-session-push/native-background-relay-log.log`

After leaving the app to Android launcher, triggering another `done` push for the same session produced a push attempt instead of suppression:

```text
Push partial for user cmrd0iacm0000ovx4fnl5ny8a session cmrd188om000aovx4o2oy0tqy: ok=0 errors=["DeviceNotRegistered","DeviceNotRegistered"]
```

### User LAN phone validation

Artifact: `docs/evidence/artifacts/r73-managed-e2e-same-session-push/user-lan-phone-relay-log.log`

The user then tested the branch over LAN with a dev APK, branch Metro, branch relay at `http://192.168.100.21:33793`, and a live Pi completion path for session `cmrdbianp0003ovwfqn2xx88d`.

When the phone was not foregrounded on the target Session Remote, relay did not suppress and attempted push dispatch. The isolated branch relay had no registered phone token, so dispatch stopped at `No push tokens`:

```text
No push tokens for user cmrdb9xtd0000ovwfpd14tl79 session cmrdbianp0003ovwfqn2xx88d — skipped
```

When the phone was foregrounded on the exact target Session Remote, relay suppressed the same `done` event as intended:

```text
Suppressed session-event push for user cmrdb9xtd0000ovwfpd14tl79 session cmrdbianp0003ovwfqn2xx88d: same session visible
```

## Not run / limitations

- No production relay deploy.
- No real Expo system notification popup in this branch E2E. Local dev APK/emulator used fake Expo push tokens, and the user's LAN dev APK run had zero registered push tokens in the isolated branch relay, so allow-cases verify relay dispatch path rather than real FCM delivery.
- Machine-scoped live socket E2E was not run because the seeded env token is user-scoped; unit coverage still covers machine sockets not participating in suppression.
- A dev launcher connect flow initially failed its `Sessions` assertion because the Expo dev menu overlay stayed open; follow-up Maestro flow closed it and passed.

## Residual risk

- Production APK + real FCM delivery should be checked after this branch is merged/deployed to a test relay or production relay.
- Per-device routing remains deferred; current rule still suppresses account-wide fanout if any client is active on the same Session Remote.
