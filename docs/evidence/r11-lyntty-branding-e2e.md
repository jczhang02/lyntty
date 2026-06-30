# R11 Lyntty Branding and E2E Smoke Evidence

Date: 2026-07-01

## Scope

User-requested final cleanup:

- Replace remaining Happy branding/elements with Lyntty across active source/package paths/text.
- Replace logo assets with a new Lyntty icon generated via imagegen.
- Continue tests and Android/emulator smoke.
- Commit repository state.

## Branding changes

Broad text/path replacement was applied across active source/docs/config, excluding generated/vendor/cache directories:

- Excluded: `.git`, `node_modules`, `.gradle`, `.cxx`, `dist`, `build`, `.expo`.
- Package directories renamed:
  - `packages/happy-app` -> `packages/lyntty-app`
  - `packages/happy-cli` -> `packages/lyntty-cli`
  - `packages/happy-agent` -> `packages/lyntty-agent`
  - `packages/happy-server` -> `packages/lyntty-relay`
  - `packages/happy-wire` -> `packages/lyntty-wire`
  - `packages/happy-app-logs` -> `packages/lyntty-app-logs`
- Workspace/dependency imports updated from `@slopus/happy-wire` to `lyntty-wire`.
- CLI/bin names updated to `lyntty`/`lyntty-agent`/`lyntty-relay`.
- Root/workspace/Docker/env/docs paths updated to `lyntty-*` paths.
- Removed stale unused social component `packages/lyntty-app/sources/components/UserSearchResult.tsx` after typed route removal made it invalid.

Residual scan:

```bash
# Excluding generated/vendor/cache dirs
path_matches 0
file_matches 5
```

Remaining matches are not active source:

- `.beads/backup/*.darc`
- `.beads/embeddeddolt/.../.dolt/noms/...`
- `packages/lyntty-app/public/canvaskit.wasm` false positive binary content

## Logo replacement

A new Lyntty icon was generated with imagegen: mobile remote-control icon, navy rounded-square background, glowing phone/terminal cursor L shape, no words, no mascot, no Happy branding.

Updated assets:

- `logo.png`
- `packages/lyntty-app/logo.png`
- `packages/lyntty-app/sources/assets/images/icon.png`
- `packages/lyntty-app/sources/assets/images/icon-adaptive.png`
- `packages/lyntty-app/sources/assets/images/icon-monochrome.png`
- `packages/lyntty-app/sources/assets/images/icon-notification.png`
- `packages/lyntty-app/sources/assets/images/favicon.png`
- `packages/lyntty-app/sources/assets/images/favicon-active.png`
- `packages/lyntty-app/sources/assets/images/logo-black.png`
- `packages/lyntty-app/sources/assets/images/logo-white.png`

Expo Android prebuild was re-run so native resources pick up the updated assets.

## Verification

### Install/workspace

```bash
pnpm install --lockfile-only
pnpm install --frozen-lockfile
```

Result: passed. Workspace now resolves 8 projects with renamed package directories.

### Typechecks

```bash
pnpm --filter ./packages/lyntty-wire run typecheck
pnpm --filter ./packages/lyntty-agent run typecheck
pnpm --filter ./packages/lyntty-cli run typecheck
pnpm --filter ./packages/lyntty-relay run typecheck
pnpm --filter ./packages/lyntty-app run typecheck
```

Result: all passed.

### Unit/smoke tests

```bash
pnpm --filter ./packages/lyntty-cli exec vitest run \
  src/pi/runPiControl.test.ts \
  src/pi/runPiEvents.test.ts \
  src/pi/runPiFeatures.test.ts \
  src/pi/runPiRecovery.test.ts \
  src/pi/runPiPathSmoke.test.ts
```

Result: 5 files, 29 tests passed.

```bash
pnpm --filter ./packages/lyntty-app exec vitest run \
  sources/utils/previewSecurity.test.ts \
  sources/utils/notificationRouting.test.ts \
  sources/sync/reviewEvidence.test.ts
```

Result: 3 files, 18 tests passed.

### Android prebuild/build

```bash
pnpm --filter ./packages/lyntty-app exec expo prebuild --platform android --no-install
cd packages/lyntty-app/android && CCACHE_DISABLE=1 CMAKE_C_COMPILER_LAUNCHER= CMAKE_CXX_COMPILER_LAUNCHER= ./gradlew assembleDebug --no-daemon
```

Result: `BUILD SUCCESSFUL`.

APK:

- `packages/lyntty-app/android/app/build/outputs/apk/debug/app-debug.apk`
- size: `448M`

### Android emulator install/run smoke

With AVD `lyntty-api35` alive as `emulator-5554`:

```bash
adb devices
adb install -r packages/lyntty-app/android/app/build/outputs/apk/debug/app-debug.apk
adb shell am force-stop dev.jczhang.lyntty.dev
adb shell am start -W -n dev.jczhang.lyntty.dev/.MainActivity
adb shell pidof dev.jczhang.lyntty.dev
adb shell dumpsys activity activities | grep -E 'mResumedActivity|topResumedActivity|ResumedActivity' | head -20
adb exec-out screencap -p > docs/evidence/artifacts/r11-brand-icon-emulator-launch.png
adb logcat -d -t 800 > docs/evidence/artifacts/r11-brand-icon-emulator-logcat.txt
```

Results:

```text
List of devices attached
emulator-5554 device

Performing Streamed Install
Success

Status: ok
LaunchState: COLD
Activity: dev.jczhang.lyntty.dev/expo.modules.devlauncher.launcher.DevLauncherActivity
TotalTime: 2393
WaitTime: 2397
Complete
pid=4668
fatal_count=0
android_runtime_lines=0
```

Artifacts:

- `docs/evidence/artifacts/r11-brand-icon-emulator-launch.png`
- `docs/evidence/artifacts/r11-brand-icon-emulator-logcat.txt`
- `docs/evidence/artifacts/r11-brand-icon-emulator-smoke.log`
- Earlier pre-logo smoke:
  - `docs/evidence/artifacts/r11-brand-emulator-launch.png`
  - `docs/evidence/artifacts/r11-brand-emulator-logcat.txt`
  - `docs/evidence/artifacts/r11-brand-emulator-smoke.log`

## Remaining limitations

- Debug APK still launches Expo Dev Launcher and waits for local JS server (`pnpm expo start --android`) before the JS app screen renders.
- Full live mobile -> relay -> lynttyd/Pi -> relay -> mobile flow remains a separate end-to-end environment validation.
- Generated/vendor/cache residual strings are not active source and were intentionally not rewritten.

## GitHub image cleanup update

Additional visual assets were replaced after reviewing staged images:

- `.github/mascot.png` now uses the generated Lyntty icon.
- `.github/header.png` now says `Lyntty` and `Mobile control for local pi sessions`.
- `.github/logotype-dark.png` and `.github/logotype-light.png` were regenerated as simple Lyntty logotypes.

This removes the old otter mascot and old Claude/Happy marketing header from committed project assets.
