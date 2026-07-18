# Compatibility release and support policy

Lyntty releases App, CLI/`lynttyd`, Relay, and Wire independently. A signed Compatibility BOM selects one tested set; matching version numbers are not required.

## Version authorities

| Component | Source | Current line | SemVer responsibility |
| --- | --- | --- | --- |
| App | `packages/lyntty-app/package.json` | `1.1.x` | Android/iOS user behavior and native update contract |
| CLI + `lynttyd` | `packages/lyntty-cli/package.json` | `1.2.x` | local executable, service, Pi extension, and artifact manifest |
| Relay | `packages/lyntty-relay/package.json` | `1.2.x` | API/Socket behavior, OCI runtime, and migration compatibility |
| Wire | `packages/lyntty-wire/package.json` | `0.2.x` | shared schemas, capability negotiation, and BOM schema |

A component version changes only when that component changes. A BOM sequence changes for every candidate, promotion rollback, or channel advance even when some component versions are reused.

## Wire negotiation

Wire package SemVer and protocol numbers are separate. Current clients advertise protocol `1.1` plus explicit Pi capabilities. Relay compares the offer before registering Socket.IO handlers:

- protocol majors must match;
- absolute minor skew may be at most one;
- `pi.shared-control.v1` and `pi.command-idempotency.v1` are required;
- negotiated capabilities are the sorted intersection;
- clients without an offer are treated only as legacy protocol `1.0` during this support window;
- malformed offers, missing required capabilities, major mismatch, and a two-minor skew fail closed.

The CLI also writes its offer into encrypted machine metadata, allowing App versions to distinguish explicit capabilities from legacy metadata. A future protocol `1.2` may roll against `1.1`; it cannot advance while `1.0` remains in the retained support window.

## Signed BOM

`packages/lyntty-wire/src/compatibilityBom.ts` is the release interface. Schema 1 binds:

- channel, monotonic sequence, release id, source commit, and support policy;
- independent component versions, source commits, Wire offers, required capabilities, and SemVer ranges;
- stable/preview Android package, `versionCode`, certificate fingerprint, immutable APK URL, SHA-256, and size;
- all five CLI archives plus archive SHA-256, size, and internal artifact-manifest SHA-256;
- multiarchitecture Relay repository and OCI `@sha256:` digest;
- per-component SPDX SBOM and provenance assets;
- zero to two retained predecessor BOM/signature references.

Every file URL must be immutable HTTPS without query, fragment, or `/latest/`. Relay images must use a digest reference, never a tag. Canonical JSON sorts object keys and preserves array order.

A detached schema-1 signature contains the channel, key id, and SHA-256 of the exact canonical BOM file bytes. Canonical BOM assets end with one LF. Ed25519 signs:

```text
LYNTTY-COMPATIBILITY-BOM-V1\n<canonical JSON>\n
```

Predecessor references hash those same file bytes, including the LF; release inventory hashing, detached signature verification, and rolling-history verification therefore agree exactly. CLI and Relay consumers reject semantically equivalent but non-canonical BOM encodings before accepting the signature.

Verification checks the signature, channel-specific trust root, sequence validity, Android package/certificate pin, Relay repository, internal component matrix, and digest/reference forms. Stable and Preview have separate key ids, certificate policy, package ids, environments, tags, and Relay repositories.

`LYNTTY_BOM_PRIVATE_KEY_SEED_BASE64` is canonical base64 for the raw 32-byte Ed25519 seed and exists only as a protected environment secret. Public roots are provided through reviewed `LYNTTY_RELEASE_TRUST_ROOTS` variables and embedded into formal CLI artifacts at build time. Each root binds `keyId`, `channel`, raw Ed25519 public key, sequence validity, Android package/certificate fingerprint, and allowed Relay repository. Stable and Preview roots must be different. The first stable CLI remains hash-pinned by the existing installer; the permanent Android signing certificate bootstraps App trust. Rotate a BOM key by shipping overlapping public roots under the old key for the complete three-BOM window before activating the new key. The deterministic R82 fixture is never a valid bootstrap: candidate preflight rejects its key ids and public root, while the release signer rejects its private seed.

## Build once, then promote

### Candidate

`.github/workflows/release-candidate.yml` is manual-only. It requires exact protected `main`, selects a channel-specific candidate environment, and builds once:

1. five standalone CLI archives; Stable replaces both macOS archives and the Windows archive with externally signed bytes from immutable credential-free `native-signing-*` staging assets. `.github/workflows/native-signing.yml` runs on matching native runners, verifies exact archive roots/inventory/runtime identity, Apple Team/Developer ID plus Gatekeeper notarization, or Authenticode thumbprint plus timestamp, and attests the archive at the exact source commit. Candidate verification pins that workflow and workflow commit and embeds each attestation proof in the BOM;
2. one channel-bound, signed, non-debuggable APK under the Node-family execution audit;
3. one amd64/arm64 Relay OCI layout without pushing;
4. SPDX JSON and deterministic in-toto candidate-verification statements; externally signed native archives retain their pinned native workflow attestations rather than being attributed to the candidate builder;
5. canonical BOM, detached signature, retained rolling matrix, and complete checksums.

The candidate tarball receives GitHub/Sigstore provenance and is retained as an Actions artifact. The job has no package or release publication permission.

### Promotion

`.github/workflows/release-promote.yml` accepts an exact successful candidate run and tag. It runs under `release-stable` or `release-preview`, verifies the Actions attestation, candidate checksums, source SHA, BOM signature, and rolling matrix, then:

- pushes the existing OCI layout and proves the remote digest did not change; an interrupted run may resume only when an existing immutable tag has that exact digest;
- keylessly signs and attests the image by digest;
- attests release files and their SPDX SBOMs;
- creates or resumes an exact draft, compares every pre-existing asset byte-for-byte, uploads only missing assets, verifies the complete asset set, and then publishes the exact candidate APK/archives/evidence/BOM assets atomically.

Promotion contains no Gradle, Bun compile, or image build command. Candidate source must still equal current protected `main`; promotion re-resolves the channel head under its serialized lock, requires exact current/two predecessor references, a higher sequence, and a higher Android `versionCode`. Delayed candidates therefore cannot regress Stable or Preview.

Stable creates a normal GitHub Release with `--latest`. Preview creates a prerelease and can never become GitHub latest. Therefore:

```text
/releases/latest/download/compatibility-bom.json
```

always means Stable. Preview requires an explicit immutable or preview-configured BOM URL. Preview tags use `compat-preview-*`, APK package `dev.jczhang.lyntty.preview`, its Preview signer, Preview BOM key, and `ghcr.io/jczhang02/lyntty-relay-preview`. Stable uses none of those identities.

The older Android-only workflow now uploads a verification candidate and cannot create a GitHub Release. Ordinary `main` pushes never publish product artifacts or deploy Relay.

## Support and rollback window

Stable retains current plus two predecessor BOMs for at least 90 days. Candidate validation evaluates every declared App × CLI × Relay SemVer/Wire combination across those BOMs, not just adjacent complete sets. It additionally downloads and attestation-checks each retained Linux CLI archive, runs its compiled self-check under runtime sentinels, verifies retained Relay image signature/attestation and runtime identity, and runs each retained Relay `doctor` against a database migrated by the current Relay. Android cross-version behavior remains covered by the release-style Maestro gate rather than being simulated by metadata.

`.github/workflows/release-rollback.yml` permits only those two retained Stable predecessors. A rollback creates a **new higher sequence** and signature:

- current signed App remains selected because Android cannot downgrade `versionCode`;
- CLI and Relay return to the selected retained immutable artifacts;
- no artifact is rebuilt;
- the new mixed set and all retained combinations must pass before it becomes Stable latest.

Relay deploy is separate from release but shares the serialized Stable promotion/rollback lock. `.github/workflows/relay-deploy.yml` accepts only the current signed Stable BOM, resolves `ghcr.io/jczhang02/lyntty-relay@sha256:...`, uses pinned SSH known-host material, stops Relay, backs up, migrates, runs `doctor`, starts, health-checks, and records the deployed BOM and digest. Production deployment still requires its own `production-relay` approval.

## Consumers

- Relay `/v1/version` fetches BOM and detached signature, verifies a configured trust store, rejects lower in-process sequences, and projects only the channel-matching Android APK fields. Preview has no Stable fallback.
- Compiled `lyntty update check` verifies the BOM with the embedded or explicitly supplied trust store and selects the exact current-platform archive. It never treats an unsigned channel document as trusted.
- Android re-hashes the complete APK with native streaming SHA-256 and hands it to Package Installer; Android enforces the permanent package signer.

## Required repository settings

Workflow files cannot create environment protection rules. Before publication, repository administration must configure:

- required reviewers with self-review disabled for `release-stable`, `release-preview`, `release-stable-candidate`, `release-preview-candidate`, `release-native-signing`, `production-android`, and `production-relay`;
- `main`-only deployment branch policies and required CODEOWNERS review for release trust inputs;
- Stable/Preview BOM secrets and public trust-root variables in their own environments;
- permanent Android signing/Firebase/Expo/certificate-pin values only in Stable candidate environments;
- immutable macOS/Windows archive URL/hash values plus a protected `release-native-signing` environment with `LYNTTY_APPLE_ID`, `LYNTTY_APPLE_APP_PASSWORD`, `LYNTTY_APPLE_TEAM_ID`, `LYNTTY_APPLE_SIGNING_AUTHORITY`, and `LYNTTY_WINDOWS_CERT_THUMBPRINT`; missing native verification or a source/workflow-digest mismatch blocks Stable;
- protected/no-overwrite `compat-*` tags and immutable GitHub Releases;
- pinned `LYNTTY_VPS_KNOWN_HOSTS` for Relay deploy.

Missing protection, signing, attestation, or platform-native credentials is a release blocker, not a reason to publish a partially trusted Stable artifact.
