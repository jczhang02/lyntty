# Compatibility release and support policy

Lyntty releases App, CLI/`lynttyd`, Relay, and Wire independently. A signed Compatibility BOM selects one tested set; matching version numbers are not required.

## Version authorities

| Component | Source | Current line | SemVer responsibility |
| --- | --- | --- | --- |
| App | `packages/lyntty-app/package.json` | `1.2.x` | Android user behavior and native update contract |
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
- per-component SPDX SBOM and provenance assets, plus optional unique supplementary evidence; the Relay uses this to bind both platform SPDX documents and its OCI selection record;
- zero to two retained predecessor BOM/signature references.

Every file URL must be immutable HTTPS without query, fragment, or `/latest/`. Relay images must use a digest reference, never a tag. Canonical JSON sorts object keys and preserves array order.

A detached schema-1 signature contains the channel, key id, and SHA-256 of the exact canonical BOM file bytes. Canonical BOM assets end with one LF. Ed25519 signs:

```text
LYNTTY-COMPATIBILITY-BOM-V1\n<canonical JSON>\n
```

Predecessor references hash those same file bytes, including the LF; release inventory hashing, detached signature verification, and rolling-history verification therefore agree exactly. CLI and Relay consumers reject semantically equivalent but non-canonical BOM encodings before accepting the signature.

Verification checks the signature, channel-specific trust root, sequence validity, Android package/certificate pin, Relay repository, internal component matrix, and digest/reference forms. Stable and Preview have separate key ids, certificate policy, package ids, environments, tags, and Relay repositories.

`LYNTTY_BOM_PRIVATE_KEY_SEED_BASE64` is canonical base64 for the raw 32-byte Ed25519 seed and exists only as a protected environment secret. Public roots are provided through reviewed `LYNTTY_RELEASE_TRUST_ROOTS` variables and embedded into formal CLI artifacts at build time. Each root binds `keyId`, `channel`, raw Ed25519 public key, sequence validity, Android package/certificate fingerprint, and allowed Relay repository. Stable and Preview roots must use distinct public keys, not merely different key ids. The reviewed Stable bootstrap root is also committed at `config/release-trust-roots/stable.json` and published as `stable-release-trust-roots.json`; candidate and Promotion require the protected environment value to match it exactly. The first stable CLI installer and root are hash-pinned release assets; the permanent Android signing certificate bootstraps App trust. Rotate a BOM key by shipping overlapping public roots under the old key for the complete three-BOM window before activating the new key. The deterministic R82 fixture is never a valid bootstrap: candidate preflight rejects its key ids and public root, while the release signer rejects its private seed.

## Build once, then promote

### Candidate

`.github/workflows/release-candidate.yml` is manual-only. It requires exact protected `main`, selects a channel-specific candidate environment, and builds once:

1. five standalone CLI archives built from the same exact protected source; for this owner-operated self-use Stable line, the macOS and Windows executables are intentionally not Apple-notarized or Authenticode-signed;
2. one channel-bound, signed, non-debuggable APK under the Node-family execution audit;
3. one amd64/arm64 Relay OCI layout without pushing. Because Syft cannot treat the nested multiarchitecture index as one image, Candidate verifies the exact index and platform-manifest descriptor hashes, scans the amd64 and arm64 views separately, and creates an SPDX 2.3 index that hash-references both platform documents;
4. SPDX JSON and deterministic in-toto candidate-verification statements. CLI provenance records `platformCodeSigning.policy=not-required-self-use`, while archive SHA-256, internal manifest SHA-256, exact source commit, runtime-free self-checks, signed BOM, and GitHub attestations remain mandatory;
5. canonical BOM, detached signature, retained rolling matrix, and complete checksums.

The candidate tarball receives GitHub/Sigstore provenance and is retained as an Actions artifact. The job has no package or release publication permission.

### Promotion

`.github/workflows/release-promote.yml` accepts an exact successful candidate run and tag. It runs under `release-stable` or `release-preview`, verifies the Actions attestation, candidate checksums, source SHA, BOM signature, and rolling matrix, then:

- pushes the existing OCI layout and proves the remote digest did not change; an interrupted run may resume only when an existing immutable tag has that exact digest;
- keylessly signs and attests the image by digest;
- attests release files and their SPDX SBOMs;
- invokes `scripts/github-release.ts` to create or resume one exact Release ID, compare every asset ID/API digest/downloaded byte, upload only missing assets without deletion or replacement, and bind the final asset IDs. At the publication boundary it rechecks protected GitHub `main`, atomically creates the direct tag with a non-force Git push (or accepts only the same exact direct tag after an interrupted attempt), then publishes through one complete Release-ID `PATCH`; it verifies the immutable Release, direct tag commit, title/body/target, latest state, and exact assets again.

Promotion contains no Gradle, Bun compile, or image build command. Candidate source must still equal current protected `main`; promotion re-resolves the channel head under its serialized lock, requires exact current/two predecessor references, a higher sequence, and a higher Android `versionCode`. Physical Android validation is optional for Stable. When `physical_phone_accepted=true`, the supplied SHA-256 must match the exact Candidate APK. When it is false, the accepted hash must be empty; no waiver phrase or Release-body warning is required. A checksummed and attested schema-2 `android-validation.json` records the selected mode and exact APK digest without changing any source, signer, BOM, protected-environment, channel-head, or asset-integrity gate. Delayed candidates still cannot regress or silently enter Stable because the Candidate source, BOM-bound APK bytes, protected environment approval, and current channel head remain mandatory.

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

Relay deploy is separate from release but shares the serialized Stable promotion/rollback lock. `.github/workflows/relay-deploy.yml` accepts only the current immutable signed Stable BOM, resolves `ghcr.io/jczhang02/lyntty-relay@sha256:...`, uses pinned SSH known-host material, installs the exact reviewed public trust store and minimum sequence atomically, requires the previous image to be digest-pinned, verifies the backup and sidecar, migrates, runs `doctor`, and proves both the running container image and `/v1/version` BOM/APK identity locally and through `relay.jczhang.cc`. Generic health alone is not acceptance. Production deployment still requires its own `production-relay` approval.

## Consumers

- Relay `/v1/version` fetches BOM and detached signature, verifies a configured trust store, rejects lower in-process sequences, and projects only the channel-matching Android APK fields. Preview has no Stable fallback.
- Compiled `lyntty update check` verifies the BOM with the embedded or explicitly supplied trust store and selects the exact current-platform archive. It never treats an unsigned channel document as trusted.
- Android re-hashes the complete APK with native streaming SHA-256 and hands it to Package Installer; Android enforces the permanent package signer.

## First Stable identity

The first formal Stable line is fixed before any candidate is dispatched:

- App/CLI/Relay/Wire: `1.2.0` / `1.2.0` / `1.2.0` / `0.2.0`;
- BOM sequence `1` and tag `compat-v1.2.0_1.2.0_1.2.0_0.2.0-s1`;
- Android package `dev.jczhang.lyntty`, `versionCode` `6`, and the existing permanent certificate SHA-256 `25e3928a7cc228254e8249e684c6ab661f5c87140e23db7406afc64af29f0cf5`;
- Stable BOM key id `stable-2026-01`, valid from sequence `1`;
- Relay repository `ghcr.io/jczhang02/lyntty-relay`.

There is no predecessor BOM for sequence 1. Candidate enforces `versionCode > 5` in that case so the exact Stable APK upgrades the existing production package. Before Promotion, the owner must verify the Candidate evidence, unsigned-platform disclosure, exact APK hash, optional physical Android result when one is claimed, release body, and protected environment configuration. The first production Relay rollout also requires a separately verified pre-deploy backup/sidecar and a digest-pinned existing image because a signed predecessor rollback BOM does not yet exist.

## Required repository settings

Workflow files cannot create environment protection rules. Before publication, repository administration must configure:

- explicit owner approval for `release-stable`, `release-preview`, `release-stable-candidate`, `release-preview-candidate`, `production-android`, and `production-relay`;
- `main`-only deployment branch policies and protected-PR checks for release trust inputs;
- Stable/Preview BOM secrets and public trust-root variables in their own environments;
- permanent Android signing/Firebase/Expo/certificate-pin values available only to protected release jobs;
- active no-bypass update/deletion rulesets for `compat-v*`, its repository variable, and immutable GitHub Releases;
- pinned `LYNTTY_VPS_KNOWN_HOSTS` for Relay deploy.

Apple Developer ID/notarization and Windows Authenticode credentials are not required for this owner-operated self-use Stable line. The Release body and provenance must disclose that those archives are platform-unsigned. Missing BOM signing, Android signing continuity, checksums, provenance, attestations, protection, or Relay trust inputs remains a release blocker.
