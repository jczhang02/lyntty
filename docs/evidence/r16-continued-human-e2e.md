# R16 Continued Human-Style Android E2E

## Scope

Continued exploratory Android APK testing after R15, using emulator/adb like a user:

- relaunch app against a reset local relay while old mobile credentials remained on device
- create fresh mobile account
- test CLI mobile auth URL generation
- test manual URL pairing path and terminal deeplink pairing path
- start Lyntty runtime, open session, send phone message, verify Pi reply
- inspect Settings and app restart behavior
- scan logcat/relay/Expo logs for errors

Artifacts: `docs/evidence/artifacts/r16-human-e2e/`.

## Environment

- Emulator: `emulator-5554`
- App package: `dev.jczhang.lyntty.dev`
- Relay: `LYNTTY_HOME_DIR=/tmp/lyntty-e2e-r16 lyntty server --host 0.0.0.0 --port 3005 --no-persist`
- Expo: `EXPO_PUBLIC_LYNTTY_SERVER_URL=http://192.168.100.21:3005 pnpm expo start --host lan --dev-client --clear`
- CLI auth/runtime: `LYNTTY_HOME_DIR=/tmp/lyntty-e2e-r16 LYNTTY_SERVER_URL=http://127.0.0.1:3005 LYNTTY_WEBAPP_URL=http://192.168.100.21:3005`

## New issue found and fixed

### Stale mobile token caused endless 401/error screen after relay reset

Repro:

1. Keep mobile app data from previous relay/account.
2. Start fresh/reset local relay state.
3. Launch app.

Observed before fix:

- UI stayed on authenticated `Sessions` screen with `error` state.
- Expo/logcat spammed recoverable-looking but permanent auth failures:

```text
Failed to fetch machines: 401
Failed to fetch sessions: 401
Failed to fetch artifacts: 401
Failed to sync settings: Invalid token
Failed to register push token: 401
```

Root cause:

- `backoff()` retried auth failures forever.
- Auth invalidation could fire before `AuthProvider` subscribed, so local token was not cleared.

Fix:

- Added `authInvalidation` event seam.
- Treat `401`, `Invalid token`, and `Unauthorized` as non-retryable auth failures in `createBackoff()`.
- `InvalidateSync` / `ValueSync` request local auth invalidation and stop instead of looping forever.
- `AuthProvider` clears local credentials/persistence on invalidation.
- Late subscribers receive already-requested invalidation, covering startup race.

Evidence:

- `05-after-subscribe-fix.png/xml` shows app returned to unauthenticated onboarding after invalid token.
- `expo.log` contains `[auth] Invalid credentials detected; clearing local auth`.

## Pairing and messaging evidence

### Account creation

- `07-after-create-account-correct.png/xml` shows fresh account reached Sessions screen with relay `connected`.

### CLI auth URL

Command:

```bash
LYNTTY_HOME_DIR=/tmp/lyntty-e2e-r16 \
LYNTTY_SERVER_URL=http://127.0.0.1:3005 \
LYNTTY_WEBAPP_URL=http://192.168.100.21:3005 \
lyntty auth login --method mobile
```

Evidence:

- `auth-login-method.log` shows mobile QR/manual URL and successful authentication.
- Machine ID created: `87b50bed-e3bc-418a-92f0-2593137e0de5`.

### Manual URL path

Observed during adb driving:

- Manual modal appears correctly: `08-manual-url-modal.png/xml`.
- adb coordinate/input attempts were unstable and repeatedly escaped to Android/Expo `Display over other apps` settings instead of completing auth.
- Terminal deeplink path worked reliably.

Assessment:

- Manual modal UI exists, but adb-driven manual input remains unreliable. Needs later real-touch phone validation or accessibility IDs/testIDs to automate robustly.

### Deeplink pairing

Evidence:

- `12-deeplink.png/xml` shows Pair Node screen.
- `14-after-accept-correct.png/xml` shows `Success / Terminal connected successfully`.
- CLI auth completed.

Known UX rough edge still present:

- After successful pairing, app remains on Pair Node/success path and requires back navigation to Sessions.

### Runtime/session/message

Evidence:

- `21-session-newchat-tap.png/xml` shows session open and Pi runtime connected.
- Runtime status now uses short summaries: first 8 slash commands/tools plus `+N more`.
- `26-message-typed-correct.png/xml` shows phone typed `reply exactly R16_PONG`.
- `27-after-send-correct.png/xml` shows phone displays Pi reply `R16_PONG`.

## Settings and restart checks

- `30-settings.png/xml` and `31-settings-scrolled.png/xml` show Settings screen, Node Management, features/about copy, version, and no visible Happy/Claude/Codex/Gemini remnants.
- `32-after-app-restart.png/xml` shows app restart preserved account and displayed existing session with relay connected.

## Verification commands

```bash
pnpm --filter ./packages/lyntty-app run typecheck
pnpm --filter ./packages/lyntty-app exec vitest run \
  sources/auth/authInvalidation.test.ts \
  sources/utils/time.test.ts \
  sources/sync/piReplyVisibility.e2e.test.ts \
  sources/sync/reviewEvidence.test.ts \
  sources/utils/previewSecurity.test.ts \
  sources/utils/notificationRouting.test.ts
git diff --check
```

Results:

- App typecheck passed.
- Focused tests: 23 passed.
- `git diff --check` passed.

## Remaining shortcomings found

1. Manual URL pairing is hard to automate with adb; add stable testIDs/accessibility labels or verify on real phone by touch.
2. Pair Node success does not auto-navigate back to Sessions.
3. Expo Dev Client can drop into Android `Display over other apps` settings during mis-taps/tool interactions; standalone preview APK should be tested separately to remove Dev Client noise.
4. Runtime kill/offline status was not conclusively verified because local daemon/runtime processes can outlive the foreground `lyntty` wrapper.
