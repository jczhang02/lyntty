# R120 — Stable Compatibility 1.2.1 publication

Date: 2026-07-27

Branch: `docs/r120-stable-1.2.1-publication`

Bead: `lyntty-mpr`

Release: [`compat-v1.2.1_1.2.1_1.2.1_0.2.0-s2`](https://github.com/jczhang02/lyntty/releases/tag/compat-v1.2.1_1.2.1_1.2.1_0.2.0-s2)

## Published identity

| Field | Value |
| --- | --- |
| Release ID | `360246346` |
| Source | `f9698f4930294ee38ff914dfa6d7d0705bebc485` |
| App | `1.2.1` |
| CLI + `lynttyd` | `1.2.1` |
| Relay | `1.2.1` |
| Wire | `0.2.0` |
| Sequence | `2` |
| Android package | `dev.jczhang.lyntty` |
| Android `versionCode` | `7` |
| Candidate run | [`30241194899`](https://github.com/jczhang02/lyntty/actions/runs/30241194899) |
| Promotion run | [`30243779634`](https://github.com/jczhang02/lyntty/actions/runs/30243779634) |
| Published | `2026-07-27T06:51:15Z` |

GitHub reports the Release as non-draft, non-prerelease, immutable, and Latest. Its lightweight tag resolves directly to the exact verified protected-`main` source above. Stable tag ruleset `19382133` remains active with update and deletion protection and no bypass actor.

The generated Release body records sequence `2`, the exact source, Candidate run `30241194899`, and the Relay digest. With `physical_phone_accepted=false`, it contains neither a physical-acceptance claim nor an unverified-device warning. It retains the required macOS/Windows platform-signing disclosure.

## Candidate and Promotion

The first Candidate run `30236540399` was valid for its source, but Promotion run `30238922664` exposed an absolute predecessor-path portability defect and failed before every publishing mutation. PR [#62](https://github.com/jczhang02/lyntty/pull/62) fixed that defect under protected review and merged as the final release source.

Replacement Candidate run `30241194899` completed all `33` steps. It produced one unexpired Candidate artifact:

```text
Artifact ID: 8643987908
Size: 1,335,021,470 bytes
Digest: sha256:c3ad01d475c21f0fb234b2cdfdfbb72f6cddbf15c721f3970bdd215a0d330f6e
```

Candidate checks covered the production APK, five standalone CLI targets, retained `1.2.0` CLI and Relay execution, migrated Relay schema, dual-platform Relay OCI layout, SPDX SBOMs, deterministic provenance, Compatibility BOM signing/history verification, and Candidate attestation.

Promotion run `30243779634` completed all `25` steps. It independently downloaded the exact Candidate by run ID, verified attestation/checksums/BOM/history/source/matrix, revalidated the channel head, promoted the existing Relay OCI bytes by digest, signed and attested the image, attested all Release files, published one Release-ID transaction, preserved the publication audit, and verified Latest isolation.

## Immutable artifacts

The Release contains exactly `36` uploaded assets totaling `533,241,191` bytes. The preserved publication audit artifact is:

```text
Artifact ID: 8644321835
Digest: sha256:8948886cc85af3b0f5ee4b28759913585eedf6edf0d2cf4195fb638d045c2857
Release body SHA-256: 0031007c0bb865edb7304bff6b1e6e3bb373ea987ef598e0cf25bec3e4dbc3a9
Publication occurred: true
```

The audit's Release ID, tag, target, body hash, and every asset ID/name/size/SHA-256 match the immutable GitHub Release metadata and the downloaded bytes. `release-checksums.txt` verifies all other `35` assets. The Latest download of `compatibility-bom.json` is byte-identical to the tagged asset.

Key published digests:

| Artifact | SHA-256 |
| --- | --- |
| `lyntty-stable.apk` | `82ad98c7a518ba9be6c77ead2724ce5c00b22d6fe5fb6dae92e92ad0677907ad` |
| `lyntty-cli-1.2.1-darwin-arm64.tar.gz` | `9f671c9fac13a3f78238eb0aa2b6bf1e5b053551da94897d3d1b5b5a152bb974` |
| `lyntty-cli-1.2.1-darwin-x64.tar.gz` | `af8361611e8dbdb3f51cb1833e8e9ef169f42a1550edd1e19a8265cf995647f0` |
| `lyntty-cli-1.2.1-linux-arm64.tar.gz` | `f17d4b0475208438800655d408a32ae4124626e922b2f5abcd1ab9fb22b44289` |
| `lyntty-cli-1.2.1-linux-x64.tar.gz` | `5d58d40361112a361c154d9522e329de7b5ffaf117a953be8327b7a0c1ab9c14` |
| `lyntty-cli-1.2.1-windows-x64.zip` | `7adeaacd645b79d57b68f4cdd98496ead9a83b57dea015c9ba5aaadb74c3c059` |
| `compatibility-bom.json` | `463deb2baf5687da4d2d1f75ee516b4f9aa14df2f6c7af4655c4dfcca9faaeff` |
| Relay OCI index | `sha256:e705f810310c0d098776f971f1673b88a93befdefd856c810b76b687d64cac3c` |

All `36` downloaded Release assets passed GitHub attestation verification against source `f9698f4930294ee38ff914dfa6d7d0705bebc485`.

## Independent verification

The post-publication audit used these checks:

```text
gh api repos/jczhang02/lyntty/releases/latest
gh api repos/jczhang02/lyntty/git/ref/tags/<release-tag>
gh api repos/jczhang02/lyntty/actions/runs/30243779634
gh run download 30243779634 --name compatibility-publication-audit-<release-tag>
gh release download <release-tag>
sha256sum -c release-checksums.txt
gh attestation verify <each-of-36-assets> --repo jczhang02/lyntty --source-digest f9698f49...

bun --no-install scripts/release.ts verify \
  --bom compatibility-bom.json --signature compatibility-bom.sig.json \
  --trust-store stable-release-trust-roots.json --channel stable
bun --no-install scripts/release.ts verify-history \
  --current compatibility-bom.json --predecessor <sequence-1-bom>
```

Results:

- the detached BOM signature selects Stable root `stable-2026-01` and verifies;
- sequence `2`, predecessor sequence `1`, source, component versions, Android identity, five-target CLI matrix, Relay repository, and Relay digest match;
- history verification reports `retainedBomCount=2` and `rollingUpgradeSafe=true`;
- the published `android-validation.json` is schema `2`, `authorizationMode=optional-not-performed`, `physicalPhoneAccepted=false`, and binds the exact APK SHA-256;
- a fresh `apk-audit.sh` run matches the published audit byte-for-byte, including package, version name, `versionCode`, and signer pin;
- every CLI archive's embedded artifact-manifest hash matches its sidecar and BOM; the downloaded Linux x64 artifact passes standalone `--self-check` with version `1.2.1`, daemon `1.2.1`, source commit, target, and Wire identity;
- the published installer passes its checksum, `bash -n`, and error-level ShellCheck;
- direct anonymous GHCR Registry API reads prove the Stable tag and digest reference return identical OCI index bytes; the index contains `linux/amd64`, `linux/arm64`, and their two BuildKit attestation descriptors;
- GitHub OCI attestation verification passes for `ghcr.io/jczhang02/lyntty-relay@sha256:e705...` and source `f9698f49...`;
- Relay runtime identity, schema doctor, retained runtime checks, multiarchitecture SBOM evidence, and the Promotion's cosign sign/verify step all passed.

The initial bulk local Release download encountered transient TLS EOFs. Partial files were removed or resumed with HTTP Range; final sizes, API digests, publication-audit digests, `release-checksums.txt`, and attestations all passed. The transport retries are not counted as artifact proof.

The evidence change itself passed `bun run test:repo-hardening --timeout 20000` (`85/85`), root and docs dependency audits with no vulnerabilities, evidence redaction, `git diff --check`, and the independent docs build (`42` pages, MDX generation, and TypeScript checks).

## Not run and residual risk

- No physical Android install, launch, or phone-to-Relay-to-`lynttyd` round trip was performed or claimed. This is the intentional optional-validation mode recorded by `android-validation.json`.
- Production Relay was not deployed. The latest `relay-deploy.yml` run predates this Release; publication only added the signed immutable GHCR image tag.
- Local cosign was unavailable, so the post-publication workstation did not repeat certificate verification. The protected Promotion step signed and then verified the exact Relay digest before publication, and the independent registry digest plus GitHub OCI attestation checks passed.
- Curated Release Notes were not applied; the immutable workflow-generated body remains authoritative.
