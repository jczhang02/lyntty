# R90 — Relay multiarchitecture SBOM recovery

Date: 2026-07-21

Branch: `fix/stable-relay-multiarch-sbom`

Bead: `lyntty-24v`

Implementation commits: `aa8130aa2104de545e3ac475b08e28530d9ceadf` and `aab7831fbac704f55c331be9e00dc6870caeb558` (both GPG signatures verified locally).

## Failure

The first full Stable Candidate run `29825007418` safely stopped at `Generate SPDX SBOMs and deterministic provenance subjects` before BOM assembly, candidate sealing, promotable Candidate bundle upload, tag creation, Release publication, GHCR push, or production deployment. Buildx retained its automatic `.dockerbuild` diagnostic record; that record is not a Candidate artifact and cannot be promoted.

Already-completed steps proved that the run built all five CLI targets, the signed Android APK, and one amd64/arm64 Relay OCI layout from protected main `9180546fe8bc2282a62c061873b4cde03b589600`.

Syft failed on:

```text
syft scan oci-archive:.../lyntty-relay.oci.tar
```

with:

```text
unexpected media type ... application/vnd.oci.image.index.v1+json
```

The Buildx OCI archive has a top-level descriptor for a nested multiarchitecture image index. Syft models one image source and cannot scan both images as one archive source. Scanning only the host architecture would have produced incomplete evidence and was rejected as a fix.

## Fix

`scripts/relay-oci-sbom.ts` now:

1. validates the top-level OCI index and its exact nested-index blob SHA-256 and size;
2. requires exactly one `linux/amd64` and one `linux/arm64` image-manifest descriptor, validates both manifest blobs, permits only the matching BuildKit `unknown/unknown` attestation descriptors, and rejects every other platform or descriptor;
3. rejects symlinked layout parents, writes a temporary one-platform OCI index view for each Syft scan, and byte-restores the original top-level `index.json` even on failure;
4. creates separate `relay-linux-amd64.spdx.json` and `relay-linux-arm64.spdx.json` documents;
5. seals each Syft document with a dedicated SPDX 2.3 `CONTAINER` package and `DESCRIBES` relationship that bind its exact selected image-manifest digest and Stable/Preview repository identity;
6. creates `relay.spdx.json`, a deterministic SPDX 2.3 document that represents the multiarch index package, carries the exact OCI index digest, and hash-references both platform SPDX documents through `externalDocumentRefs` and `VARIANT_OF` relationships;
7. requires the SPDX index digest to equal the digest captured from the built OCI layout.

Candidate checksums, the signed Compatibility BOM, and final Release checksums bind all three SPDX documents plus `relay-oci-platforms.json`. Promotion attaches the SPDX index to the immutable multiarch image digest and publishes the two exact referenced platform documents as release assets.

`.github/workflows/relay-image.yml` now exercises the same real Buildx → nested OCI layout → two Syft scans → SPDX index path on every pull request without publishing.

## Regression loop

The pre-fix static workflow test failed because neither Candidate nor Relay image CI selected both platforms. Unit fixtures cover exact descriptor selection, restoration, deterministic SPDX assembly, external-document hashes, OCI index digest binding, and tampered blob rejection.

Commands completed locally:

```text
bun install --frozen-lockfile
bun pm untrusted
bun run test:repo-hardening
bun test scripts/release.test.ts scripts/github-release.test.ts scripts/relay-oci-sbom.test.ts packages/lyntty-cli/scripts/build-artifact.test.ts
bun run ci:fast
```

Results:

- hardening/redaction/Relay-SBOM: `30 pass / 0 fail`;
- release/publication/Relay-SBOM/artifact: `26 pass / 0 fail`;
- Wire: `36 pass / 0 fail`;
- CLI: `585 pass / 0 fail`;
- Relay: `119 pass / 0 fail`;
- App: `812 pass / 0 fail`, `3276` assertions;
- all workflow YAML parsed;
- `25` changed workflow Bash blocks passed `bash -n` and error-level ShellCheck;
- protected PR run `29831474375` (`Relay image verification`): pass on the real Buildx/Syft path;
- `git diff --check`: pass.

The real Buildx/Syft regression path is not available in the local environment because Docker, Buildx, and Syft are absent. PR #27 run `29829918659` proved that Buildx produced the accepted two-platform/attestation layout and that both selected Syft scans completed. It then exposed a second fail-closed assumption: Syft's `oci-dir` SPDX does not itself put the selected image-manifest digest in its original described package checksum. Commit `aab7831...` adds and validates an explicit manifest-identity package after each Syft scan. Protected run `29831474375` then passed the complete real Buildx → exact amd64/arm64 Syft scans → manifest binding → SPDX index assembly path without publication.

Adversarial reviews found and drove fixes for extra-platform coverage, child-SBOM/manifest binding, symlinked layout parents, signed-BOM supplementary evidence, byte-exact index restoration, and adversarial test coverage. The final follow-up review also validated the resulting SPDX 2.3 documents and returned `PASS` with no remaining P0/P1/P2.

## Residual state

No Candidate artifact exists for failed run `29825007418`; it cannot be promoted or reused. After this fix merges, a replacement Candidate must rebuild every byte from the new protected main and receive its own exact physical Android acceptance.
