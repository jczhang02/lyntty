# R63 standardization implementation

Date: 2026-07-06
Beads: `lyntty-bfq`
Related docs: `docs/standardization/PLAN.md`, `docs/deploy/relay-vps.md`, `docs/release/android-apk.md`

## Scope

Implemented first standardization pass after docs-first decision ledger:

- focused default CI for app/cli/relay/wire;
- manual relay image build and manual relay deploy workflows;
- production relay defaults at `https://relay.jczhang.cc`;
- relay `/v1/version` backed by GitHub Release `latest.json`;
- Android production Gradle signing/package/version wiring;
- manual Android APK release workflow;
- Expo-only APK download, SHA-256 verification, and Android Package Installer launch;
- current-tree secret hygiene for public-push preparation.

No public push, GHCR publish, GitHub Release, keystore generation, or VPS deploy was performed.

## Files changed or added

Workflows:

- `.github/workflows/typecheck.yml`
- `.github/workflows/cli-smoke-test.yml`
- `.github/workflows/relay-image.yml`
- `.github/workflows/relay-deploy.yml`
- `.github/workflows/android-release.yml`

Relay/version:

- `packages/lyntty-relay/sources/app/api/routes/versionRoutes.ts`
- `packages/lyntty-relay/sources/app/api/routes/versionRoutes.test.ts`

Android app/update:

- `packages/lyntty-app/app.config.js`
- `packages/lyntty-app/android/app/build.gradle`
- `packages/lyntty-app/android/app/src/main/AndroidManifest.xml`
- `packages/lyntty-app/sources/components/UpdateBanner.tsx`
- `packages/lyntty-app/sources/hooks/useNativeUpdate.ts`
- `packages/lyntty-app/sources/sync/serverConfig.ts`
- `packages/lyntty-app/sources/sync/storage.ts`
- `packages/lyntty-app/sources/sync/sync.ts`
- `packages/lyntty-app/sources/utils/androidApkUpdate.ts`
- removed `packages/lyntty-app/google-services.json` from tracking and removed Google Services from the first APK release path.

CLI/agent defaults and metadata:

- `packages/lyntty-cli/src/configuration.ts`
- `packages/lyntty-cli/src/api/pushNotifications.ts`
- `packages/lyntty-cli/README.md`
- `packages/lyntty-cli/src/commands/connect/authenticateGemini.ts`
- `packages/lyntty-cli/src/utils/expandEnvVars.test.ts`
- `packages/lyntty-cli/src/utils/deriveKey.appspec.ts`
- `packages/lyntty-agent/package.json`
- `packages/lyntty-agent/src/config.ts`
- `packages/lyntty-agent/src/config.test.ts`
- `packages/lyntty-agent/src/cli-smoke.test.ts`
- `packages/lyntty-agent/src/credentials.test.ts`
- `packages/lyntty-agent/README.md`
- `packages/lyntty-wire/package.json`
- `packages/lyntty-relay/package.json`

Secret hygiene:

- `.gitignore`
- removed tracked relay log artifacts with gitleaks findings:
  - `docs/evidence/artifacts/r15-human-e2e/relay.log`
  - `docs/evidence/artifacts/r16-human-e2e/relay.log`
  - `docs/evidence/artifacts/r18-session-home-pi-history/relay-reset.log`
  - `docs/evidence/artifacts/r38-e2e-validation/relay.log`
  - `docs/evidence/artifacts/r41-complex-e2e/relay.log`
  - `docs/evidence/artifacts/r41-complex-e2e/relay-rerun.log`
  - `docs/evidence/artifacts/r57-mobile-send-echo-merge/relay.log`
  - `docs/evidence/artifacts/r60-duplicate-agent-replies/relay.log`

Docs/evidence:

- `docs/release/android-apk.md`
- `docs/evidence/r63-standardization-implementation.md`

## Behavior changed

- Default server URL for app, CLI, push client, and retained agent helper now points to `https://relay.jczhang.cc`.
- Default push/PR CI is focused on install, wire build/test, cli/relay/app checks, and whitespace.
- Legacy CLI smoke workflow is manual-only.
- Relay image workflow builds root `Dockerfile` and pushes `ghcr.io/jczhang02/lyntty-relay:sha-<shortsha>` plus `main`.
- Relay deploy workflow requires a pinned `sha-*` image tag and restarts `/opt/lyntty` over SSH.
- Relay `/v1/version` now reads Android `latest.json`, caches it for 10 minutes by default, compares `version_code`, and returns snake_case APK manifest fields.
- App now sends Android `version_code` to `/v1/version` and stores `versionName`, `versionCode`, `sha256`, and notes in native update state.
- Android update banner now downloads APK, hashes file bytes with `expo-crypto`, compares manifest `sha256`, then launches Android Package Installer through `expo-intent-launcher` only on match.
- Hash mismatch blocks installer launch.
- Production Android release requires release signing props when building `dev.jczhang.lyntty` release.
- Default local Android builds still use `dev.jczhang.lyntty.dev`.
- `REQUEST_INSTALL_PACKAGES` permission added to app config and checked-in Android manifest.
- `google-services.json` removed from git; first APK release path no longer requires Google Services or Firebase keys.
- Hardcoded Gemini OAuth client secret removed from current source; legacy Gemini command now requires `LYNTTY_GEMINI_CLIENT_SECRET` if used.

## Secret scan notes

Tool install:

```bash
GOBIN=/tmp/lyntty-tools go install github.com/gitleaks/gitleaks/v8@latest
```

Result: failed with Go checksum mismatch for `github.com/gitleaks/gitleaks/v8@v8.30.1`. Did not bypass.

Fallback install:

```bash
gh release download v8.30.1 -R gitleaks/gitleaks -p gitleaks_8.30.1_linux_x64.tar.gz -p gitleaks_8.30.1_checksums.txt
sha256sum --check --ignore-missing gitleaks_8.30.1_checksums.txt
tar -xzf gitleaks_8.30.1_linux_x64.tar.gz
./gitleaks version
```

Result: checksum OK, version `8.30.1`.

Current candidate tree scan after cleanup:

```bash
/tmp/gitleaks-8.30.1/gitleaks dir . --redact --no-banner --report-format json --report-path /tmp/lyntty-gitleaks-dir-after-filter.json
```

Result: gitleaks still found ignored/local build artifacts, but candidate tracked/untracked-to-commit post-filter count was `0`.

Initial full git history scan before rewrite:

```bash
/tmp/gitleaks-8.30.1/gitleaks detect --source . --redact --no-banner --report-format json --report-path /tmp/lyntty-gitleaks-report-2.json
```

Result: failed. Redacted report summary:

- commits scanned: 104
- findings: 33658
- dominant historical paths: deleted relay evidence logs, historical `google-services.json`, historical derive-key test vectors, old fake token tests, old Gemini OAuth source.

History rewrite performed after explicit user confirmation:

```bash
git filter-repo --force \
  --path-regex '^docs/evidence/artifacts/.*/relay.*\.log$' \
  --path packages/lyntty-app/google-services.json \
  --path packages/lyntty-app/android/app/google-services.json \
  --path packages/lyntty-app/sources/encryption/deriveKey.appspec.ts \
  --path packages/lyntty-cli/src/utils/deriveKey.appspec.ts \
  --path packages/lyntty-cli/src/utils/expandEnvVars.test.ts \
  --path packages/lyntty-cli/src/commands/connect/authenticateGemini.ts \
  --invert-paths
```

Cleaned source/test files were restored from pre-rewrite local copies and recommitted without the flagged values. A local sensitive backup bundle was created under `/tmp/lyntty-pre-filter-sensitive-*.bundle` for rollback during the rewrite, then deleted after final scans passed.

Final full git history scan after rewrite:

```bash
/tmp/gitleaks-8.30.1/gitleaks detect --source . --redact --no-banner --report-format json --report-path /tmp/lyntty-gitleaks-report-no-google-final-2.json
```

Result: pass.

- commits scanned: 117 in the final post-amend scan
- findings: 0

Action required before public push:

- push only the cleaned `main` ref, not scratch refs.
- If Google/Firebase or Gemini legacy features are reintroduced later, create fresh keys and restrict them in Google Console.

## Verification commands

Workflow YAML parse and whitespace:

```bash
python - <<'PY'
import yaml
for p in ['.github/workflows/typecheck.yml','.github/workflows/cli-smoke-test.yml','.github/workflows/relay-image.yml','.github/workflows/relay-deploy.yml','.github/workflows/android-release.yml']:
    with open(p) as f:
        yaml.safe_load(f)
    print(p, 'yaml_ok')
PY
git diff --check
```

Result: pass.

Wire:

```bash
pnpm --filter ./packages/lyntty-wire build
pnpm --filter ./packages/lyntty-wire test
```

Result: pass, 2 files / 19 tests.

CLI:

```bash
pnpm --filter ./packages/lyntty-cli typecheck
pnpm --filter ./packages/lyntty-cli test
```

Result: pass after re-running sequentially once `lyntty-wire` build finished. Final test result: 90 files / 781 tests.

Agent:

```bash
pnpm --filter ./packages/lyntty-agent typecheck
pnpm --filter ./packages/lyntty-agent test
```

Result: pass, 9 files / 227 tests.

Relay:

```bash
pnpm --filter ./packages/lyntty-relay typecheck
pnpm --filter ./packages/lyntty-relay test
```

Result: pass, 15 files / 97 tests.

App:

```bash
pnpm --filter ./packages/lyntty-app typecheck
pnpm --filter ./packages/lyntty-app test -- --run
```

Result: pass, 79 files / 786 tests.

Gradle configuration:

```bash
cd packages/lyntty-app/android
./gradlew :app:tasks --all >/tmp/lyntty-gradle-tasks.log
```

Result: pass, build configuration loads.

Production release signing guard:

```bash
cd packages/lyntty-app/android
./gradlew :app:assembleRelease -PlynttyAppId=dev.jczhang.lyntty -PlynttyVersionCode=999 -PlynttyVersionName=0.0.0
```

Result: expected failure before build:

```text
Production release builds require Lyntty release signing properties
BUILD FAILED
```

## Not run

- Full Android signed APK build: no release keystore/secrets available locally.
- GitHub Actions execution: repo not pushed yet.
- GHCR relay image publish: repo not pushed yet.
- VPS deploy: no deploy workflow run, no production image tag.
- Device/emulator APK update install: needs signed APK release and Android device/emulator.
- Cloudflare/Caddy/VPS provisioning: not performed in this pass.

## Residual risk

- Public push needs force-with-lease because remote `main` has unrelated docs history; take a remote backup branch first.
- Android APK installer path typechecks but still needs release-style device validation.
- `expo-file-system/legacy` content URI behavior must be validated on target Android device.
- Push notifications that require FCM are deferred; first APK release has no Google Services dependency.
- Relay manifest fetch behavior needs live GitHub Release and relay runtime validation.
- Manual deploy workflow needs SSH secrets and `/opt/lyntty` bootstrap on VPS before use.
