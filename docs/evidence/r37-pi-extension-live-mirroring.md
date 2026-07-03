# R37 Pi Extension Live Mirroring

Date: 2026-07-03

Task: `lyntty-jyi` — fix current Pi session live mirroring without requiring users to start sessions through `lyntty pi`.

## User decisions

- Default behavior: global Lyntty Pi extension auto-connects to local `lynttyd`.
- Scope: all ordinary `pi` sessions after extension installation.
- If `lynttyd` is absent: extension stays nonblocking and `/remote` reports status.
- Phone control: mirror by default; queued/takeover remains explicit, no silent takeover.
- Privacy: sync is default-on, with `/remote off` for the current Pi process.

## Root cause

The phone could only show messages already present in relay `/v3` session messages. Ordinary/current `pi` sessions write local Pi JSONL, but Lyntty only started external mirroring lazily from app `ensure-pi-session-mirror` when a discovered row was opened. Once a relay row existed, reopening the session did not guarantee a fresh mirror, and daemon restarts dropped in-memory mirror state.

## Implementation

Changed files:

- `packages/lyntty-cli/src/pi/piExtensionInstall.ts`
  - embeds and installs a global Pi extension at `~/.pi/agent/extensions/lyntty/index.ts`;
  - extension registers `/remote` and `/lyntty` commands;
  - extension auto-posts Pi session lifecycle/message/tool events to local `lynttyd` only;
  - extension serializes event POSTs through an in-process capped queue so streaming/tool events preserve order without unbounded growth when `lynttyd` is absent.
- `packages/lyntty-cli/src/pi/piExtensionEvent.ts`
  - validates/normalizes extension event shapes for the existing `PiSessionProtocolMapper`.
- `packages/lyntty-cli/src/daemon/controlServer.ts`
  - adds local-only `POST /pi-extension/status` and `POST /pi-extension/event` endpoints.
- `packages/lyntty-cli/src/daemon/run.ts`
  - bridges extension events through `ensurePiSessionMirror()` into deterministic relay sessions;
  - maps live extension events through the same `PiSessionProtocolMapper` used by Lyntty-managed Pi runtimes;
  - marks JSONL entries known while extension events are active to avoid fallback mirror duplicates;
  - queues very early extension events while daemon machine registration finishes.
- `packages/lyntty-cli/src/index.ts`
  - adds `lyntty remote install|status`;
  - installs the Pi extension before `lyntty daemon start` / `start-sync`.
- `packages/lyntty-cli/scripts/install-local.cjs`
  - local install now runs `lyntty remote install`.
- `packages/lyntty-app/app.config.js`
  - development builds disable Expo Updates so local release-style APK validation uses the embedded Lyntty bundle instead of a stale production OTA bundle.

## Verification

```bash
pnpm --filter ./packages/lyntty-cli run typecheck
```

Passed.

```bash
pnpm --filter ./packages/lyntty-cli test \
  src/pi/piExtensionEvent.test.ts \
  src/pi/runPiSessionProtocol.test.ts \
  src/pi/runPiExternalMirror.test.ts \
  src/daemon/controlServer.piExtension.test.ts
```

Passed: 4 files, 12 tests.

```bash
git diff --check
```

Passed.

```bash
tmp=$(mktemp -d)
HOME="$tmp" node packages/lyntty-cli/dist/index.mjs remote install
test -f "$tmp/.pi/agent/extensions/lyntty/index.ts"
grep -q '/pi-extension/event' "$tmp/.pi/agent/extensions/lyntty/index.ts"
rm -rf "$tmp"
```

Passed. Confirms built CLI can install the global Pi extension into the expected Pi auto-discovery path without touching the real home directory.

```bash
node packages/lyntty-cli/dist/index.mjs remote install
```

Passed. Installed the current extension to `/home/jc/.pi/agent/extensions/lyntty/index.ts`; existing running Pi processes need `/reload` or restart to load it.

## Release APK live-smoke

A local development release-style APK was rebuilt with Expo Updates disabled for `APP_ENV=development` and the local relay URL embedded:

```bash
cd packages/lyntty-app/android
EXPO_PUBLIC_LYNTTY_SERVER_URL=http://10.0.2.2:3005 APP_ENV=development \
  CCACHE_DISABLE=1 CMAKE_C_COMPILER_LAUNCHER= CMAKE_CXX_COMPILER_LAUNCHER= \
  ./gradlew :app:assembleRelease --no-daemon
adb -s emulator-5554 install -r app/build/outputs/apk/release/app-release.apk
adb -s emulator-5554 shell pm clear dev.jczhang.lyntty.dev
```

Fresh APK validation then passed:

```bash
scripts/e2e/run-maestro.sh e2e/maestro/01_first_run.yml
# Passed: first-run account creation

node packages/lyntty-cli/dist/index.mjs auth login --force --method mobile
adb shell am start -a android.intent.action.VIEW \
  -c android.intent.category.BROWSABLE \
  -d 'lyntty://terminal?<redacted-public-key>' dev.jczhang.lyntty.dev
# Pair Node screen showed Lyntty-branded copy, Accept Connection succeeded.

node packages/lyntty-cli/dist/index.mjs daemon start
pi -p --no-tools --name "lyntty plugin apk LYNTTY_PLUGIN_APK_185431" \
  "Reply exactly LYNTTY_PLUGIN_APK_185431"
```

The ordinary `pi` process replied with `LYNTTY_PLUGIN_APK_185431`. It was not launched through `lyntty pi`. The daemon log showed extension-driven deterministic relay creation:

```text
Session created/loaded: cmr4tglbg06qxovenstvl3xvo (tag: pi:6a169eaaad5d1c49d22841d89ef8cbef)
[SOCKET] [UPDATE] Decrypted message { role: 'session', contentType: 'unknown' }
```

Phone evidence:

- `docs/evidence/artifacts/r37-pi-extension-live-mirroring/release-live-home.xml`
  - Sessions Home shows `lyntty plugin apk LYNTTY_PLUGIN_APK_185431` as a normal Pi session row.
- `docs/evidence/artifacts/r37-pi-extension-live-mirroring/release-live-session.xml`
  - Session Remote shows the current ordinary Pi session title and both `Reply exactly LYNTTY_PLUGIN_APK_185431` and assistant reply `LYNTTY_PLUGIN_APK_185431`.
- `docs/evidence/artifacts/r37-pi-extension-live-mirroring/release-daemon-plugin-tail.log`
  - Captures relay session creation and socket updates for the extension-mirrored session.

This validates the full path:

```text
ordinary pi -> global Lyntty Pi extension -> local lynttyd -> relay -> release APK Sessions Home/Session Remote
```

## Remaining risk

- `/remote off` is process-local; durable global/project exclusion can be added later.
- Physical device validation was not repeated; this run used emulator `emulator-5554` with release-style APK.
