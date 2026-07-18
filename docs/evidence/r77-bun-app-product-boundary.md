# R77 — Bun App product-boundary evidence

Date: 2026-07-16

Branch/worktree: `refactor/bun-migration` in `worktrees/bun-migration`

Scope: Android-native, Pi-only App boundary after signed baseline `806c197fb63350de9fc5417e8cc5637553a09bc0`

## Result

The current App source is mobile-only (`android`, `ios`) and the Android release-style artifact builds through Bun with `node`, `npm`, `pnpm`, `npx`, and `tsx` replaced by exit-97 sentinels on `PATH`. The clean universal APK:

- is signed with the independent `Lyntty Preview` certificate using APK Signature Scheme v2;
- has package `dev.jczhang.lyntty.dev`, version `1.0.0` (`1`);
- contains `arm64-v8a`, `armeabi-v7a`, `x86`, and `x86_64`;
- contains no Expo Updates, Expo dev client/launcher/menu, or bundled Node/Bun project-runtime executable (Hermes remains the permitted React Native engine);
- removes inherited microphone, location, calendar, phone-state, overlay, billing, and biometric permissions;
- passed the release-APK first-run/account-creation Maestro flow on a newly created temporary API 35 AVD.

The source change also removes Web/Tauri/EAS/OTA, non-Pi current-runtime choices, voice/social/artifact/subscription/telemetry surfaces, hidden diagnostics, and developer-mode entry points. Legacy provider fields and Codex tool renderers remain only at encrypted-history read/display boundaries. Explicit legacy-provider sessions are now fail-closed as history-only, model/effort false controls are absent, and discovered Pi sessions attach to their canonical relay identity before any explicit `wait|stop|interrupt` activation choice. Image file envelopes are paired with the next user command, decrypted by `lynttyd`, and delivered to both managed Pi SDK runtimes and ordinary Pi-extension sessions as Pi image content.

## Isolated Android build

The initial output was deleted before the gate (`android/app/build` and `android/build`) so stale APKs could not satisfy it. The first clean attempt exposed a temporary `ccache` permission problem; explicit temporary cache directories fixed the environment without changing repository policy. Maven Central Java TLS EOF failures were bypassed with a Gradle init script under `/tmp` only.

```bash
cd packages/lyntty-app/android
HOME=/tmp/lyntty-bun-app-release-gate/home \
GRADLE_USER_HOME=/tmp/lyntty-bun-app-release-gate/gradle \
CCACHE_DIR=/tmp/lyntty-bun-app-release-gate/ccache \
CCACHE_TEMPDIR=/tmp/lyntty-bun-app-release-gate/ccache-tmp \
BUN_EXECUTABLE=/usr/bin/bun \
APP_ENV=development \
PATH=/tmp/lyntty-bun-app-release-gate/bin:$PATH \
./gradlew :app:assembleRelease --no-daemon --stacktrace \
  --init-script /tmp/lyntty-bun-app-release-gate/mirror.init.gradle
```

Result: `BUILD SUCCESSFUL`; 1,005 actionable tasks. The final APK was rebuilt after adding source and config removal directives for inherited audio/biometric permissions.

```text
SHA-256 6cf796c1715650cf2d02cb1222af9ad8c3562f52c727ab8fa1daae9fbd563eee
size     198,343,201 bytes
```

The temporary `PATH` supplied executable sentinels named `node`, `npm`, `pnpm`, `npx`, and `tsx`; each prints an error and exits 97. The successful build proves none was invoked through normal path resolution. Bun-implemented `node:*` imports remain permitted by the migration definition.

A separate `APP_ENV=production :app:validateSigningRelease` run with all Android signing variables unset exited 1 at configuration with `Production release builds require Lyntty release signing properties`; production cannot fall back to the preview signer.

## Artifact inspection

Commands:

```bash
apksigner verify --verbose --print-certs app-release.apk
apkanalyzer manifest application-id app-release.apk
apkanalyzer manifest version-name app-release.apk
apkanalyzer manifest version-code app-release.apk
apkanalyzer manifest permissions app-release.apk
apkanalyzer manifest print app-release.apk
apkanalyzer files list app-release.apk
unzip -Z1 app-release.apk | grep '^lib/' | cut -d/ -f2 | sort -u
```

Forbidden manifest/file scans returned no match for Expo Updates/dev runtime, `RECORD_AUDIO`, location, calendar, phone state, overlay, billing, biometric/fingerprint, or project runtime executables. App-declared capability permissions are network state, notification, signed-APK installation, and pairing camera; Android/notification dependencies additionally contribute Internet, wake/vibrate/boot, FCM, install-referrer, and launcher-badge permissions.

## Maestro release-APK smoke

A new AVD named `lyntty_bun_gate` was created under `/tmp/lyntty-bun-app-release-gate`; it did not reuse the user's AVD or App state. The release APK was installed directly and no Metro/dev launcher was running.

```bash
LYNTTY_MAESTRO_APP_ID=dev.jczhang.lyntty.dev \
LYNTTY_MAESTRO_DEVICE=emulator-5570 \
LYNTTY_MAESTRO_PRELAUNCH=0 \
LYNTTY_MAESTRO_ARTIFACT_DIR=/tmp/lyntty-bun-app-release-gate/maestro/01_first_run \
scripts/e2e/run-maestro.sh e2e/maestro/01_first_run.yml
```

Result: `1/1 Flow Passed in 14s` on the rebuilt APK. The isolated emulator process was identified by PID, command, AVD name, environment, and port before it was terminated.

## Repository gates

```bash
bun --version                                  # 1.3.14
bun install --frozen-lockfile                  # no changes
bun pm untrusted                               # 0
bun audit                                      # No vulnerabilities found
bun run ci:fast
```

`ci:fast` passed:

- repository hardening: 6 tests;
- Wire: 19 tests;
- CLI: 58 files / 525 tests;
- Relay: 18 files / 105 tests;
- App: 79 files / 759 tests;
- App typecheck, i18n lint, Expo config introspection, and `git diff --check`.

Default and `APP_ENV=production` Expo introspection report only Android/iOS platforms, no `updates` or `runtimeVersion`, and blocked audio/biometric/media permissions. Production resolves package/bundle id `dev.jczhang.lyntty` with cleartext traffic disabled.

## Artifacts

- `docs/evidence/artifacts/r77-bun-app-boundary/apk-build-summary.txt`
- `docs/evidence/artifacts/r77-bun-app-boundary/apk-inspection.txt`
- `docs/evidence/artifacts/r77-bun-app-boundary/maestro-first-run-junit.xml`
- `docs/evidence/artifacts/r77-bun-app-boundary/production-signing-fail-closed.txt`

The 190 MiB APK, temporary Maven mirror, Gradle cache, AVD, and signing material are intentionally not committed.

## Not run and residual risk

- The latest APK has not rerun the paired Relay/`lynttyd`/Pi history-send/reconnect/reload/`history_gap` suite; R75 covers those shared-control paths on the preceding hardened App, while this checkpoint proves first-run behavior after the boundary deletion.
- No physical-phone or iOS build was run. Android remains the acceptance target; iOS is best effort.
- This is a release-style development package with the preview certificate, not a production-signed stable APK.
- Full `bun:test` migration, Relay API-only cleanup, Compatibility BOM, installers, and formal release signing remain later Bun-migration tasks.

## Independent review

Two independent targeted re-reviews confirmed the RPC error contract, prompt preservation, image command serialization, ordered attachment ownership, legacy-session permission fail-closed behavior, worktree reset, and Expo project-ID validation. The product reviewer found one remaining raw Pi-id display fallback; `resolvePiSessionDisplayName()` replaced both external-mirror and managed-runtime ID fallbacks and added regression coverage. Final verification found no remaining P0/P1 in this App boundary scope.
