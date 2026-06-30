# R10 Notifications / Preview / Android Hardening Evidence

Date: 2026-06-30

## Scope

Roadmap phase R10 / Beads `lyntty-jmh`: notifications, preview safety, WebView hardening defaults, Android build/smoke status, and evidence completion.

## Changed files

- `packages/lyntty-app/sources/utils/previewSecurity.ts`
- `packages/lyntty-app/sources/utils/previewSecurity.test.ts`
- `docs/evidence/r10-notifications-preview-android-hardening.md`

Related files verified:

- `packages/lyntty-app/sources/utils/notificationRouting.test.ts`
- `packages/lyntty-app/sources/app/_layout.tsx`

## Implemented preview hardening

`previewSecurity.ts` now covers the R10 preview safety criteria:

- allowed preview URI protocols: `http:` and `https:` only.
- rejects `javascript:`, `data:`, `file:`, malformed URLs, and credential-bearing URLs.
- strips URL fragments from preview URLs.
- WebView-style safe defaults:
  - `originWhitelist: ['http://*', 'https://*']`
  - `javaScriptEnabled: false`
  - `allowFileAccess: false`
  - `allowUniversalAccessFromFileURLs: false`
  - `allowsInlineMediaPlayback: false`
  - `nativeBridgeEnabled: false`
- realpath jail validation: target realpath must equal the preview root or live under it.
- path traversal rejection after realpath resolution.
- token expiry rejection.
- read-only enforcement: only `GET` and `HEAD` are allowed.

## Notification evidence

Existing notification routing tests passed. App-level notification setup remains in `packages/lyntty-app/sources/app/_layout.tsx`, including Android channels `default` and `messages`, foreground notification handling, and notification-response routing into session routes.

## Commands run

Preview + notification tests:

```bash
pnpm --filter ./packages/lyntty-app exec vitest run sources/utils/previewSecurity.test.ts sources/utils/notificationRouting.test.ts
```

Result:

- 2 test files passed.
- 14 tests passed.

App typecheck:

```bash
pnpm --filter ./packages/lyntty-app run typecheck
```

Result:

- `lyntty-app` typecheck passed.

## Android build/smoke status

Android build not run; blocker documented.

Current blocker:

- no generated native Android project exists at `packages/lyntty-app/android/`.
- no connected Android device/emulator is available from `adb devices`.
- running `expo run:android` would require native prebuild/device setup and generate large native project artifacts.

Command evidence from R9/R10 checks:

```bash
ls -d packages/lyntty-app/android packages/lyntty-app/ios
adb devices
pnpm --filter ./packages/lyntty-app run android --help
```

Observed:

- no native Android/iOS directories printed.
- `adb devices` printed only the header, no devices.
- `expo run:android --help` is available.

## Not run

- Android Gradle build.
- Physical Android smoke.
- Emulator smoke.
- Maestro flows.
- Live WebView preview render.

## Residual risks

- Future preview screen must call `createSafePreviewConfig()` and `validatePreviewAccess()`.
- Native Android build/smoke still requires generated Android project and device/emulator setup.
- R10 has safety helpers and tests, not physical-device evidence.

## Android build update

After initial blocker documentation, Android prebuild/build was attempted and completed.

Commands:

```bash
pnpm --filter ./packages/lyntty-app exec expo prebuild --platform android --no-install
cd packages/lyntty-app/android && ./gradlew assembleDebug --no-daemon
cd packages/lyntty-app/android && CCACHE_DISABLE=1 CMAKE_C_COMPILER_LAUNCHER= CMAKE_CXX_COMPILER_LAUNCHER= ./gradlew assembleDebug --no-daemon
```

Results:

- Expo Android prebuild succeeded and generated `packages/lyntty-app/android/`.
- First Gradle build failed at `:app:processDebugGoogleServices` because `google-services.json` still listed Lyntty package names while the app id is `dev.jczhang.lyntty.dev`.
- Updated `packages/lyntty-app/google-services.json` and generated `packages/lyntty-app/android/app/google-services.json` package names to Lyntty ids.
- Second Gradle build failed because host `ccache` returned `Permission denied` from native C/C++ compilation.
- Retried with ccache disabled via `CCACHE_DISABLE=1 CMAKE_C_COMPILER_LAUNCHER= CMAKE_CXX_COMPILER_LAUNCHER=`.
- Final result: `BUILD SUCCESSFUL in 3m 15s`, `:app:assembleDebug` completed.

Android build status is now: **passed**.

Physical device/emulator smoke remains not run because `adb devices` listed no device/emulator.

Final artifact check:

```bash
test -f packages/lyntty-app/android/app/build/outputs/apk/debug/app-debug.apk && ls -lh packages/lyntty-app/android/app/build/outputs/apk/debug/app-debug.apk
pnpm --filter ./packages/lyntty-app run typecheck
bd ready --json
```

Results:

- APK exists: `packages/lyntty-app/android/app/build/outputs/apk/debug/app-debug.apk`, size `447.1M`.
- `lyntty-app` typecheck passed after Android prebuild.
- `bd ready --json` returned `[]`.

## Android emulator smoke update

Scope stayed narrow: emulator tooling, AVD boot, `adb devices`, APK install/run, and blocker/status recording only.

Commands:

```bash
printf 'ANDROID_HOME=%s\nANDROID_SDK_ROOT=%s\n' "$ANDROID_HOME" "$ANDROID_SDK_ROOT"
for cmd in adb emulator avdmanager sdkmanager; do command -v "$cmd" || true; done
adb devices
avdmanager list avd
sdkmanager --list_installed | grep -E 'system-images|emulator|platform-tools|platforms;android'
```

Result summary:

- `ANDROID_HOME=/opt/android-sdk`.
- `adb` exists at `/usr/bin/adb`.
- `avdmanager` and `sdkmanager` exist under `/opt/android-sdk/cmdline-tools/latest/bin/`.
- `emulator` is available at `/opt/android-sdk/emulator/emulator` but is not on `PATH`.
- Installed pieces include Android Emulator `36.6.11`, platform-tools `37.0.0`, platforms `android-34`, `android-35`, `android-36`, and `system-images;android-35;google_apis;x86_64`.
- Existing AVDs listed: `lyntty-api35`, `lyntty_v03_api35`.
- Initial `adb devices` listed no devices.

First start attempt:

```bash
/opt/android-sdk/emulator/emulator -avd lyntty_v03_api35 -no-window -no-audio -no-snapshot -no-boot-anim -gpu swiftshader_indirect
```

Result: failed because emulator could not resolve the AVD under default search paths:

```text
ERROR | Unknown AVD name [lyntty_v03_api35], use -list-avds to see valid list.
ERROR | HOME is defined but there is no file lyntty_v03_api35.ini in $HOME/.android/avd
```

Successful boot command:

```bash
ANDROID_AVD_HOME=$HOME/.config/.android/avd \
  /opt/android-sdk/emulator/emulator \
  -avd lyntty-api35 \
  -no-window \
  -no-audio \
  -no-snapshot \
  -no-boot-anim \
  -gpu swiftshader_indirect
```

Result:

```text
BOOT_OK
List of devices attached
emulator-5554	device
```

Install/run commands:

```bash
APK=packages/lyntty-app/android/app/build/outputs/apk/debug/app-debug.apk
adb install -r "$APK"
adb shell pm path dev.jczhang.lyntty.dev
adb shell am start -W -n dev.jczhang.lyntty.dev/.MainActivity
adb shell dumpsys activity activities | grep -E 'mResumedActivity|topResumedActivity|ResumedActivity' | head -20
adb shell pidof dev.jczhang.lyntty.dev
adb shell monkey -p dev.jczhang.lyntty.dev -c android.intent.category.LAUNCHER 1
adb logcat -d -t 400 | grep -E 'FATAL EXCEPTION|AndroidRuntime|dev.jczhang.lyntty.dev' | tail -80
adb exec-out screencap -p > docs/evidence/artifacts/r10-emulator-launch.png
```

Results:

```text
Performing Streamed Install
Success
package:/data/app/.../dev.jczhang.lyntty.dev-.../base.apk
Starting: Intent { cmp=dev.jczhang.lyntty.dev/.MainActivity }
Status: ok
LaunchState: COLD
Activity: dev.jczhang.lyntty.dev/expo.modules.devlauncher.launcher.DevLauncherActivity
TotalTime: 2240
WaitTime: 2243
Complete
topResumedActivity=ActivityRecord{... dev.jczhang.lyntty.dev/expo.modules.devlauncher.launcher.DevLauncherActivity ...}
pid: 3407
```

Logcat sample showed no `FATAL EXCEPTION` for `dev.jczhang.lyntty.dev`. Screenshot artifact was captured at:

- `docs/evidence/artifacts/r10-emulator-launch.png`

Observed limitation: the debug APK launches Expo Dev Launcher and asks for a local development server (`npx expo start`). That is expected for this debug/dev build. The narrow adb smoke passes for emulator boot, install, package resolution, activity launch, process alive, and no immediate crash.

Cleanup:

```bash
adb emu kill
adb devices
```

Result:

```text
OK: killing emulator, bye bye
List of devices attached
```

## Android emulator restart smoke update

Scope stayed narrow: restart AVD `lyntty-api35`, keep emulator alive, verify `adb devices`, ensure APK, install, launch, capture screenshot/logcat. Product scope unchanged.

Commands:

```bash
adb devices
ANDROID_AVD_HOME=$HOME/.config/.android/avd nohup /opt/android-sdk/emulator/emulator \
  -avd lyntty-api35 \
  -no-window \
  -no-audio \
  -no-snapshot \
  -no-boot-anim \
  -gpu swiftshader_indirect \
  > /tmp/lyntty-avd-restart-emulator.log 2>&1 &

adb shell getprop sys.boot_completed
adb devices
```

Results:

```text
emulator_pid=2639539
loop=10 devices=emulator-5554 device boot=1
BOOT_OK
List of devices attached
emulator-5554 device
```

APK check:

```bash
APK=packages/lyntty-app/android/app/build/outputs/apk/debug/app-debug.apk
if [ -f "$APK" ]; then ls -lh "$APK"; else cd packages/lyntty-app/android && CCACHE_DISABLE=1 CMAKE_C_COMPILER_LAUNCHER= CMAKE_CXX_COMPILER_LAUNCHER= ./gradlew assembleDebug --no-daemon; fi
```

Result:

```text
APK_EXISTS
-rw-r--r-- 1 jc jc 448M Jun 30 22:22 packages/lyntty-app/android/app/build/outputs/apk/debug/app-debug.apk
```

Install/run commands:

```bash
adb logcat -c
adb install -r "$APK"
adb shell pm path dev.jczhang.lyntty.dev
adb shell am force-stop dev.jczhang.lyntty.dev
adb shell am start -W -n dev.jczhang.lyntty.dev/.MainActivity
adb shell pidof dev.jczhang.lyntty.dev
adb shell dumpsys activity activities | grep -E 'mResumedActivity|topResumedActivity|ResumedActivity' | head -20
adb exec-out screencap -p > docs/evidence/artifacts/r10-emulator-restart-launch.png
adb logcat -d -t 800 > docs/evidence/artifacts/r10-emulator-restart-logcat.txt
```

Results:

```text
Performing Streamed Install
Success
package:/data/app/.../dev.jczhang.lyntty.dev-.../base.apk
Starting: Intent { cmp=dev.jczhang.lyntty.dev/.MainActivity }
Status: ok
LaunchState: COLD
Activity: dev.jczhang.lyntty.dev/expo.modules.devlauncher.launcher.DevLauncherActivity
TotalTime: 2279
WaitTime: 2281
Complete
pid=3151
topResumedActivity=ActivityRecord{... dev.jczhang.lyntty.dev/expo.modules.devlauncher.launcher.DevLauncherActivity ...}
```

Artifacts:

- Screenshot: `docs/evidence/artifacts/r10-emulator-restart-launch.png`
- Logcat sample: `docs/evidence/artifacts/r10-emulator-restart-logcat.txt`
- Command transcript: `docs/evidence/artifacts/r10-emulator-restart-smoke.log`

Crash check:

```bash
grep -c 'FATAL EXCEPTION' docs/evidence/artifacts/r10-emulator-restart-logcat.txt
grep -c 'AndroidRuntime' docs/evidence/artifacts/r10-emulator-restart-logcat.txt
```

Result:

```text
fatal_count=0
android_runtime_lines=0
```

Final live state, intentionally not killed:

```bash
pgrep -fa 'emulator.*lyntty-api35|qemu-system' | head -20
adb devices
```

Result:

```text
2639539 /opt/android-sdk/emulator/qemu/linux-x86_64/qemu-system-x86_64-headless -avd lyntty-api35 -no-window -no-audio -no-snapshot -no-boot-anim -gpu swiftshader_indirect
List of devices attached
emulator-5554 device
```

Observed limitation remains: debug APK launches Expo Dev Launcher and waits for a local development server (`npx expo start`). This smoke passes install/run/no-immediate-crash on emulator and keeps the AVD alive for follow-up.
