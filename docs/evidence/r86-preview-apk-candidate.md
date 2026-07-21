# R86 — Android Preview APK replacement candidate

Date: 2026-07-21

Status: Replacement Candidate bytes are independently verified. Exact physical Android testing was not run; the owner explicitly authorized truthful unverified publication. The protected evidence/waiver PR and public Promotion remain pending.

## Candidate identity

```text
Candidate run: 29786815855
Candidate URL: https://github.com/jczhang02/lyntty/actions/runs/29786815855
Artifact: android-preview-candidate-29786815855
Artifact ID: 8479510751
Artifact archive digest: sha256:f6360f9b32a1cc2f1b4d19ac9d1cc464a3d637d7282fa2d93bebe32b3bbafbcf
Artifact expires: 2026-08-19T23:59:44Z
APK: lyntty-preview-v1.2.0-920001.apk
APK size: 126797859 bytes
APK SHA-256: 7139219f0051ab0ad705932f15175ea1e5d8903f91e0491b19f800aa97d4038b
Source commit: ef0853524fb78ecf31697103ff5597a0b20b1ed6
Source tree: 52adba99fc9da895efd00a933e130930cc05af11
applicationId: dev.jczhang.lyntty.preview
versionName: 1.2.0
versionCode: 920001
ABIs: arm64-v8a, x86_64
Signer SHA-256: ebd23c222b690e2be635fe3e52bd70b6fb86c5570ab279bc4e8c1f22ed90ef9c
```

## Why this Candidate replaces the prior bytes

Candidate run `29762476280` was valid for source `33d7a99c57cce0783d069e95ba6d4abc59a53c1d`, but GitHub then published high-severity GHSA-395f-4hp3-45gv. Protected PR #20 upgraded the audited dependency graph to `shell-quote@1.9.0`; root `package.json` and `bun.lock` are Android build inputs, so the old APK could no longer be promoted from current protected `main`.

Protected PR #21 revoked only the old `920001` allowlist entry while retaining its historical evidence and the `910003` upgrade fixture. The target tag and Release never existed. The unchanged Candidate workflow then built this replacement at the same unreleased `versionCode` from protected `main`; it did not add a general same-version replacement bypass.

## Candidate verification

Run `29786815855` completed one job with all 17 steps successful: protected-source validation, frozen install, unreviewed-config rejection, Bun-only audited dual-ABI build, APK staging/audit, APK attestation, manifest attestation, and artifact upload. It created no tag, draft, or Release.

The downloaded artifact contains exactly the APK, SHA-256 sidecar, APK audit, runtime audit, provenance, release notes, release title, and Candidate manifest. Independent verification confirmed:

- the archive is the sole non-expired run artifact and is bound to protected source `ef0853524fb78ecf31697103ff5597a0b20b1ed6`;
- the manifest binds seven release inputs by exact name, size, and SHA-256, and every file rehash passes;
- the APK sidecar, manifest, and provenance bind SHA-256 `7139219f0051ab0ad705932f15175ea1e5d8903f91e0491b19f800aa97d4038b` and size `126797859`;
- provenance binds run/source/tree, package, version, signer, ABIs, tag, title, APK hash, and size with exact schema keys;
- the embedded App source commit is `ef0853524fb78ecf31697103ff5597a0b20b1ed6`;
- a fresh real APK audit reproduces the Candidate audit byte-for-byte: one signer, v2 signature, non-debuggable package, standalone bundle, and exactly `arm64-v8a,x86_64`;
- the runtime audit reports zero Node-family `execve` matches and zero sentinel invocations;
- strict GitHub attestation verification returns exactly one APK attestation and one manifest attestation, both bound to the Candidate workflow, protected `main`, and signer/source digest `ef0853524fb78ecf31697103ff5597a0b20b1ed6`;
- release title and resolved notes match the reviewed template exactly and contain no placeholders;
- the target tag `android-preview-v1.2.0-920001` and GitHub Release remain absent.

The five tracked sidecars match the replacement artifact byte-for-byte. Four sidecars change from the superseded Candidate; the runtime audit is intentionally unchanged because both audited builds contain the same three zero-execution statements. The APK itself is not committed. `scripts/preview-apk-allowlist.json` adds one unique binding for the replacement source/hash while retaining only the `910003` fixture beside it.

## Replacement review verification

The protected review change was verified without creating a tag, draft, or Release:

- `bun install --frozen-lockfile` completed without lockfile changes;
- the eight-file artifact inventory, seven manifest-bound inputs, five tracked sidecars, unique two-row allowlist, exact source tree, APK SHA/size, resolved title/notes, and two strict GitHub attestations were revalidated;
- both serialized Promotion delta blocks are identical and exactly match the 11 modified paths from replacement source `ef0853524fb78ecf31697103ff5597a0b20b1ed6`;
- the Promotion YAML parses, and all three shell blocks pass `bash -n` plus error-level ShellCheck;
- hardening/redaction passes 24 tests, including executable authorization XOR, byte-exact physical/waiver body generation, exact-Draft publication recovery, and reviewed-target-only retargeting; the waiver body SHA-256 is `9cdc3d6fade06530de3440cfe3e6df1f4f35ae9ae7a86dda2b312b899094f08a`;
- `bun run ci:fast` passes: hardening/redaction 24, Wire 33/76, CLI 585/1272, Relay 119/332, App 812/3276 across 90 files plus the real Preview bundle smoke, and lifecycle 35/194;
- `git diff --check` passes.

## Physical Android acceptance was not run

The unexecuted physical-device matrix remains:

1. update installed `1.1.0` / `910003` to `1.2.0` / `920001` and verify the existing valid Relay setting is retained;
2. clear App data or install fresh and verify authentication/sync cannot begin before Relay setup;
3. reject an invalid Relay, accept the local `/health` contract, and allow Android Back to exit mandatory setup;
4. pair the node, open managed Pi, complete a distinct phone message/reply round trip, and verify continuity after reopening;
5. clear Relay and verify the App returns to setup without reusing the prior identity.

This matrix was **not executed for APK SHA-256 `7139219f0051ab0ad705932f15175ea1e5d8903f91e0491b19f800aa97d4038b`**. Earlier `910003` physical testing, CI, static checks, APK/runtime audits, attestations, and isolated Relay preflight do not substitute for testing these exact bytes.

The owner explicitly authorized direct Release despite this residual risk. Promotion must therefore keep `physical_phone_accepted=false` and require the exact phrase `I accept publishing this exact Candidate without physical Android validation`. It must prepend a deterministic bilingual warning to the immutable public body, record actor/mode/source/APK hash in the Actions workflow summary and run audit trail, and never describe this release as physically accepted.

## Draft Promotion recovery

Promotion run `29792580712` revalidated the replacement Candidate and created the exact private Draft, then stopped before publication when the separate `POST /git/refs` tag creation returned HTTP 404. The failure left no tag and no public Release. Read-only recovery verification confirms Draft `357064582` still has the exact title, target commit, 3334-byte waiver body, and five Candidate assets; every downloaded asset matches the escrowed Candidate byte-for-byte.

The protected recovery hard-binds Release ID `357064582` plus its five existing GitHub asset IDs and never calls Release create, asset upload, Release delete, or a separate ref-creation endpoint. Asset inventory, state, size, server digest, downloaded bytes, and Candidate bytes are all checked through this exact Release ID rather than a pending tag lookup. Because merging the recovery PR advances protected `main`, the private Draft target may be only the reviewed prior main `47351659bd8e6862abde1521854a8965919c4691` or the workflow's final protected `GITHUB_SHA`; any other target fails closed. Immediately before the only mutating request, the workflow revalidates the exact Draft metadata, asset IDs/digests, body, protected-main freshness, and tag state. One full Release-ID publication payload pins tag, final target, title, exact body, draft/prerelease state, and non-Latest status, so retargeting and publication occur in the same request. The Release API creates the tag from that target. An unpublished Draft requires the tag to be absent with an explicit HTTP 404; only an already-published immutable retry may accept an existing tag, which must point directly to the final commit. Any other tag lookup result stops publication. Executable regression tests prove reviewed-target-only authorization, exact/wrong/existing tag handling, already-published retry, 404 publication without a ref POST, and HTTP 500 refusal. The existing Draft and assets are not deleted, recreated, or re-uploaded.

A read-only recovery check downloaded asset IDs `484098553`, `484098498`, `484098319`, `484098422`, and `484098446` through the Release asset API and byte-compared each with the escrowed Candidate; all five matched, including APK SHA-256 `7139219f0051ab0ad705932f15175ea1e5d8903f91e0491b19f800aa97d4038b`.

GitHub does not support conditional requests for unsafe Release `PATCH` operations. This workflow therefore treats authorized repository writers as trusted release actors, restricts dispatch to owner `jczhang02`, serializes all Preview Promotion runs, and minimizes the final check-to-publish interval with a full-field request. A deliberate concurrent mutation by an administrator remains outside the workflow threat boundary; absent such a trusted-actor race, every observed mismatch fails closed.

## Publication boundary

This protected review PR does not itself publish. Promotion may publish only the exact five replacement Candidate assets under tag `android-preview-v1.2.0-920001` and title `V1.2.0 Local First 📡`, after revalidating protected `main`, the exact source-to-final delta, unique allowlist entry, sidecars, provenance, both attestations, immutable tag rules, release body, and pre/post-publication asset bytes.

No Stable APK, CLI archive, Relay image, Compatibility BOM, hosted Preview Relay, Google Play artifact, OTA update, or production deployment is authorized.
