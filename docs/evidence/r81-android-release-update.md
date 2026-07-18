# R81 — Android signed delivery and full-APK update evidence

Date: 2026-07-18

Branch: `refactor/bun-migration`

Bead: `lyntty-6o0.6`

## Scope

This round completes the Android consumer and release boundary required before release orchestration:

- explicit and isolated development, preview, and stable package identities and channels;
- fixed Preview signing identity and fail-closed permanent Production signing inputs;
- production Gradle task-graph guard against debug or ambiguous packaging;
- Bun-driven Gradle with a failing Node-family `PATH` sentinel plus `strace -f -e execve` audit;
- APK package, version, non-debuggable, signature, and production certificate-pin audit;
- stable/preview channel binding through App and Relay, with Preview forbidden from falling back to Stable;
- complete signed APK download, native streaming SHA-256 verification, and Android Package Installer handoff;
- explicit digest-mismatch failure before installer launch;
- guarded, isolated Maestro coverage for Pi shared control, replay, reload ownership, history gaps, and APK upgrade.

The Android channel field is the strict consumer seam for the signed Compatibility BOM. This round does not fabricate an unsigned local manifest into a release BOM; signing, immutable BOM publication, SBOM, and provenance remain in `lyntty-6o0.7`.

## Safety boundaries

- All App, Relay, node, Pi, update-server, and emulator state lived under ignored `dist/test-state` paths.
- The test Relay used port `3305`, fake model port `3411`, update server port `3412`, an isolated AVD on `emulator-5556`, and a uniquely named isolated tmux/Pi session.
- The guarded restart/reload scripts verified pane PID, cwd, command, `HOME`, and `LYNTTY_HOME_DIR` before any lifecycle action.
- No live `~/.pi`, `~/.lyntty`, current Pi pane, production Relay, GitHub Release, or permanent signing material was touched.
- Production configuration was validated with a local throwaway keystore and Firebase fixture. It proves configuration, identity, Bun-only build, and fail-closed behavior; it is not production signing evidence.

## Verification

### App and Relay

```bash
bun run --cwd packages/lyntty-app test
bun run --cwd packages/lyntty-app typecheck
bun run --cwd packages/lyntty-relay test
bun run --cwd packages/lyntty-relay typecheck
```

Results:

- App: **791 passed, 0 failed, 3182 assertions, 87 files**.
- Relay: **112 passed, 0 failed, 321 assertions, 18 files**.
- Both TypeScript checks passed.

The route tests prove Stable default behavior, Preview's explicit-only source, channel-separated caches, package/channel mismatch rejection, malformed manifests failing closed, and legacy production-client inference only for `dev.jczhang.lyntty`.

### Preview release-style APK

A current-source universal Preview APK was built with the tracked runtime audit and inspected with the tracked APK audit:

```bash
APP_ENV=preview packages/lyntty-app/scripts/gradle-runtime-audit.sh ... -- ./gradlew assembleRelease ...
packages/lyntty-app/scripts/apk-audit.sh <apk> dev.jczhang.lyntty.preview 1.0.4 900012
```

Result:

```text
application_id=dev.jczhang.lyntty.preview
version_name=1.0.4
version_code=900012
debuggable=false
signer_sha256=ebd23c222b690e2be635fe3e52bd70b6fb86c5570ab279bc4e8c1f22ed90ef9c
Node-family execve matches: 0
Sentinel invocations: 0
```

Retained summaries: `docs/evidence/artifacts/r81-android-release/apk/preview-*`.

### Production configuration and task guard

A current-source arm64 Production-config APK was built with isolated validation signing and Firebase fixtures:

```bash
APP_ENV=production packages/lyntty-app/scripts/gradle-runtime-audit.sh ... -- ./gradlew assembleRelease ...
packages/lyntty-app/scripts/apk-audit.sh <apk> dev.jczhang.lyntty 1.0.0 900020
```

Result:

```text
application_id=dev.jczhang.lyntty
version_name=1.0.0
version_code=900020
debuggable=false
signer_sha256=13d65cbe96228136e74a7db71429ed91f30acdc7f4b00201884d165d26b83bbb
Node-family execve matches: 0
Sentinel invocations: 0
```

The fingerprint above is explicitly the local validation signer. The protected Production workflow additionally requires `LYNTTY_ANDROID_CERT_SHA256` to match the permanent certificate.

The tracked regression gate ran:

```bash
packages/lyntty-app/scripts/gradle-production-guard-test.sh <summary>
```

Both `APP_ENV=production :app:assembleDebug` and ambiguous `:app:build` were rejected from the resolved task graph before packaging. Missing production signing and Firebase inputs also fail closed. Retained summaries: `docs/evidence/artifacts/r81-android-release/apk/production-*`.

### Full APK update and integrity failure

The Preview APK consumer was exercised against the isolated Relay and manifest server:

```bash
scripts/e2e/run-maestro.sh e2e/maestro/09_full_apk_update.yml
scripts/e2e/run-maestro.sh e2e/maestro/10_bad_apk_hash.yml
```

Results:

- `900011` downloaded the same-package, same-signer `900012` universal APK;
- Android Package Installer displayed its confirmation UI and completed the upgrade;
- installed package remained `dev.jczhang.lyntty.preview`, installed `versionCode` became `900012`, and the existing `R81 Pi shared control` session row remained visible after reopening;
- a manifest advertising `900013` with an intentionally wrong SHA-256 showed `Update failed`, never opened the installer, and left installed `versionCode` at `900012`.

An earlier whole-file JS verification attempt reproduced an Android heap OOM on the approximately 134 MB universal APK. The final implementation streams through native Android `MessageDigest` with a fixed 1 MiB buffer and completed the tracked full update flow in 20 seconds.

Retained JUnit results: `docs/evidence/artifacts/r81-android-release/maestro/09-full-apk-update.xml` and `10-bad-apk-hash.xml`.

### Pi shared-control Maestro matrix

The isolated release-style Preview environment passed:

1. first run;
2. node pairing;
3. Pi history open, phone send, and distinct assistant reply;
4. app reconnect smoke;
5. daemon-stop queue and exactly-once replay (`pane_occurrences=1`);
6. recovered reply;
7. isolated Pi `/reload`, changed owner epoch, and one execution (`pane_occurrences=1`);
8. explicit `history_gap` remediation;
9. full APK upgrade with retained data;
10. bad APK digest rejection.

The directory runner now dispatches 05 and 07 through their guarded orchestration scripts and refuses direct execution, so those reliability checks cannot degrade into false-green ordinary message flows. JUnit and small checkpoint artifacts are retained under `docs/evidence/artifacts/r81-android-release/maestro/`.

### Repository and workflow hardening

```bash
bun install --frozen-lockfile
bun pm untrusted
bun audit
bun run test:repo-hardening
bun -e '<parse .github/workflows/android-release.yml>'
sh -n packages/lyntty-app/scripts/apk-audit.sh packages/lyntty-app/scripts/gradle-production-guard-test.sh packages/lyntty-app/scripts/gradle-runtime-audit.sh scripts/e2e/run-maestro.sh scripts/e2e/maestro-daemon-restart.sh scripts/e2e/maestro-reload-ownership.sh
git diff --check
```

Results: frozen install changed no lockfile, lifecycle audit reported **0 untrusted dependencies**, dependency audit found no vulnerabilities, **8** workflow/evidence hardening tests passed, workflow YAML parsed, shell syntax passed, and whitespace validation passed.

## Independent review

The first blocking review found two P1 issues:

- Production `:app:build` could bypass requested-task-name checks and include a debug-signed stable-package APK;
- sequential/direct Maestro execution could run flows 05 and 07 without the guarded restart/reload actions.

The implementation now validates the resolved Gradle task graph, runs the guard regression in the Production workflow, dispatches guarded orchestration in directory mode, and rejects direct 05/07 runner use. The focused re-review found no unresolved P0/P1 and ended **APPROVE**.

## Residual gates

Not claimed in this round:

- the permanent Production keystore, Firebase config, Expo project id, and certificate pin exist only in the protected GitHub environment and were not available locally;
- `.github/workflows/android-release.yml` has not run on protected `main` for this commit;
- no Production APK, Preview APK, mutable `latest.json`, GitHub Release, or Compatibility BOM was published;
- signed immutable Compatibility BOM, component SemVer, SBOM, provenance, and rollback metadata belong to `lyntty-6o0.7`;
- no physical-phone validation was run; Android validation used the isolated API 35 emulator;
- iOS remains best-effort and was not exercised; native APK installation is Android-only by design.
