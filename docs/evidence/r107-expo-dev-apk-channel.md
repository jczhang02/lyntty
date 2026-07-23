# R107 — Independent Expo Dev APK channel

Date: 2026-07-23

Status: Implementation, the isolated local APK/emulator path, the first protected-`main` GitHub Actions publication, and the owner-authorized immutable GitHub prerelease are verified. The workflow still produces a 14-day Actions Artifact only; its seven verified files were later promoted unchanged to a separate Expo Dev prerelease.

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

A separate acceptance verifier correctly noted that the signer, workflow, and evidence were still untracked and unsigned at its pre-commit checkpoint. Those are delivery-state checks rather than implementation defects; final verification proved the files were tracked, all three logical commits had Good OpenPGP signatures, and the worktree was clean before closure. A follow-up verifier rehashed all 984 entries in `validation-inputs.json`, found no remaining content issue, and confirmed the intended boundary: this is a content-bound local validation record, not independent proof of APK bytes that were deliberately not retained.

## Protected-main publication

PR [#47](https://github.com/jczhang02/lyntty/pull/47) passed all 13 reported checks and was squash-merged to protected `main` as GitHub-verified commit `04b63ea7a35f98c3012cc2ca6b00b7dae9e76968`. Its tree is the pre-reviewed tree `3fb04f264a362f7a169d3d9d0b0ad47380d4ebcd`.

The first manual run, [Android Expo Dev APK #29993286277](https://github.com/jczhang02/lyntty/actions/runs/29993286277), completed successfully on attempt 1 from exact `main` SHA `04b63ea7a35f98c3012cc2ca6b00b7dae9e76968`. Every build, APK/runtime audit, attestation, upload, and summary step passed. It published only Actions Artifact [`android-expo-dev-29993286277`](https://github.com/jczhang02/lyntty/actions/runs/29993286277/artifacts/8558651887):

```text
artifact ID: 8558651887
archive size: 76662528 bytes
created: 2026-07-23T09:24:57Z
expires: 2026-08-06T09:24:53Z
APK: lyntty-expo-dev-04b63ea7a35f-930001.apk
APK size: 205436682 bytes
APK SHA-256: 4c306d6c0b4e8856ac72aec8b2a9ca88a504d6b07ea3b64235b087e604fec8b8
manifest SHA-256: 8fd05428913ce3fe1de77218b0f895e5dd88eee3a78488a5ce315075b58b4704
```

The downloaded seven-file artifact matched its strict six-entry manifest plus the manifest itself. Provenance bound run ID/number/attempt, source commit/tree, package, Debug/Metro identity, signer, ABI set, APK size, and checksum. A fresh local audit of the downloaded APK exactly matched the uploaded audit: `dev.jczhang.lyntty.dev`, `debuggable=true`, one pinned v2 signer, no standalone bundle, Metro `8081`, and `arm64-v8a,x86_64`.

`gh attestation verify` independently verified the APK and manifest against repository `jczhang02/lyntty`, signer workflow `.github/workflows/android-expo-dev.yml`, source ref `refs/heads/main`, exact source/signer digest `04b63ea7a35f98c3012cc2ca6b00b7dae9e76968`, SLSA provenance v1, and the deny-self-hosted-runner policy. Both had a verified transparency timestamp. The workflow run itself created no tag or GitHub Release; its permissions and artifact-only behavior remain unchanged.

### Owner-authorized immutable prerelease

After an explicit owner request for a GitHub Release, the seven verified files were manually promoted unchanged to [`android-expo-dev-v1.2.0-930001`](https://github.com/jczhang02/lyntty/releases/tag/android-expo-dev-v1.2.0-930001). It was prepared as a Draft, independently reviewed before publication, and published with this identity:

```text
release database ID: 358594428
name: Lyntty Expo Dev v1.2.0 (930001)
tag: android-expo-dev-v1.2.0-930001
tag target: 04b63ea7a35f98c3012cc2ca6b00b7dae9e76968
published: 2026-07-23T10:33:23Z
draft: false
prerelease: true
immutable: true
explicit Release assets: 7
```

The lightweight tag points directly to the exact GitHub-verified build-source commit and its reviewed tree `3fb04f264a362f7a169d3d9d0b0ad47380d4ebcd`. The Stable Latest endpoint remains `compat-v1.2.0_1.2.0_1.2.0_0.2.0-s1`; this Expo Dev prerelease did not replace Stable, Preview, or any Compatibility BOM reference.

All seven Release assets were downloaded into a fresh directory after publication. Their names, sizes, and SHA-256 values matched both the GitHub Release asset API and the original strict manifest. The APK checksum passed, provenance remained bound to run `29993286277` and source `04b63ea7…`, a fresh APK audit exactly matched the published audit, and both GitHub attestations verified again against the downloaded Release bytes. Unauthenticated public range downloads succeeded for the APK and checksum. The Release notes state the Metro `8081`, Debug/no-bundle, public-signer, separate-channel, and no-physical-phone boundaries before the install instructions.

Tracked evidence:

- `docs/evidence/artifacts/r107-expo-dev-apk/apk-audit.txt`
- `docs/evidence/artifacts/r107-expo-dev-apk/runtime-audit.txt`
- `docs/evidence/artifacts/r107-expo-dev-apk/apk.sha256`
- `docs/evidence/artifacts/r107-expo-dev-apk/emulator-smoke.txt`
- `docs/evidence/artifacts/r107-expo-dev-apk/validation-inputs.json`
- `docs/evidence/artifacts/r107-expo-dev-apk/github-actions-publish.txt`
- `docs/evidence/artifacts/r107-expo-dev-apk/github-release-publish.txt`

The locally built 196 MiB validation APK, full Gradle/strace logs, emulator image, logcat, UI XML, and screenshot remain untracked temporary data and contain no claimed Release bytes. Fresh Actions Artifact and GitHub Release downloads were also untracked verification copies; the durable evidence records their exact hashes and audit results instead of committing APK bytes.

## Acceptance audit

| Requirement | Evidence | State |
| --- | --- | --- |
| Manual-only, exact protected `main` | exact hardening plus successful attempt-1 run `29993286277` at merged `main` SHA | pass |
| Development Debug identity | workflow constants, Gradle mapping, local and downloaded APK audits | pass |
| Debuggable, Metro-required, no standalone bundle | mode-aware tests, two APK audits, no-Metro failure and Metro success | pass |
| Fixed port, dual ABI, stable development signer | downloaded APK resource/ABI/signature audit and certificate pin | pass |
| Separate from Version Preview and Compatibility | distinct `.dev` package/tag, prerelease and not Latest, unchanged Preview workflows/BOM/self-update path | pass |
| Artifact and Release identity | attempt-1 identity, strict manifest/provenance/checksum, two independent downloads/re-audits, exact tag target, seven API digests, two verified attestations | pass |
| GitHub prerelease publication | immutable release `358594428`, reviewed warning body, seven assets, public unauthenticated download, Stable Latest unchanged | pass |
| Automated gates | local focused/full gates, 13 PR checks, YAML/Bash/ShellCheck, independent final verifier | pass |
| Documentation and durable evidence | English/Chinese runbooks, R107 sidecars, 984-input local manifest, publication record | pass |
| Signed commits and protected merge | three Good OpenPGP logical commits and GitHub-verified squash merge | pass |
| Bead and Goal closure | `lyntty-74p` closed after signed-commit/clean-worktree completion audit | pass |

## Not run and residual risk

- No physical phone was used. An isolated API 35 emulator proves Metro dependency and successful app rendering, but not USB-driver or physical-device behavior. Physical acceptance was explicitly not a gate for this development prerelease.
- The public development certificate authenticates nothing: anyone with the repository can sign the `.dev` package. Exact source SHA, checksum, provenance, GitHub asset digests, and attestations are the trust boundary.
- Actions Artifact `android-expo-dev-29993286277` still expires at `2026-08-06T09:24:53Z`; the immutable GitHub prerelease now provides the durable download. Both copies require a compatible source checkout and Metro on port `8081`.
- The workflow cannot publish or update this prerelease. This was an explicit one-time owner-authorized manual promotion, not a new automated release or Compatibility path.
