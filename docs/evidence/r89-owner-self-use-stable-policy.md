# R89 — Owner self-use Stable policy

Date: 2026-07-21

Branch: `fix/stable-self-use-release`

Bead: `lyntty-24v`

Implementation commit: `a75ee22916cbe9ee68906a81c1013dde524e8969` (GPG signature verified locally).

## Decision

The repository owner explicitly selected owner approval and does not require Apple Developer ID/notarization or Windows Authenticode for this self-use release. This changes the first-Stable policy without weakening Android upgrade continuity or Compatibility BOM authentication.

The release still contains all five runtime-free CLI/`lynttyd` archives:

- `linux-x64`
- `linux-arm64`
- `darwin-x64`
- `darwin-arm64`
- `windows-x64`

The macOS and Windows executables are intentionally platform-unsigned. The Release body and CLI provenance must say so. A signed Compatibility BOM or GitHub attestation is an integrity/authentication control; neither is represented as Apple notarization, Gatekeeper approval, or Authenticode.

## Retained gates

- exact protected source commit and clean artifact build;
- five unique CLI targets with archive SHA-256, size, and internal manifest SHA-256;
- compiled runtime identity and no Bun/Node-family runtime dependency;
- deterministic CLI provenance with `platformCodeSigning.policy=not-required-self-use`;
- Ed25519-signed canonical Compatibility BOM and channel-isolated trust roots;
- GitHub artifact attestations and release-file/SBOM attestations;
- permanent Android package signer, non-debuggable release APK, exact Candidate hash, and physical Android acceptance before Stable Promotion;
- immutable Release ID/asset ID/download-byte binding;
- digest-pinned Relay OCI, backup/migration/rollback checks, and local/public `/v1/version` verification.

The optional `native-signing-producer.yml` and `native-signing.yml` workflows remain available for a future policy change, but the current Candidate neither invokes them nor accepts external native archive URL/hash replacement inputs.

## Owner approval configuration

GitHub environments retain `jczhang02` as the required reviewer with self-review allowed. The `main` ruleset retains protected PRs, required signed commits, linear history, required checks, no bypass, and resolved review threads; it does not require an unavailable second approver.

## Android key provenance and validation

The existing repository Android/Firebase secrets were configured on 2026-07-06 and then used by workflow run `29020171652` to publish `android-v1.0.0-5`. Those secret values have not been updated since.

A new non-publishing verification run used the same secret names against protected main `94785cea37ae95e257c4d692f2073782414466c5`:

- run: `29821672497`;
- artifact: `android-stable-candidate-94785cea37ae95e257c4d692f2073782414466c5-6`;
- APK SHA-256: `35a21d770426413d010892fba528517cb318b3ba8d4fb835ad982656b038017b`;
- package/version: `dev.jczhang.lyntty`, `1.2.0`, `versionCode=6`;
- signer SHA-256: `25e3928a7cc228254e8249e684c6ab661f5c87140e23db7406afc64af29f0cf5`;
- signer count: `1`;
- debuggable: `false`.

This proves GitHub still holds the production continuity key used for the `versionCode=5` line. The verification APK is not the later Compatibility Candidate and is not physical-device acceptance for that future exact hash.

## Verification

Completed while implementing this policy:

```text
bun install --frozen-lockfile
bun pm untrusted
bun run ci:fast
bun run test:repo-hardening
bun test packages/lyntty-wire/src/compatibilityBom.test.ts scripts/workflow-hardening.test.mjs
bun test scripts/release.test.ts scripts/github-release.test.ts packages/lyntty-cli/scripts/build-artifact.test.ts
```

Results:

- Wire: `35 pass / 0 fail`;
- CLI: `585 pass / 0 fail`;
- Relay: `119 pass / 0 fail`;
- App: `812 pass / 0 fail`, `3276` assertions;
- policy-focused suite: `31 pass / 0 fail`;
- release/publication/artifact suite: `22 pass / 0 fail`;
- repository hardening/redaction: `26 pass / 0 fail`;
- all workflow YAML parsed; `24` Candidate/Promotion Bash blocks passed `bash -n` and error-level ShellCheck;
- `git diff --check`: pass.

An independent read-only code review returned `PASS` with no P0/P1/P2 findings. Protected-PR CI remains required before merge.

## Publication status and residual risk

No Compatibility Candidate, Stable tag, Stable Release, GHCR promotion, or production Relay deployment was created by this policy change. macOS may show Gatekeeper warnings and Windows may show SmartScreen warnings. The owner accepts those usability warnings for self-use; users must not infer platform publisher identity from the BOM signature.

Remaining external gates include the exact future Candidate APK physical test, GHCR package audit access, pinned VPS known-host material, current digest-pinned Relay runtime discovery, and backup/restore drill.
