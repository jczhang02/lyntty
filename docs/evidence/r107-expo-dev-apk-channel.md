# R107 — Independent Expo Dev APK channel

Date: 2026-07-23

Status: Implementation and an isolated local APK/emulator path are verified. The GitHub workflow has not been dispatched because it is not yet on protected `main`; no external artifact, tag, Draft, prerelease, or Release was created.

## Scope and boundary

This change adds `.github/workflows/android-expo-dev.yml` as a manual, development-only distribution path:

```text
trigger: workflow_dispatch only
source: exact protected main
applicationId: dev.jczhang.lyntty.dev
variant: Debug
debuggable: true
runtime: Metro required on port 8081
standalone bundle: absent
ABIs: arm64-v8a, x86_64
distribution: 14-day GitHub Actions artifact
```

The workflow has `contents: read`, not `contents: write`. It cannot create a Git tag or GitHub Release and has no candidate/promotion connection to Version Preview, `compat-preview`, or a Compatibility BOM. Existing `android-preview-candidate.yml` and `android-preview-promote.yml` are unchanged.

“Expo Dev APK” means the Debug variant of the checked-in Expo native project. The optional `expo-dev-client` package and Dev Launcher remain absent. The native React Native Debug host connects to Expo CLI Metro started with `expo start --dev-client`; the flag selects the development-server mode and does not imply that Dev Launcher is embedded.

## Implementation

- The workflow derives App `versionName` from `packages/lyntty-app/package.json`, derives development-only `versionCode` as `930000 + GITHUB_RUN_NUMBER`, and includes source SHA plus version code in the APK name. It rejects workflow reruns (`GITHUB_RUN_ATTEMPT > 1`), requiring a new dispatch rather than reusing an APK/artifact/provenance identity.
- `APP_ENV=development`, `NODE_ENV=development`, `RCT_METRO_PORT=8081`, `:app:assembleDebug`, and `arm64-v8a,x86_64` are fixed in the workflow.
- A checked-in, intentionally public `.dev` signer permits repeatable development upgrades. Certificate SHA-256 is `374ea213bdd5667f7e274aa70b89cfa21ea8ba1222a948169904e9664ec69d16`.
- `apk-audit.sh` retains standalone release behavior by default and adds an opt-in `metro` mode that requires `debuggable=true`, zero `assets/index.android.bundle` entries, and the expected Android Metro resource port.
- The artifact includes the APK, checksum, APK audit, Gradle runtime audit, source provenance, strict content manifest, and usage README. The APK and manifest receive GitHub build attestations before upload.
- Hardening tests enforce the exact trigger/permission block and reject reruns, non-development configuration, Release builds, write permission, Release publication commands, package/build/runtime confusion, missing audit assertions, or Preview/Compatibility promotion coupling.

## Isolated real APK build

The local build used Bun `1.3.14`, OpenJDK `21.0.11`, Android SDK `/opt/android-sdk`, a temporary `HOME`, temporary `GRADLE_USER_HOME`, temporary Android user directories, temporary `LYNTTY_HOME_DIR`, and the task worktree. It did not read or write live `~/.pi` or `~/.lyntty`.

Representative exact build invocation:

```bash
VALIDATION_ROOT="$(mktemp -d /tmp/lyntty-expo-dev-validation.XXXXXX)"
cd packages/lyntty-app/android
HOME="$VALIDATION_ROOT/home" \
GRADLE_USER_HOME="$VALIDATION_ROOT/gradle" \
ANDROID_USER_HOME="$VALIDATION_ROOT/android" \
TMPDIR="$VALIDATION_ROOT/tmp" \
LYNTTY_HOME_DIR="$VALIDATION_ROOT/lyntty" \
ANDROID_HOME=/opt/android-sdk \
APP_ENV=development NODE_ENV=development EXPO_NO_DOTENV=1 \
BUN_EXECUTABLE="$(command -v bun)" RCT_METRO_PORT=8081 CI=true \
../scripts/gradle-runtime-audit.sh "$VALIDATION_ROOT/android-expo-dev-runtime-audit.txt" -- \
  ./gradlew :app:assembleDebug --no-daemon --stacktrace --max-workers=2 \
    -PreactNativeArchitectures=x86_64,arm64-v8a \
    -PlynttyVersionName=1.2.0 \
    -PlynttyVersionCode=930001 \
    -PreactNativeDevServerPort=8081
```

The build completed 606 actionable Gradle tasks with `BUILD SUCCESSFUL`. Gradle emitted existing deprecation/unchecked-operation warnings from dependencies plus the existing deprecated-member warning in `LynttyFileHashPackage.kt`; it reported no compilation error. Gradle runtime auditing recorded zero Node-family `execve` matches and zero sentinel invocations.

The generated local validation APK is not a release asset and was not committed:

```text
versionName: 1.2.0
versionCode: 930001
size: 205436990 bytes
SHA-256: 33c5d2317aaf771733b2044e017c832a26fd9ae340022e3d7d445f9d13715f60
```

`validation-inputs.json` binds that identity to 984 non-test App inputs by path, byte size, and SHA-256, plus base commit `47749a15e6c533afebd369afdb9bfab08571e8c5`. Tests, E2E, workflow, and documentation files are explicitly excluded because they were not APK or Metro runtime inputs; all included files remained unchanged after the local build/smoke. This makes the local result content-auditable without committing the 196 MiB validation APK or claiming reproducible APK bytes.

Real `apk-audit.sh ... metro 8081` verification reproduced:

- package `dev.jczhang.lyntty.dev`;
- `debuggable=true`;
- exactly one signer and v2 signature;
- the pinned Expo Dev certificate;
- no standalone Android JS bundle;
- Metro port `8081`;
- exactly `arm64-v8a,x86_64`.

## Isolated emulator and Metro proof

A fresh API 35 Google APIs x86_64 AVD was created under the validation root. It used emulator ports `5584/5585` and a separate ADB server on `5041`; the AVD path, launch cwd, Android state directories, and sole device serial `emulator-5584` were checked before installation or device commands.

The exact APK installed successfully. With no process listening on host port `8081`, the first launch logged:

```text
Failed to connect to /10.0.2.2:8081
Unable to load script.
The device must ... connect to Metro.
```

Metro was then started from the task worktree with isolated state:

```bash
APP_ENV=development NODE_ENV=development EXPO_NO_DOTENV=1 CI=1 \
  bunx expo start --dev-client --port 8081 --clear
adb -P 5041 -s emulator-5584 reverse tcp:8081 tcp:8081
```

`/status` returned `packager-status:running`. Metro bundled `packages/lyntty-app/index.ts` (3,371 modules), and the relaunched APK rendered the Lyntty onboarding UI with **Lyntty mobile control for pi**, **Create account**, and **Link or restore account**. The final UI contained no Metro connection error or fatal app crash. Its development warning was Reanimated's reduced-motion notice, caused by the test setting emulator animation scales to zero. Metro, the emulator, and the isolated ADB server were all stopped; ports `8081`, `5041`, `5584`, and `5585` were clear afterward.

No account was created, no pairing URL or credential was generated, and no Relay or Pi session was touched.

## Automated verification

Completed at this checkpoint:

```text
bun install --frozen-lockfile
  PASS; lockfile unchanged
bun pm untrusted
  PASS; 0 untrusted dependencies with scripts
bun test packages/lyntty-app/sources/scripts/apkAudit.test.ts
  PASS; 10 tests, 27 assertions
bun run test:repo-hardening
  PASS; 37 tests
workflow YAML parse
  PASS
bash -n + ShellCheck error level over 7 workflow run blocks
  PASS
git diff --check
  PASS
bun run ci:fast
  PASS; repo hardening 37, Wire 36, CLI 585, Relay 119, App 819 / 3,295 assertions across 90 files,
  13,068,103-byte real Preview bundle smoke, and lifecycle 36 / 193 assertions
```

The APK audit tests were written red-first: Metro acceptance initially failed on the old `debuggable=false` requirement, and the embedded-bundle rejection initially returned the old mismatch diagnostic. Both passed after the mode-aware audit implementation. Review follow-up added fail-closed negative cases for package identity, non-debuggable Metro builds, wrong or unreadable Metro ports, and incomplete ABI sets.

## Independent review

A read-only reviewer found no blocking issue. It identified one medium identity risk—GitHub reruns reuse `GITHUB_RUN_ID` and `GITHUB_RUN_NUMBER`—plus two low test gaps. The implementation now rejects `GITHUB_RUN_ATTEMPT > 1`, records `runAttempt` in provenance, locks the exact trigger/permission block, and adds the missing APK audit negative cases. Focused re-review marked all three findings resolved and found no new blocker.

A separate acceptance verifier correctly noted that the signer, workflow, and evidence were still untracked and unsigned at its pre-commit checkpoint. Those are delivery-state checks rather than implementation defects; final verification must prove the files are tracked, commits are signed, and the worktree is clean before closure. A follow-up verifier rehashed all 984 entries in `validation-inputs.json`, found no remaining content issue, and confirmed the intended boundary: this is a content-bound local validation record, not independent proof of APK bytes that were deliberately not retained.

Tracked evidence:

- `docs/evidence/artifacts/r107-expo-dev-apk/apk-audit.txt`
- `docs/evidence/artifacts/r107-expo-dev-apk/runtime-audit.txt`
- `docs/evidence/artifacts/r107-expo-dev-apk/apk.sha256`
- `docs/evidence/artifacts/r107-expo-dev-apk/emulator-smoke.txt`
- `docs/evidence/artifacts/r107-expo-dev-apk/validation-inputs.json`

The 196 MiB APK, full Gradle/strace logs, emulator image, logcat, UI XML, and screenshot remain untracked temporary validation data. They contain no claimed release bytes and are not repository deliverables.

## Acceptance audit

| Requirement | Evidence | State |
| --- | --- | --- |
| Manual-only, exact protected `main` | exact `on`/permission hardening plus event/ref/protection/HEAD/origin checks | static contract pass; GitHub run not yet executed |
| Development Debug identity | workflow constants, Gradle mapping, real APK audit | pass |
| Debuggable, Metro-required, no standalone bundle | mode-aware audit tests, real APK audit, no-Metro failure and Metro success | pass |
| Fixed port, dual ABI, stable development signer | real APK resource/ABI/signature audit and certificate pin | pass |
| Separate from Version Preview and Compatibility | no Preview workflow delta, no write/Release path, hardening assertions | pass |
| Artifact identity and reviewability | first-attempt-only run identity, SHA/provenance/manifest/README, attestation steps | static contract pass; GitHub attestation/upload not yet executed |
| Automated gates | focused tests, `ci:fast`, YAML/Bash/ShellCheck, independent re-review | pass |
| Documentation and durable local evidence | English/Chinese runbooks, R107 sidecars, 984-input content manifest | content pass; tracking is verified after commit |
| Signed Conventional Commits | existing OpenPGP identity required by repository policy | pending GPG-agent unlock |
| Bead and Goal closure | completion audit after signed commits and clean worktree | pending |

## Not run and residual risk

- The new GitHub workflow was not dispatched. Protected-main validation, GitHub-hosted Java 17 execution, attestations, and Actions artifact upload can run only after review and merge; no result is claimed for them yet.
- No physical phone was used. An isolated API 35 emulator proves Metro dependency and successful app rendering, but not USB-driver or physical-device behavior. Physical acceptance is not a gate for this ephemeral development artifact.
- The public development certificate authenticates nothing: anyone with the repository can sign the `.dev` package. Source SHA, checksum, provenance, and GitHub attestation are the trust boundary.
- The artifact expires after 14 days and cannot run without a compatible source checkout and Metro on port `8081`.
- `bun run ci:fast` is complete. Independent review and the final signed commit are recorded after they complete; this document must not be read as a publication or merge record.
