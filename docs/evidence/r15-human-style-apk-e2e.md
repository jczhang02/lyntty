# R15 Human-Style Android APK E2E

## Scope

Drove the Android debug/dev-client APK through emulator with adb as a human-style exploratory E2E:

- launch Expo Dev Client APK
- load Metro JS bundle
- create mobile account
- pair CLI node through terminal URL/deeplink
- start local relay and temporary Lyntty runtime
- open mobile session
- send a message from phone UI
- verify Pi reply renders on phone UI
- inspect screenshots, UIAutomator dumps, relay logs, CLI logs, and logcat

## Environment

- Emulator: `emulator-5554`
- App package: `dev.jczhang.lyntty.dev`
- Relay: `lyntty server --host 0.0.0.0 --port 3005 --no-persist`
- Expo: `EXPO_PUBLIC_LYNTTY_SERVER_URL=http://192.168.100.21:3005 pnpm expo start --host lan --dev-client --clear`
- CLI E2E home: `/tmp/lyntty-e2e-home`
- Artifacts: `docs/evidence/artifacts/r15-human-e2e/`

## Key evidence artifacts

- `01-launch.png` — Expo Dev Launcher showed Lyntty dev build.
- `04-app-home.png` — unauthenticated onboarding loaded from Metro bundle.
- `07-main-after-allow.png` — account created; app reached Sessions screen.
- `13-deeplink-terminal.png` — terminal deeplink opened Pair Node screen.
- `15-after-accept-real.png` — app showed terminal connection success.
- `19-back-to-sessions-after-pair.png` — paired runtime session visible in Sessions.
- `25-session-after-fix-open.png` — session opened; Pi runtime status visible.
- `28-after-correct-send.png` — phone sent `reply exactly E2E_PONG`; Pi reply `E2E_PONG` rendered on phone.
- `relay.log` — relay accepted auth/session traffic.
- `lyntty-auth-login-method.log` — CLI auth completed with machine ID.
- `logcat-after-message-fix.txt` — no feed/friends 404 spam after fixes.

## Bugs found while using APK

### 1. Onboarding logo still showed old Happy art

Symptom: unauthenticated screen displayed large black block-art `HAPPY` despite Lyntty branding.

Root cause: `packages/lyntty-app/sources/assets/images/logotype-dark.png` and `logotype-light.png` still contained old Happy logotype.

Fix: regenerated both assets as Lyntty logotypes.

### 2. App still spammed removed social endpoints

Symptom: logcat/relay filled with repeated errors:

```text
Failed to fetch feed: 404
Failed to get friends list: 404
GET /v1/feed?limit=100 -> 404
GET /v1/friends -> 404
```

Root cause: `Sync` still invalidated `friendsSync`, `friendRequestsSync`, and `feedSync` even though Lyntty relay deleted those product surfaces.

Fix: removed active invalidations and made legacy fetch methods inert compatibility seams.

### 3. Rating prompt appeared during pairing/session flow

Symptom: after pairing, app displayed:

```text
Enjoying the app?
We'd love to hear your feedback!
YES, I LOVE IT!
```

Root cause: `SessionsList` still called `requestReview()` when sessions appeared.

Fix: removed review prompt trigger from Lyntty mobile flow.

### 4. CLI auth was hard to automate / non-TTY brittle

Symptom: `lyntty auth login` in non-interactive E2E failed with Ink raw mode:

```text
Raw mode is not supported on the current process.stdin
```

Fix: added `lyntty auth login --method mobile|web` and `--mobile`/`--web` shortcuts to select auth flow without the Ink selector. Human flow remains unchanged.

### 5. CLI help still mentioned Claude/Codex/Gemini/ACP

Symptom: `lyntty --help` contained old Claude/Codex/Gemini copy.

Fix: rewrote help to Pi-only Lyntty usage and removed Claude help passthrough.

### 6. Initial Pi status message overwhelmed the Session Remote

Symptom: first agent message listed every discovered slash command/tool and filled most of the screen.

Fix: shortened Pi runtime status to first items plus `+N more`; full capabilities remain in session metadata.

## Successful connected E2E path

1. Started relay and Expo.
2. Created mobile account in APK.
3. Ran:

```bash
LYNTTY_HOME_DIR=/tmp/lyntty-e2e-home \
LYNTTY_SERVER_URL=http://127.0.0.1:3005 \
LYNTTY_WEBAPP_URL=http://192.168.100.21:3005 \
lyntty auth login --method mobile
```

4. Opened terminal deeplink in app.
5. Accepted Pair Node.
6. CLI auth completed:

```text
✓ Authentication successful
Machine ID: 2224ab69-c6f4-4f38-999e-560cd0c9fa61
```

7. Started runtime:

```bash
LYNTTY_HOME_DIR=/tmp/lyntty-e2e-home \
LYNTTY_SERVER_URL=http://127.0.0.1:3005 \
LYNTTY_WEBAPP_URL=http://192.168.100.21:3005 \
lyntty
```

8. Opened mobile session.
9. Sent from phone UI:

```text
reply exactly E2E_PONG
```

10. Phone displayed Pi reply:

```text
E2E_PONG
```

## Verification commands

```bash
pnpm --filter ./packages/lyntty-app run typecheck
pnpm --filter ./packages/lyntty-cli run typecheck
pnpm --filter ./packages/lyntty-app exec vitest run sources/sync/piReplyVisibility.e2e.test.ts sources/sync/reviewEvidence.test.ts sources/utils/previewSecurity.test.ts sources/utils/notificationRouting.test.ts
pnpm --filter ./packages/lyntty-cli exec vitest run src/pi/runPiSessionProtocol.test.ts src/pi/runPiPathSmoke.test.ts src/pi/runPiControl.test.ts src/pi/runPiFeatures.test.ts src/pi/runPiRecovery.test.ts
git diff --check
```

Results:

- App focused tests: 21 passed.
- CLI Pi tests: 28 passed.
- App typecheck passed.
- CLI typecheck passed.
- `git diff --check` passed.

## Remaining rough edges

- Debug APK still uses Expo Dev Launcher; production/preview standalone APK remains separate work.
- Manual URL modal path was less reliable than deeplink/QR path during adb driving; deeplink Pair Node path worked.
- Message send coordinate depends on keyboard state; human-visible send button worked after tapping the actual black send button above keyboard.
