# Android APK release and self-update runbook

Date: 2026-07-07
Status: implemented for personal-use Android APK releases
Related: `docs/standardization/PLAN.md`

## Purpose

Make GitHub Releases the main Android APK distribution path for personal-use Lyntty, while keeping install/update behavior Android-native and user-confirmed.

Hard requirements:

- Production package id: `dev.jczhang.lyntty`.
- Dev/E2E package id: `dev.jczhang.lyntty.dev`.
- Production APK signed with permanent release keystore, not debug key.
- APK release workflow manually triggered only.
- App discovers updates through relay `/v1/version`.
- APK file lives on GitHub Releases.
- App verifies downloaded APK `sha256` before invoking installer.
- Android Package Installer asks user to confirm install.
- No silent install.
- No Android-only native updater shim.

## Package identities

| Variant | Package id | Use |
| --- | --- | --- |
| development | `dev.jczhang.lyntty.dev` | Local testing, E2E, emulator. |
| preview | `dev.jczhang.lyntty.preview` | Optional preview channel. |
| production | `dev.jczhang.lyntty` | Daily-use APK from GitHub Releases. |

Rules:

- Production and dev data are isolated by package id.
- No automatic cross-package data migration.
- If an old `dev.jczhang.lyntty` exists with different signing key, uninstall it once and reinstall the new production APK.

## Signing key

Create one permanent release keystore:

```text
lyntty-release.jks
```

Rules:

- Never commit `.jks` or `.keystore`.
- Keep local encrypted backup.
- Store CI copy in GitHub Secrets as base64 plus passwords.
- Android background push notifications require a first-party Firebase project for `dev.jczhang.lyntty`.
- Store `google-services.json` as a base64 GitHub Secret; keep the file out of git.
- Store the Expo/EAS project id as a GitHub Actions repository variable so `expo-notifications` can request Expo push tokens.
- Do not print secret values in CI logs.

GitHub Secrets:

```text
LYNTTY_ANDROID_KEYSTORE_BASE64
LYNTTY_ANDROID_KEYSTORE_PASSWORD
LYNTTY_ANDROID_KEY_ALIAS
LYNTTY_ANDROID_KEY_PASSWORD
LYNTTY_GOOGLE_SERVICES_JSON_BASE64
```

GitHub Actions Variables:

```text
LYNTTY_EAS_PROJECT_ID
```

Manual generation example, only when intentionally creating the permanent key:

```bash
keytool -genkeypair \
  -v \
  -storetype JKS \
  -keystore lyntty-release.jks \
  -alias lyntty-release \
  -keyalg RSA \
  -keysize 4096 \
  -validity 10000
```

Local encrypted backup example:

```bash
age -r '<age-recipient-redacted>' -o lyntty-release.jks.age lyntty-release.jks
```

## Gradle source of truth

Accepted direction: use checked-in `packages/lyntty-app/android/` as release source of truth. Do not rely on `expo prebuild` during every CI release.

Implemented behavior:

- debug Gradle builds use dev identity (`dev.jczhang.lyntty.dev`) via `applicationIdSuffix`;
- release Gradle builds use production identity (`dev.jczhang.lyntty`) so EAS credentials reads the correct native package id;
- production release fails if signing/version properties are missing;
- production release fails if Firebase `google-services.json` is missing;
- release signing uses injected keystore only in release workflow.

## Release workflow

Trigger: `workflow_dispatch` only.

Inputs:

```yaml
version_name: "1.0.0"
version_code: "4" # optional; defaults to GitHub workflow run number
```

Version and release-note rules:

- `versionName`: human version, e.g. `1.0.0`.
- `versionCode`: GitHub workflow run number by default, or explicit numeric override.
- Git tag: `android-v<versionName>-<versionCode>`.
- Top `packages/lyntty-app/CHANGELOG.md` entry is the release-note source of truth.
- Top changelog title must match `Lyntty Android <versionName> (<versionCode>) — YYYY-MM-DD`.
- GitHub Release notes use the full top changelog entry.
- `latest.json.notes` uses the one-line summary under that title.

Build outline:

```bash
# CI only, sketch
printf '%s' "$LYNTTY_ANDROID_KEYSTORE_BASE64" | base64 -d > "$RUNNER_TEMP/lyntty-release.jks"
printf '%s' "$LYNTTY_GOOGLE_SERVICES_JSON_BASE64" | base64 -d > packages/lyntty-app/android/app/google-services.json
cd packages/lyntty-app/android
APP_ENV=production LYNTTY_EAS_PROJECT_ID="$LYNTTY_EAS_PROJECT_ID" ./gradlew assembleRelease --no-daemon --stacktrace --max-workers=2 \
  -x lintVitalAnalyzeRelease \
  -x lintVitalRelease \
  -PreactNativeArchitectures=arm64-v8a \
  -Pandroid.enablePngCrunchInReleaseBuilds=false \
  -PlynttyVersionName="$VERSION_NAME" \
  -PlynttyVersionCode="$VERSION_CODE" \
  -PlynttyKeystoreFile="$RUNNER_TEMP/lyntty-release.jks" \
  -PlynttyKeystorePassword="$LYNTTY_ANDROID_KEYSTORE_PASSWORD" \
  -PlynttyKeyAlias="$LYNTTY_ANDROID_KEY_ALIAS" \
  -PlynttyKeyPassword="$LYNTTY_ANDROID_KEY_PASSWORD"
```

Initial release builds target `arm64-v8a` only to keep GitHub Actions release time bounded for a personal-phone APK. Add more `reactNativeArchitectures` values later if x86 emulator or broader device coverage becomes a release requirement.

Output assets:

```text
lyntty-android-v<versionName>-<versionCode>.apk
latest.json
```

GitHub Release:

```text
android-v<versionName>-<versionCode>
```

## `latest.json`

Generated by CI, never hand-edited.

Schema:

```json
{
  "platform": "android",
  "appId": "dev.jczhang.lyntty",
  "versionName": "1.0.0",
  "versionCode": 4,
  "apkUrl": "https://github.com/jczhang02/lyntty/releases/download/android-v1.0.0-4/lyntty-android-v1.0.0-4.apk",
  "sha256": "<hex-sha256>",
  "notes": "First clean Lyntty Android release line.",
  "publishedAt": "2026-07-06T00:00:00Z"
}
```

`sha256` must be computed from the exact APK asset before upload or from the uploaded artifact bytes.

## Relay `/v1/version`

App calls relay, not GitHub directly:

```http
POST https://relay.jczhang.cc/v1/version
Content-Type: application/json

{
  "platform": "android",
  "app_id": "dev.jczhang.lyntty",
  "version": "1.0.0",
  "version_code": 3
}
```

Planned response:

```json
{
  "update_required": true,
  "version_name": "1.0.0",
  "version_code": 4,
  "apk_url": "https://github.com/jczhang02/lyntty/releases/download/android-v1.0.0-4/lyntty-android-v1.0.0-4.apk",
  "update_url": "https://github.com/jczhang02/lyntty/releases/download/android-v1.0.0-4/lyntty-android-v1.0.0-4.apk",
  "sha256": "<hex-sha256>",
  "notes": "First clean Lyntty Android release line."
}
```

Rules:

- Compare Android updates by `version_code`, not only semver.
- Ignore manifests where `platform !== "android"` or `appId !== "dev.jczhang.lyntty"` for production app.
- Relay reads `https://github.com/jczhang02/lyntty/releases/latest/download/latest.json` by default.
- Relay caches manifest briefly, e.g. 5-15 minutes.
- Env override may point relay at another manifest URL for rollback/testing.

Implemented behavior:

- App sends native application version and Android `version_code` when available.
- Relay returns snake_case `update_required`, `update_url`, `version_name`, `version_code`, `apk_url`, `sha256`, and `notes`.

## Expo-only APK install path

Use existing Expo/React Native modules:

- `expo-file-system` / `expo-file-system/legacy`
- `expo-crypto`
- `expo-intent-launcher`

Android permission:

```json
"android.permission.REQUEST_INSTALL_PACKAGES"
```

Download and verify flow:

1. Fetch relay `/v1/version`.
2. If update exists, show native update banner/action.
3. Download APK to app cache.
4. Read downloaded APK bytes.
5. Compute SHA-256 with `Crypto.digest(Crypto.CryptoDigestAlgorithm.SHA256, bytes)`.
6. Compare expected `sha256` from manifest.
7. If mismatch, delete/ignore APK and do not open installer.
8. Convert `file://` URI to `content://` via `getContentUriAsync` from `expo-file-system/legacy`.
9. Start Android intent:

```ts
await IntentLauncher.startActivityAsync('android.intent.action.VIEW', {
  data: contentUri,
  type: 'application/vnd.android.package-archive',
  flags: 1,
});
```

`flags: 1` grants read URI permission.

If Android blocks unknown-source install, guide user to app-specific setting:

```ts
await IntentLauncher.startActivityAsync('android.settings.MANAGE_UNKNOWN_APP_SOURCES', {
  data: `package:${Application.applicationId}`,
});
```

Then user retries update.

Important limits:

- Android always shows system install confirmation.
- App cannot silently install updates.
- Expo has no reliable first-version preflight for `canRequestPackageInstalls()`, so UX must handle installer failure and provide remediation.
- Reading full APK into memory is accepted for first version; low-memory failure must show clear error and not open installer.

## EAS relationship

- `EAS Build`: cloud builds native binaries. Not main path.
- `EAS Update`: OTA JS/assets update. Not native APK update path.
- `EAS projectId`: still required by Expo push token registration on Android.
- FCM v1 service-account credentials are uploaded to Expo/EAS for Expo Push Service delivery; they are not stored in GitHub.

Lyntty main path:

```text
GitHub Actions Gradle build -> GitHub Release APK/latest.json -> relay /v1/version -> app download/hash -> Android Package Installer
```

EAS Update may remain secondary for small JS/resource hotfixes if explicitly enabled with the Lyntty EAS project id, but it must not be the core release/update mechanism.

## Test plan

Unit/focused:

```bash
pnpm --filter ./packages/lyntty-app test
pnpm --filter ./packages/lyntty-app typecheck
pnpm --filter ./packages/lyntty-relay test
pnpm --filter ./packages/lyntty-relay typecheck
git diff --check
```

Release workflow checks:

- CI decodes keystore and Firebase Android config without logging secrets.
- Gradle production release fails without required signing/version properties.
- APK asset exists and hash matches generated `latest.json`.
- GitHub Release contains both APK and `latest.json`.
- Production APK can register an Expo push token with `LYNTTY_EAS_PROJECT_ID` and Firebase Android config.

Device/emulator checks:

- Fresh install production APK `dev.jczhang.lyntty`.
- App checks `https://relay.jczhang.cc/v1/version`.
- Update banner/action appears for lower `versionCode`.
- APK downloads.
- Correct `sha256` opens Android Package Installer.
- Bad `sha256` does not open installer.
- Missing unknown-source permission shows remediation.
- Confirmed install upgrades same package and preserves production app data.

## Security notes

- Keep keystore and Firebase service files out of git and artifacts except encrypted backup / GitHub Secret.
- Do not commit generated APKs.
- Do not log manifest URLs with tokens; current GitHub Release APK URL is public and tokenless.
- Redact pairing URLs, auth tokens, headers, public-key blobs used as auth material, and secrets in evidence.
- Public repo history must be secret-scanned before first push.

## Acceptance

- [x] Production APK uses `dev.jczhang.lyntty`.
- [x] Dev APK uses `dev.jczhang.lyntty.dev`.
- [x] Production release uses permanent release keystore.
- [x] Production APK includes Firebase Android config from GitHub Secret for push notifications.
- [x] Production APK embeds Lyntty EAS project id for Expo push token registration.
- [x] APK release workflow is manual.
- [x] `versionCode` is monotonic and included in `latest.json`.
- [x] `latest.json` is CI-generated.
- [x] Relay returns planned snake_case update response.
- [x] App downloads APK and verifies `sha256` before installer.
- [x] Hash mismatch blocks install.
- [x] Android Package Installer confirmation appears.
- [x] No native updater shim added.
- [x] EAS Update is not required for native updates.
