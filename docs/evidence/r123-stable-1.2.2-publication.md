# R123 — Stable Compatibility 1.2.2 publication

Date: 2026-07-27

Branch: `docs/r123-stable-1.2.2-publication`

Bead: `lyntty-90z`

Release: [`compat-v1.2.2_1.2.2_1.2.2_0.2.0-s3`](https://github.com/jczhang02/lyntty/releases/tag/compat-v1.2.2_1.2.2_1.2.2_0.2.0-s3)

## Published identity

| Field | Value |
| --- | --- |
| Release ID | `360359261` |
| Source | `f2b22a4da144627aef485e984de9aa2324bbc08c` |
| App | `1.2.2` |
| CLI + `lynttyd` | `1.2.2` |
| Relay | `1.2.2` |
| Wire | `0.2.0` |
| Sequence | `3` |
| Android package | `dev.jczhang.lyntty` |
| Android `versionCode` | `8` |
| Candidate run | [`30256019450`](https://github.com/jczhang02/lyntty/actions/runs/30256019450) |
| Promotion run | [`30259067520`](https://github.com/jczhang02/lyntty/actions/runs/30259067520) |
| Published | `2026-07-27T10:47:50Z` |

GitHub reports the Release as non-draft, non-prerelease, immutable, and Latest. Its lightweight direct tag resolves to the exact verified protected-`main` source above. Stable tag ruleset `19382133` remains active with update and deletion protection and no bypass actor.

The workflow-generated Release body records sequence `3`, source, Candidate run, and the exact Relay digest. It retains the required macOS/Windows platform-signing disclosure and makes no physical-Android acceptance claim. The immutable `android-validation.json` is schema `2`, `authorizationMode: "optional-not-performed"`, `physicalPhoneAccepted: false`, and binds the exact APK digest.

## Candidate and Promotion

Candidate run `30256019450` completed every build and verification step from exact protected `main`. It produced one unexpired Candidate artifact:

```text
Artifact ID: 8649925744
Artifact size: 1,519,708,697 bytes
Artifact digest: sha256:33ad1c673b052c8196a2fc61b5720a7b5cc6febe27fbc3d0ceed13e1c566cbe8
Downloaded Candidate tar size: 1,522,025,574 bytes
Downloaded Candidate tar SHA-256: 96b0597872ff5c01d05fe8db446a8e186771c3e07ffd075b9b0a69aa3ae0072b
```

The Candidate built the production APK, five standalone CLI targets, and one dual-platform Relay OCI layout. It executed the retained 1.2.1 and 1.2.0 CLI/Relay combinations against the current schema, assembled the three-BOM rolling matrix, generated SPDX/provenance, signed the canonical BOM with Stable root `stable-2026-01`, attested the Candidate, and published no product artifact.

Promotion run `30259067520` completed every step. It re-downloaded the exact Candidate by run ID, verified attestation/checksums/BOM/history/source/matrix, revalidated the current channel head, promoted the existing Relay OCI bytes by digest, signed and attested the image, attested all Release files, published one exact Release-ID transaction, preserved its audit, and verified Stable Latest isolation.

## Immutable artifacts

The Release contains exactly `36` assets totaling `533,311,347` bytes. The preserved publication-audit artifact is:

```text
Artifact ID: 8650265740
Digest: sha256:f58842af870b5ce4cd7a93c641fddf5b6806a9ac419f70c420c8c6b5a21e02b2
Release body SHA-256: 4b47b03ede38f3efda424a4a8122ea259ec0e0d0af23ba0d79d4451bbcd86b0f
Sorted publication-audit asset-tuple SHA-256: ce20f6017df6b5ae5fadec544148ffe36a63db67163905c522118b2e14d154ac
Publication occurred: true
```

The audit's Release ID, tag, target, body hash, and every asset ID/name/size/SHA-256 match fresh GitHub API metadata and independently downloaded bytes. `release-checksums.txt` verifies all other `35` assets. The Latest download of `compatibility-bom.json` is byte-identical to the tagged asset.

Key published digests:

| Artifact | SHA-256 |
| --- | --- |
| `lyntty-stable.apk` | `5ccb6336e31aa3b484b9df7fd02f6046eede656195e7528f64b2e645f7b3caae` |
| `lyntty-cli-1.2.2-darwin-arm64.tar.gz` | `85278b4ca783f0cacb182a8940a098228d6c58f4ce71c3382c5c66793c1bb9c1` |
| `lyntty-cli-1.2.2-darwin-x64.tar.gz` | `b4cd9f5865cbfe8f6a74cd581ae1c363b4128dc85e19c8a7897f70d83e3b50b3` |
| `lyntty-cli-1.2.2-linux-arm64.tar.gz` | `72642d8ecccd7fb6ec6ece86973ab8bb9705ad6d6804425c274e6910f9d1fbf1` |
| `lyntty-cli-1.2.2-linux-x64.tar.gz` | `1722b8dcc0a0c3f0ec3ee48b73e717541b671db8659f858883d37425855a1ca5` |
| `lyntty-cli-1.2.2-windows-x64.zip` | `dc8a5237c69f602d40e0bb335f6c87cbb1a2d33763544fc598bde587d815f8de` |
| `compatibility-bom.json` | `9453da079bd9b5b181281c87f1780acfc499fd1f933d5120daba2b06f6e88b2b` |
| Relay OCI index | `sha256:65d7823d1938f36867c2a798c7cb37a20b1e60cb9d93cb5bb4c40c100d546447` |

All `36` downloaded Release assets passed GitHub attestation verification against source `f2b22a4da144627aef485e984de9aa2324bbc08c`.

## Independent verification

Post-publication checks included:

```text
gh api releases/latest, release-by-tag, direct tag ref, Promotion/Candidate runs
gh run download Candidate and publication audit
gh release download exact s3 Release
sha256sum -c release-checksums.txt
gh attestation verify each of 36 Release assets and the Relay OCI digest
scripts/release.ts verify + verify-history against freshly downloaded s2/s1 BOMs
fresh apk-audit.sh comparison against the published audit
standalone Linux x64 CLI --self-check under Bun/Node/npm/pnpm/npx/tsx sentinels
anonymous GHCR tag/digest OCI index byte comparison
```

Results:

- the detached BOM signature verifies against the exact published/committed Stable trust store;
- sequence `3`, source, component versions, Android identity, and predecessors `2,1` match; history reports `retainedBomCount=3` and `rollingUpgradeSafe=true`;
- the production APK is non-debuggable, v2-signed by the permanent certificate, embeds a standalone bundle, and targets only `arm64-v8a`;
- the downloaded Linux x64 CLI reports App-independent CLI/daemon version `1.2.2`, source, target, Wire identity, and all `178` checked files;
- the installer checksum and Bash syntax pass;
- GHCR tag and digest references return byte-identical OCI index content with SHA-256 `65d782...6447` and runtime platforms `linux/amd64` plus `linux/arm64`;
- GitHub OCI attestation verifies for the exact Relay digest and source; protected Promotion also completed cosign sign/verify;
- Stable s2/s1, APK-only Preview, and Expo Dev Releases remain immutable and unchanged; only s3 is GitHub Latest.

A separate verifier repeated fresh Release, tag, asset, BOM/history, registry, attestation, validation-mode, ruleset, and cross-channel checks and returned `VERIFIED_NO_P0_P1_P2`.

The evidence change passed the root frozen install, lifecycle trust check, dependency audit, repository hardening (`85/85`), evidence redaction, and `git diff --check`. Its independent docs frozen install/audit/check passed with no vulnerabilities, `42` prepared pages, MDX generation, and TypeScript validation.

## Distribution and deployment boundary

A fresh public `https://relay.jczhang.cc/v1/version` request already projects Stable v1.2.2 from the signed Latest BOM, including versionCode `8`, the exact APK URL/hash, release ID, sequence, and BOM hash. This update-feed behavior does not mean the production Relay container or local daemon has been upgraded.

Production Relay deployment, local `lyntty`/`lynttyd` update, daemon restart, and repair of session `019f8c6a-ab60-7ef6-8154-56d9f05751bd` remain separate authorized operations after publication.

## Not run and residual risk

- No physical Android install, launch, upgrade, or phone-to-Relay-to-`lynttyd` round trip was performed or claimed. This is the intentional optional-validation state bound by `android-validation.json`.
- Production Relay was not deployed by Candidate or Promotion. The latest `relay-deploy.yml` run still predates Stable 1.2.1 and 1.2.2.
- Local cosign was unavailable. The protected Promotion signed and verified the exact Relay digest, while the workstation independently verified GHCR index bytes and GitHub OCI attestation.
- Curated Release Notes were not applied; the immutable workflow-generated body remains authoritative.
