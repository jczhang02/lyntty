# R86 — Android Preview APK candidate

Date: 2026-07-21

Status: Candidate run `29762476280` was superseded before publication by the R87 dependency security update. Its historical evidence remains, but its allowlist authorization is revoked and a replacement Candidate is pending.

## Candidate identity

```text
Candidate run: 29762476280
Candidate URL: https://github.com/jczhang02/lyntty/actions/runs/29762476280
Artifact: android-preview-candidate-29762476280
Artifact ID: 8470552908
Artifact archive digest: sha256:3e9ebcb5b0f401831cc5e2181cd294bf338222b149de8562e68273aea8089973
APK: lyntty-preview-v1.2.0-920001.apk
APK size: 126797863 bytes
APK SHA-256: 9025d83a142ded5a618ef15c56c9bdd5486fed8336a53f1b9f0c7336b325aae9
Source commit: 33d7a99c57cce0783d069e95ba6d4abc59a53c1d
Source tree: 6c6ba760d68d0f68e85d1af839efb90a0ab9c252
applicationId: dev.jczhang.lyntty.preview
versionName: 1.2.0
versionCode: 920001
ABIs: arm64-v8a, x86_64
Signer SHA-256: ebd23c222b690e2be635fe3e52bd70b6fb86c5570ab279bc4e8c1f22ed90ef9c
```

## Superseded before publication

Protected PR #20 upgraded the audited dependency graph to `shell-quote@1.9.0` for GHSA-395f-4hp3-45gv and merged as `08b56175a8f22bc6f4b7d014de4767232fc930e7`. Because root `package.json` and `bun.lock` are Android Candidate build inputs, the exact source identity above is no longer eligible for Promotion even though its bytes, sidecars, and attestations remain valid historical evidence.

The public tag and Release never existed. This preparation change removes only the old `920001` entry from `scripts/preview-apk-allowlist.json`; it does not delete or rewrite historical evidence. The retained `910003` entry keeps the manual upgrade fixture available, while Candidate policy can again require `920001 > maxAllowlistedVersionCode` for a fresh protected-main build.

Focused JSON verification confirms exactly one retained artifact, maximum allowlisted `versionCode` `910003`, and replacement eligibility for `920001`. `bun audit` reports zero vulnerabilities, and `bun run ci:fast` passes hardening/redaction 20, Wire 33/76, CLI 585/1272, Relay 119/332, App 812/3276 across 90 files plus bundle smoke, and lifecycle 35/194. The tag and Release absence checks also pass.

## Candidate verification

The workflow ran from protected `main` and every step succeeded: exact-source validation, dependency installation, configuration rejection checks, Bun-only audited dual-ABI build, APK staging/audit, APK attestation, manifest attestation, and candidate upload. It retained one artifact and did not create a tag or Release.

The downloaded candidate contained exactly the APK, SHA-256 sidecar, APK audit, runtime audit, provenance, release notes, release title, and candidate manifest. The manifest binds seven release inputs by exact name, size, and SHA-256. Independent verification confirmed:

- the APK sidecar and manifest both bind SHA-256 `9025d83a142ded5a618ef15c56c9bdd5486fed8336a53f1b9f0c7336b325aae9` and size `126797863`;
- provenance binds run `29762476280`, source commit/tree, package, version, signer, ABIs, tag, title, APK hash, and size;
- the embedded App source commit is `33d7a99c57cce0783d069e95ba6d4abc59a53c1d`;
- a real build-tools 37 audit confirms one signer, APK Signature Scheme v2, non-debuggable package, standalone bundle, and exactly `arm64-v8a,x86_64`;
- the runtime audit reports zero Node-family `execve` matches and zero sentinel invocations;
- strict GitHub attestation verification for both APK and manifest binds the Candidate workflow, protected `main`, and signer/source digest `33d7a99c57cce0783d069e95ba6d4abc59a53c1d`;
- release title and notes resolve exactly with no template placeholders;
- the public tag `android-preview-v1.2.0-920001` and GitHub Release remain absent.

The five files under `docs/evidence/artifacts/r86-preview-apk-candidate/` remain byte-for-byte historical copies of the corresponding Candidate sidecars. The APK itself is intentionally not committed. The original evidence PR added one allowlist binding for these bytes; this revocation removes that binding without rewriting the historical sidecars.

## Physical Android acceptance was not run

The planned physical-device matrix for this historical Candidate was:

1. update the installed `1.1.0` / `910003` Preview APK to `1.2.0` / `920001` and confirm the existing valid Relay configuration remains usable;
2. clear App data or perform a fresh install and confirm authentication/sync cannot start before Relay setup;
3. confirm an invalid Relay is rejected, the local Relay `/health` contract is accepted, and Android Back can exit the mandatory setup screen;
4. pair the node, open the managed Pi session, send a distinct phone message, receive its distinct assistant reply, and verify continuity after reopening the App;
5. clear Relay and confirm the App returns to the setup gate without reusing the prior identity.

That matrix was not executed for this superseded APK. Any later Promotion must use the replacement Candidate and its newly reviewed hash, not the APK identity recorded above. The owner later authorized a truthful unverified-device release, but that separate protected waiver policy must apply to the replacement Candidate with `physical_phone_accepted=false`; this evidence does not claim physical acceptance for either Candidate.

## Publication boundary

No public Release, Stable APK, CLI archive, Relay image, Compatibility BOM, hosted Preview Relay, Google Play artifact, or OTA update is created by this revocation PR. Promotion remains blocked until a fresh protected-main Candidate is built, audited, attested, and bound to a newly reviewed exact SHA-256; the truthful waiver policy and public warning must then pass their own protected checks.
