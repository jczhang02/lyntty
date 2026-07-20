# R86 — Android Preview APK prerelease

Date: 2026-07-20

Status: PR #17 merged; second candidate built the APK but stopped at audit; signer-parser remediation pending protected PR

## Scope

This release path publishes only the developer Android Preview package:

```text
applicationId: dev.jczhang.lyntty.preview
versionName: 1.2.0
versionCode: 920001
ABIs: arm64-v8a, x86_64
Tag: android-preview-v1.2.0-920001
Title: V1.2.0 Local First 📡
```

It does not publish or deploy Stable Android, CLI/daemon archives, Relay OCI, Compatibility BOM, a hosted Preview Relay, Google Play, or OTA updates.

## Preview first-run contract

Preview now requires a persisted, validated Relay before authentication or sync can initialize:

- no configured or policy-invalid Relay means stored credentials are cleared without being read or restored;
- credential deletion failures stop bootstrap or Relay replacement before the new URL can be persisted;
- deep links cannot mount account routes, and the sync/navigation graph is lazy-loaded only after setup, while **Connect to Relay** uses an independent route group with no business index;
- validation probes canonical `GET /health` and requires `status: ok` plus `service: lyntty-relay`;
- Preview HTTP accepts only localhost, loopback, private RFC1918/CGNAT IPv4, or local IPv6; HTTPS remains available;
- existing valid custom Relay settings survive an in-place Preview update;
- changing or clearing Relay clears old authentication/sync state;
- Stable keeps its production HTTPS and public default behavior.

## Candidate and promotion boundary

`.github/workflows/android-preview-candidate.yml` builds once from exact protected `main`, audits the APK, sole signer, and Bun-only execution boundary, generates SHA-256/provenance/Mole-style bilingual notes plus a strict content manifest, attests both APK and manifest, and uploads a 30-day candidate artifact. It has no contents-write permission and cannot create a Release.

After the candidate SHA-256 is reviewed into `scripts/preview-apk-allowlist.json`, the exact candidate must pass physical Android update and fresh-start testing. Candidate-to-Promotion source changes are restricted to the exact allowlist and R86 Candidate evidence files. Repository immutable releases and an update/deletion-blocking `android-preview-v*` tag ruleset are external Promotion gates, persisted as separately reviewed repository variables after admin-API verification. `.github/workflows/android-preview-promote.yml` accepts only that run id and tested SHA-256, requires explicit physical acceptance, verifies protected refs, the exact reviewed delta, both attestations, all manifest/provenance/audit fields, the five release assets immediately before and after publication, immutable tag identity, `isImmutable=true`, and final protected `main`. Promotion does not build and remains idempotent for an already exact immutable prerelease.

## Verification completed before candidate

- focused URL/health policy tests went red before implementation and pass afterward;
- focused bootstrap policy tests went red before implementation and pass afterward, including deletion failure and deep-link route blocking;
- workflow hardening tests went red while the two workflows were absent and pass afterward;
- GitHub admin API confirms immutable releases are enabled; active no-bypass tag ruleset `19203462` blocks `update` and `deletion` for `refs/tags/android-preview-v*`; matching repository gate variables are set;
- TypeScript and i18n gates pass for the implemented App surface.

Final local `bun run ci:fast` passed at the review-hardened head: repo hardening 19; Wire 33; CLI 585; Relay 119 / 332 assertions; App 809 / 3,268 assertions across 89 isolated files; dev/Preview lifecycle 35 / 194 assertions. Both workflows also passed YAML parsing, extracted Bash ShellCheck, and `git diff --check`. PR [#16](https://github.com/jczhang02/lyntty/pull/16) then passed all protected checks and merged as `5b45d37989cc13a8eb2db1d46a8876a0c3227036`.

## First candidate interruption

Candidate run [`29739227276`](https://github.com/jczhang02/lyntty/actions/runs/29739227276) stopped in `:app:createBundleReleaseJsAndAssets` before APK audit, attestation, or artifact upload. The run produced zero artifacts, and no Preview tag or Release was created.

The same `ResolveMessage is not constructable` failure was reproduced locally with the exact Expo `export:embed` path. A scoped diagnostic exposed the hidden original error: `babel.config.js` directly loads `babel-preset-expo`, but the App did not declare it directly, so Bun's isolated workspace linker correctly kept Expo's transitive copy out of Babel Core's resolution path. This was not an `EMFILE` or GitHub runner failure.

The remediation adds the matching `babel-preset-expo ~55.0.23` direct build dependency and a real Preview Android bundle smoke to `ci:app`. Before the dependency fix, `bun run --filter lyntty-app test:bundle` reproduced exit 7 and the Candidate error. Afterward, the same command bundled 3,182 modules and produced a non-empty 13,068,103-byte bundle before deleting its isolated output.

A clean staged snapshot then passed `bun run ci:fast`: repo hardening 19; Wire 33; CLI 585; Relay 119 / 332 assertions; App 809 / 3,268 assertions across 89 isolated files plus the Preview bundle smoke; dev/Preview lifecycle 35 / 194 assertions; and `git diff --check`. PR [#17](https://github.com/jczhang02/lyntty/pull/17) passed all protected checks and merged as GitHub-verified commit `61bdcc9700c234baf029957f2754f076ac2b722e` with the exact reviewed tree.

## Second candidate interruption

Candidate run [`29744698996`](https://github.com/jczhang02/lyntty/actions/runs/29744698996) completed `Build dual-ABI Preview APK`, proving the Expo bundle remediation on the release path. It then stopped in `Audit and stage candidate`; both attestations and artifact upload were skipped, leaving zero artifacts and no Preview tag or Release.

The failure was reproduced with the runner's Android build-tools 37 against a locally built source-matched `1.2.0` / `920001` APK. Build-tools 37 changed the certificate line from `Signer #1 certificate SHA-256 digest` to the scheme-specific `V2 Signer: certificate SHA-256 digest`. The audit parser accepted only the build-tools 36 prefix, found no certificate digest, and failed its single-signer assertion. The local reproduction's package, version, debuggable, standalone bundle, ABI, signer certificate, and embedded source values all matched the release contract; the failed GitHub run retained no APK, so its bytes are not claimed as inspected.

The remediation binds the explicit `Number of signers: 1` field to one unique certificate SHA-256 digest collected across signature schemes, supporting both build-tools 36 and 37 without weakening the sole-signer gate. Focused tests cover both formats, cross-scheme digest deduplication, and fail-closed rejection of two signers with a precise diagnostic. The real source-matched APK passes the updated audit with build-tools 37, and the previously accepted `910003` APK continues to pass with build-tools 36. Candidate source-commit failures now also emit an explicit diagnostic.

A clean synthetic commit of the exact staged tree passed `bun run ci:fast`: repo hardening 19; Wire 33; CLI 585 / 1,272 assertions; Relay 119 / 332 assertions; App 812 / 3,276 assertions across 90 isolated files plus the 13,068,103-byte Preview bundle smoke; dev/Preview lifecycle 35 / 194 assertions. Focused build-tools 36/37 audit tests, real APK audits, ShellCheck, workflow YAML parsing, and `git diff --check` also passed.

## Not run yet

- protected review and merge of the build-tools 37 audit remediation;
- remediated GitHub Candidate audit, attestations, and artifact upload;
- in-place physical update from `910003` to `920001`;
- fresh-data mandatory Relay setup, Android Back behavior, Clear Relay re-gating, pairing, Pi message round trip, and reopen;
- public Promotion workflow.

No public Release exists from this work at this stage.
