# Optional native CLI signing and staging

Stable ships five standalone CLI/`lynttyd` archives. The first owner-operated self-use Stable line intentionally publishes macOS and Windows archives without Apple notarization or Authenticode; signed BOM, hash, provenance, and GitHub attestation checks remain mandatory. The workflows below are retained as optional future tooling and are not invoked or consumed by the current Candidate contract. Reconnecting them to Stable requires a protected PR and exact-byte review.

## Optional protected environment

Only create `release-native-signing` when platform code signing is deliberately enabled. Restrict it to `main` and require an explicit owner approval.

Secrets:

- `LYNTTY_APPLE_DEVELOPER_ID_P12_BASE64`
- `LYNTTY_APPLE_DEVELOPER_ID_P12_PASSWORD`
- `LYNTTY_APPLE_ID`
- `LYNTTY_APPLE_APP_PASSWORD`
- `LYNTTY_WINDOWS_CODESIGN_PFX_BASE64`
- `LYNTTY_WINDOWS_CODESIGN_PFX_PASSWORD`

Variables:

- `LYNTTY_APPLE_TEAM_ID`
- `LYNTTY_APPLE_SIGNING_AUTHORITY`
- `LYNTTY_WINDOWS_CERT_THUMBPRINT`
- `LYNTTY_WINDOWS_RFC3161_TIMESTAMP_URL` using HTTPS
- `LYNTTY_RELEASE_TRUST_ROOTS`, exactly matching `config/release-trust-roots/stable.json`
- `LYNTTY_IMMUTABLE_RELEASES_ENABLED=true`
- `LYNTTY_NATIVE_SIGNING_TAG_RULESET_ID`

The referenced ruleset must be active, have no bypass actors, and prohibit update/deletion of `refs/tags/native-signing-*`. Never paste P12/PFX bytes or passwords into workflow inputs, logs, evidence, or chat.

## Produce immutable staging bytes

Dispatch `.github/workflows/native-signing-producer.yml` from current protected `main`. It has no mutable inputs and derives a unique tag from version, full source SHA, run ID, and attempt.

The native jobs:

1. build one target with embedded reviewed Stable roots and an unsigned manifest;
2. require the exact executable inventory (`lyntty`, `lynttyd`, `rg`, and `difft`);
3. import the identity only into an ephemeral keychain/certificate store;
4. sign every executable explicitly;
5. allow only executable bytes to change, then regenerate the manifest from final bytes;
6. notarize the complete macOS root or require an RFC3161 Authenticode timestamp;
7. verify signer identity, timestamp, Gatekeeper/Authenticode, architecture, and compiled self-check;
8. delete imported credential material before uploading a credential-free transport artifact.

The Ubuntu publisher re-finalizes the transported roots, proving non-executable bytes and signed executable hashes remain unchanged, creates deterministic archives, and publishes an immutable prerelease through `scripts/github-release.ts`. It never deletes, replaces, or clobbers an existing Release, tag, or asset.

Expected staging assets include three archives, manifest/archive sidecars, per-target signing evidence, `native-signing-metadata.json`, and `native-signing-checksums.txt`.

## Independently verify

For an optional future platform-signed release, first dispatch `.github/workflows/native-signing.yml` with:

- exact `source_sha`, CLI version, and staging `release_tag`;
- exact metadata URL/SHA-256;
- exact archive URL/SHA-256 for all three targets;
- the two notarization UUIDs from metadata.

The verifier runs x64 and arm64 on matching macOS runners and Windows on a native runner. It requires the immutable staging Release/tag to target the source commit, verifies metadata and every archive byte, reruns platform signature/runtime checks, and emits one GitHub attestation per archive.

The current self-use Candidate does not accept external native archive URL/hash inputs, so optional staging output cannot silently replace Candidate bytes. A future policy change must reconnect those exact inputs and verifier attestations through a protected PR. A failed verifier leaves an immutable but untrusted prerelease; transient verification failures may rerun against the same bytes, while bad bytes require a new producer run and tag.

## Platform caveats

Bare Mach-O files cannot carry a stapled ticket like a package. The workflow therefore submits a ZIP containing the finalized root and requires online `notarytool` acceptance plus Gatekeeper assessment for every executable. If Apple stops accepting or assessing this form, stop and change the delivery contract to a signed PKG/DMG through a protected PR.

The Windows workflow assumes an exportable PFX. Hardware-backed EV or cloud-held keys need a dedicated signing-provider integration; do not export or emulate them.
