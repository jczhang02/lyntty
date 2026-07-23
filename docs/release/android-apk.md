# Android APK release and self-update runbook

Date: 2026-07-07
Status: implemented for personal-use Android APK releases
Related: `docs/standardization/PLAN.md`

## Purpose

Make GitHub Releases the main Android APK distribution path for personal-use Lyntty, while keeping install/update behavior Android-native and user-confirmed.

Hard requirements:

- Production package id: `dev.jczhang.lyntty`.
- Dev package id: `dev.jczhang.lyntty.dev`; Preview/E2E package id: `dev.jczhang.lyntty.preview`.
- Production APK signed with permanent release keystore, not debug/preview key.
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
| development | `dev.jczhang.lyntty.dev` | Local or short-lived Metro-backed testing, E2E, emulator. |
| preview | `dev.jczhang.lyntty.preview` | Optional preview channel. |
| production | `dev.jczhang.lyntty` | Daily-use APK from GitHub Releases. |

Rules:

- Production, preview, and development data are isolated by package id.
- No automatic cross-package data migration.
- If an old `dev.jczhang.lyntty` exists with different signing key, uninstall it once and reinstall the new production APK.

## Short-lived Expo Dev debug artifact

`.github/workflows/android-expo-dev.yml` is a separate development distribution path, not a release channel. It runs only through `workflow_dispatch`, requires exact protected `main`, has no `contents: write`, and uploads one 14-day Actions artifact without creating a tag, Draft, prerelease, or Release.

Its contract is intentionally incompatible with a standalone Version Preview APK:

| Property | Expo Dev artifact |
| --- | --- |
| Package | `dev.jczhang.lyntty.dev` |
| Gradle variant | `Debug` |
| App environment | `development` |
| Debuggable | `true` |
| JavaScript | no embedded `assets/index.android.bundle`; Metro required |
| Metro port | `8081` |
| ABIs | `arm64-v8a`, `x86_64` |
| Signer | checked-in public development signer |
| Distribution | short-lived Actions artifact only |

The workflow derives `versionName` from the App package, derives a monotonic development-only `versionCode` as `930000 + GITHUB_RUN_NUMBER`, and names the APK with the source SHA and version code. It rejects `GITHUB_RUN_ATTEMPT > 1`; a failed run must be replaced by a new manual dispatch so version, APK, artifact, and provenance identities cannot be reused. Before upload it verifies the package, version, debuggable flag, sole v2 signer, signer certificate, ABI set, absent standalone bundle, embedded Metro port, and zero Node-family Gradle execution. It adds SHA-256, APK/runtime audits, provenance, a strict manifest, usage instructions, and GitHub attestations.

The fixed signer is intentionally public and provides only repeatable `.dev` upgrades; it is not a production trust credential. Consumers must rely on the source-bound checksum and GitHub attestation rather than treating this certificate as publisher authentication.

“Expo Dev APK” here means the checked-in Expo native project's Debug variant. The optional `expo-dev-client` dependency and Dev Launcher are not installed. The app still uses the normal React Native Debug host and the Expo CLI Metro mode described in [`docs/development.md`](../development.md).

This path cannot publish or update Version Preview, Stable, `compat-preview`, a Compatibility BOM, Relay, CLI, Google Play, EAS Update, or the App self-update feed. The existing Preview candidate/promotion workflows remain unchanged.

## APK-only Preview prerelease

The developer Preview APK is distributed independently from the signed Compatibility release system:

- package `dev.jczhang.lyntty.preview` and the checked-in Preview-only signer;
- public GitHub prerelease, never `latest`;
- no hosted Preview Relay, Relay OCI, CLI archive, Compatibility BOM, or Play publication;
- manual GitHub download and Android Package Installer update;
- local testing through `bun preview:test` and its isolated Relay;
- first-run Preview UI requires an explicit local Relay before credentials or sync can load;
- Stable behavior and the production signing path remain unchanged.

Candidate and publication remain separate:

1. `.github/workflows/android-preview-candidate.yml` builds one `arm64-v8a + x86_64` APK from protected `main`, audits it, attests it, and uploads a 30-day workflow artifact without publishing.
2. A protected allowlist PR on CODEOWNERS-owned trust paths binds the candidate SHA-256 and source inputs. The normal Candidate-to-Promotion delta contains only the allowlist, `docs/evidence/r86-preview-apk-candidate*.md`, and the five reviewed text/JSON sidecars under `docs/evidence/artifacts/r86-preview-apk-candidate/`.
3. The normal path requires the operator to upgrade and fresh-start test the exact Candidate on physical Android. If that matrix cannot be run, publication requires a separate protected policy review, an explicit owner authorization, `physical_phone_accepted=false`, and the exact dispatch phrase `I accept publishing this exact Candidate without physical Android validation`. The workflow rejects an empty waiver, simultaneous physical acceptance and waiver, or any other phrase.
4. A pure waiver policy PR may change only the Promotion workflow, its hardening test, this English/Chinese runbook, and the existing R86 narrative. If an earlier Candidate was revoked before publication, a combined replacement-evidence + waiver PR may additionally replace the tracked Candidate manifest and sidecars and restore one exact allowlist binding, but only with byte-for-byte copies and identity from the newly successful protected-main Candidate. That replacement legitimately changes the external APK plus its checksum, APK audit, and provenance assets; the runtime audit may remain identical. The waiver logic itself does not rebuild any bytes, alter the five-asset set, or change the tag, title, version, signer, or publication scope.
5. Before Promotion, repository release immutability must be enabled and an active no-bypass tag ruleset must block updates/deletion for `android-preview-v*`. After verifying both through the admin API, set repository variables `LYNTTY_IMMUTABLE_RELEASES_ENABLED=true` and `LYNTTY_PREVIEW_TAG_RULESET_ID=<numeric id>`; Promotion also requires an explicit dispatch confirmation and post-publication `isImmutable=true`.
6. `.github/workflows/android-preview-promote.yml` verifies exactly one authorization mode, the successful Candidate run, protected ref, exact reviewed delta, APK and manifest attestations, SHA-256, complete provenance/audits, immutable tag, exact assets, and final protected `main`, then publishes those exact bytes as a non-Latest prerelease. Waiver mode deterministically prepends a bilingual warning that the exact Candidate did not receive physical Android validation. The workflow re-downloads every release asset immediately before and after publication and requires `isImmutable=true`. Exact-Draft recovery hard-binds the reviewed Release ID and existing asset IDs and never recreates or re-uploads assets. For this recovery, its target may be only the recorded prior protected main or the final protected workflow commit. After exact ID/digest/byte, body, tag-state, and main-freshness checks, one full Release-ID request pins the final target and publishes the same Draft. An unpublished Draft requires the tag to be absent, and the publication request creates it from the verified `target_commitish`. Only an already-published immutable retry may accept an existing tag, which must point directly to the final commit.

Release identity for this cycle:

```text
Tag: android-preview-v1.2.0-920001
Title: V1.2.0 Local First 📡
APK: lyntty-preview-v1.2.0-920001.apk
```

Release notes are generated from `docs/release/preview-apk-release-notes.md`. Promotion publishes the APK, checksum, APK audit, runtime audit, and provenance only.

When claimed, physical-phone acceptance must cover the `910003 → 920001` in-place update, preservation of an existing valid Relay, fresh-data Relay gating before account actions, Android Back exiting the mandatory setup screen, Clear Relay returning to that gate, local pairing and managed Pi round-trip, and recovery after reopening the App. The dedicated automation seam is `bun run e2e:maestro:preview-first-run` (`e2e/maestro/standalone/preview_first_run.yml`); it is standalone and does not replace physical acceptance. An owner waiver does not convert CI, static audits, earlier APK testing, or the isolated Relay preflight into physical acceptance; the public warning and workflow summary must preserve that distinction.

## Signing key

Create one permanent release keystore:

```text
lyntty-release.jks
```

Rules:

- Never commit the production `.jks` or any secret keystore. The checked-in Dev/Preview signers are intentionally public exceptions and are not trust credentials.
- Keep local encrypted backup of the production key.
- Store CI copy in GitHub Secrets as base64 plus passwords.
- Android background push notifications require a first-party Firebase project for `dev.jczhang.lyntty`.
- Store `google-services.json` as a base64 GitHub Secret; keep the file out of git.
- Store the Expo project id as a GitHub Actions repository variable so `expo-notifications` can request Expo push tokens.
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
LYNTTY_EXPO_PROJECT_ID
LYNTTY_ANDROID_CERT_SHA256
```

`LYNTTY_ANDROID_CERT_SHA256` is the normalized SHA-256 fingerprint of the permanent production signing certificate. Production config validates the Expo project id as a UUID and never lets a generic `EXPO_PUBLIC_PROJECT_ID` override it. Legacy EAS variables are not accepted.

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

- `APP_ENV=development` always selects `dev.jczhang.lyntty.dev`; Debug uses the checked-in public Expo-Dev-only signer;
- `APP_ENV=preview` always selects `dev.jczhang.lyntty.preview` and the checked-in preview-only signer for debug or release-style validation;
- `APP_ENV=production` permits explicit Release tasks only, selects `dev.jczhang.lyntty`, and uses the injected permanent release keystore;
- production release fails if signing/version properties are missing or if the output signer fingerprint differs from `LYNTTY_ANDROID_CERT_SHA256`;
- production release fails if Firebase `google-services.json` is missing;
- release signing uses injected keystore only in release workflow.

## Release workflow

Trigger: `workflow_dispatch` only.

Inputs:

```yaml
version_name: "1.2.0"
version_code: "6" # first formal Stable; must remain monotonic
```

Version and release-note rules:

- App SemVer comes from `packages/lyntty-app/package.json`.
- `versionCode` is a separate monotonic Android integer supplied by the candidate run.
- Compatibility release tags include independent App/CLI/Relay/Wire versions plus the channel sequence.
- The Android-only workflow is retained as a protected signing/build verification job. It uploads a short-lived candidate and cannot create a GitHub Release.
- The first formal Stable uses `versionCode=6`, which advances the existing production package at `5`, and must retain certificate SHA-256 `25e3928a7cc228254e8249e684c6ab661f5c87140e23db7406afc64af29f0cf5`.
- Formal release notes and channel advancement belong to the signed Compatibility BOM promotion.
- Stable Promotion supports two mutually exclusive owner-approved paths. The normal path requires the exact Compatibility Candidate APK to pass physical Android validation and supplies `physical_phone_accepted=true` plus that APK's SHA-256. For an owner-operated self-use release, an explicit unverified path instead requires `physical_phone_accepted=false`, an empty accepted hash, and the exact phrase `I accept publishing this exact Stable Candidate without physical Android validation`. The waiver path never claims physical acceptance, publishes an `android-validation.json` audit asset, and places a leading bilingual warning in the immutable Release body.

Build outline:

```bash
# CI only, sketch
printf '%s' "$LYNTTY_ANDROID_KEYSTORE_BASE64" | base64 -d > "$RUNNER_TEMP/lyntty-release.jks"
printf '%s' "$LYNTTY_GOOGLE_SERVICES_JSON_BASE64" | base64 -d > packages/lyntty-app/android/app/google-services.json
cd packages/lyntty-app/android
APP_ENV=production LYNTTY_EXPO_PROJECT_ID="$LYNTTY_EXPO_PROJECT_ID" \
  ../scripts/gradle-runtime-audit.sh "$RUNNER_TEMP/android-exec-audit.txt" -- \
  ./gradlew assembleRelease --no-daemon --stacktrace --max-workers=2 \
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

Android verification-candidate assets:

```text
lyntty-android-v<versionName>-<versionCode>.apk
android-artifact.json
android-exec-audit.txt
android-apk-audit.txt
android-production-guard.txt
```

The Android-only candidate proves the production signing path, but formal Promotion publishes only the exact APK built inside the approved Compatibility Candidate run. It appears alongside `compatibility-bom.json`, `compatibility-bom.sig.json`, SPDX SBOM, provenance, and release checksums. The BOM binds package id, `versionCode`, permanent certificate fingerprint, immutable APK URL, SHA-256, and size. See [Compatibility release and support policy](./compatibility-bom.md).

## Relay `/v1/version`

App calls relay, not GitHub directly:

```http
POST https://relay.jczhang.cc/v1/version
Content-Type: application/json

{
  "platform": "android",
  "app_id": "dev.jczhang.lyntty",
  "version": "1.0.0",
  "version_code": 3,
  "release_channel": "stable"
}
```

Verified response:

```json
{
  "update_required": true,
  "version_name": "1.0.0",
  "version_code": 4,
  "apk_url": "https://github.com/jczhang02/lyntty/releases/download/compat-v1.1.0_1.2.0_1.2.0_0.2.0-s18/lyntty-stable.apk",
  "update_url": "https://github.com/jczhang02/lyntty/releases/download/compat-v1.1.0_1.2.0_1.2.0_0.2.0-s18/lyntty-stable.apk",
  "sha256": "<hex-sha256>",
  "release_channel": "stable",
  "bom_release_id": "compat-v1.1.0_1.2.0_1.2.0_0.2.0-s18",
  "bom_sequence": 18,
  "bom_sha256": "<canonical-bom-sha256>"
}
```

Rules:

- Compare Android updates by `version_code`, not only semver.
- Ignore manifests where `platform !== "android"` or `appId !== "dev.jczhang.lyntty"` for production app.
- Stable reads `LYNTTY_STABLE_BOM_URL`, defaulting to `https://github.com/jczhang02/lyntty/releases/latest/download/compatibility-bom.json`, plus its detached signature.
- Preview reads only explicit `LYNTTY_PREVIEW_BOM_URL`; it never falls back to Stable.
- Relay requires `LYNTTY_RELEASE_TRUST_ROOTS`, verifies Ed25519 signature, monotonic sequence, package/certificate pin, Relay repository, and compatibility matrix, then projects Android fields.
- Stable and Preview caches and highest accepted in-process sequences are separate.

Implemented behavior:

- App sends native application version, Android `version_code`, and a package-bound `release_channel` when available. Legacy production clients without the field are inferred as stable only for `dev.jczhang.lyntty`.
- Relay returns snake_case `update_required`, `update_url`, `version_name`, `version_code`, `apk_url`, `sha256`, `release_channel`, and verified BOM identity fields.
- App accepts an update only when the response channel matches its embedded package-bound channel.

## Expo-only APK install path

Use existing Expo/React Native modules:

- `expo-file-system/legacy`
- Android native `MessageDigest` streaming module
- `expo-intent-launcher`

Android permission:

```json
"android.permission.REQUEST_INSTALL_PACKAGES"
```

Download and verify flow:

1. Fetch relay `/v1/version`.
2. If update exists, show native update banner/action.
3. Download APK to app cache.
4. Stream the downloaded APK through Android's native `MessageDigest` module using a fixed 1 MiB buffer; never base64/load the whole APK into the JS heap.
5. Compare the resulting SHA-256 with expected `sha256` from the manifest.
6. If mismatch, delete/ignore APK and do not open installer.
7. Convert `file://` URI to `content://` via `getContentUriAsync` from `expo-file-system/legacy`.
8. Start Android intent:

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
- APK verification is native and streaming because universal Preview APKs can exceed the Android JS heap; any hash/open failure must show a clear error and never open the installer.

## Expo push identity

Lyntty does not use EAS Build, Submit, or Update. The Expo project id remains only because Android push-token registration requires that identity. The release workflow embeds `google-services.json` in the APK, but that file does not authorize Expo Push Service delivery. Operators must separately provision the FCM v1 service-account credential for the same Expo project; it stays outside Git and outside the APK.

Lyntty main path:

```text
protected candidate build -> signed Compatibility BOM promotion -> Stable/Preview GitHub Release -> relay BOM verification -> app download/hash -> Android Package Installer
```

## Test plan

Unit/focused:

```bash
bun run --filter lyntty-app test
bun run --filter lyntty-app typecheck
bun run --filter lyntty-relay test
bun run --filter lyntty-relay typecheck
git diff --check
```

Release workflow checks:

- CI decodes keystore and Firebase Android config without logging secrets.
- Gradle production release fails without required signing/version properties.
- A dry-run regression gate rejects both `APP_ENV=production :app:assembleDebug` and ambiguous `:app:build` before packaging.
- Gradle runs under `strace -f -e execve` with failing `node`, `npm`, `pnpm`, `npx`, and `tsx` sentinels; any Node-family execution fails release.
- APK package, version, non-debuggable flag, v2 signature, and permanent certificate fingerprint are verified.
- APK identity and hash match the canonical signed Compatibility BOM.
- Candidate promotion, not the Android-only workflow, publishes APK, BOM/signature, checksums, SPDX, provenance, and audit summaries.
- Production APK can register an Expo push token with `LYNTTY_EXPO_PROJECT_ID` and Firebase Android config.

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

- Keep the production keystore and Firebase service files out of git and artifacts except encrypted backup / GitHub Secret; only the explicitly public Dev/Preview signers are checked in.
- Do not commit generated APKs.
- Do not log manifest URLs with tokens; current GitHub Release APK URL is public and tokenless.
- Redact pairing URLs, auth tokens, headers, public-key blobs used as auth material, and secrets in evidence.
- Public repo history must be secret-scanned before first push.

## Acceptance

- [x] Production APK uses `dev.jczhang.lyntty`.
- [x] Dev APK uses `dev.jczhang.lyntty.dev`; Preview uses `dev.jczhang.lyntty.preview`.
- [x] Production release uses permanent release keystore.
- [x] Production APK includes Firebase Android config from GitHub Secret for push notifications.
- [x] Production APK embeds the Lyntty Expo project id for Expo push token registration.
- [x] APK release workflow is manual and audits production Gradle `execve` for forbidden Node-family runtimes.
- [x] `versionCode` is monotonic and included in the signed Compatibility BOM.
- [x] Stable `latest` resolves only a signed non-prerelease BOM; Preview is explicit and never latest.
- [x] Relay verifies the signed BOM and returns the snake_case update projection.
- [x] App downloads APK and verifies `sha256` before installer.
- [x] Hash mismatch blocks install.
- [x] Android Package Installer confirmation appears.
- [x] No native updater shim added.
- [x] EAS/OTA update surfaces are absent; signed full APKs are the only App update unit.
