# R127 — Stable 1.2.1 curated Release Notes

Date: 2026-07-27

Status: live and independently verified

Release: [`compat-v1.2.1_1.2.1_1.2.1_0.2.0-s2`](https://github.com/jczhang02/lyntty/releases/tag/compat-v1.2.1_1.2.1_1.2.1_0.2.0-s2)

## Claim

The existing immutable Stable 1.2.1 Release now uses the compact bilingual Lyntty format and inferred title `V1.2.1 Progressive Sessions ⚡`. The only user-controlled Release fields changed were title and body; GitHub advanced `updated_at` for that metadata edit. Release ID, tag, direct tag commit, target, draft/prerelease/immutable state, the current Stable s3 Latest identity, and all 36 s2 asset tuples remained exact.

## Policy and target

The proactive Release Notes policy was merged through PR [#68](https://github.com/jczhang02/lyntty/pull/68) as verified `main@5b20b0b93bac95b8d74f59205aa78ef6ba5f0349`. Current protected `main` at edit time was `73f15ff00f4e1c3368640d7cbf5c2f9e1f3d8f86`.

One exact existing target was resolved:

| Field | Value |
| --- | --- |
| Release ID | `360246346` |
| Tag | `compat-v1.2.1_1.2.1_1.2.1_0.2.0-s2` |
| Source and direct tag commit | `f9698f4930294ee38ff914dfa6d7d0705bebc485` |
| Version | `1.2.1` |
| CodeName | `Progressive Sessions` |
| Emoji | `⚡` |

`Progressive Sessions` comes from the dominant verified user-visible source change: Sessions Home publishes Relay and newest local Pi rows before full local JSONL indexing finishes, while `lynttyd` persists and incrementally refreshes its private index. `⚡` follows the skill's speed/performance mapping and is supported by controlled retrieval measurements. The title describes the loading model without adding an unverified performance guarantee.

## Draft and review

The existing mandatory platform-unsigned line was preserved verbatim and moved to the required first public line:

```text
macOS and Windows CLI archives: intentionally not platform code-signed for this owner-operated self-use release.
```

The centered logo is pinned to source `f9698f49...c485`. Four English and four Chinese items describe the same behavior in the same order:

1. progressive Sessions Home publication;
2. generation-safe refresh and device-local deletion consistency;
3. legacy Relay upgrade migration and clearer preflight diagnostics;
4. `/remote` as the sole newly generated Pi control command, including the existing-process reload limitation.

Mechanical checks passed for title shape, the single title emoji, zero body emoji, mandatory disclosure, source-pinned logo, `Lyntty` h1, section order, bilingual item parity, and formatting exclusions. Independent source review against R95-R103, R113, R115, and R118-R120 returned `VERIFIED_NO_P0_P1_P2` without a draft correction.

## Mutation

Candidate run `30241194899` and Promotion run `30243779634` were successful against exact source `f9698f49...c485`; no Candidate or Promotion retry was active.

The first immediate preflight stopped before mutation when the GitHub Latest API hit a TLS handshake timeout. A bounded immediate re-read then fetched Release, tag, and Latest state successfully, matched the approved baseline and draft hashes, and only then allowed the edit.

The sole mutation was:

```text
gh release edit <exact-tag> --repo jczhang02/lyntty --title <exact-title> --notes-file <approved-draft>
```

No create/delete, tag, asset, state, Latest, or reaction operation was used. Replacing workflow-generated metadata intentionally removes compatibility with publication audit/retry paths that require the original title/body. No such retry is pending or authorized.

## Before and after

| Field | Before | After |
| --- | --- | --- |
| Title | workflow-generated Stable title | `V1.2.1 Progressive Sessions ⚡` |
| Body bytes | `575` | `2429` |
| Body SHA-256 | `003100...bc3a9` | `c5ff94...e839d` |
| GitHub `updated_at` | `2026-07-27T06:51:15Z` | `2026-07-27T15:07:07Z` |
| Release ID | `360246346` | `360246346` |
| Target/tag commit | `f9698f49...c485` | `f9698f49...c485` |
| Draft / prerelease / immutable | `false / false / true` | `false / false / true` |
| Current Latest | s3 Release `360359261` | s3 Release `360359261` |
| s2 asset count | `36` | `36` |
| s2 asset tuple SHA-256 | `e1a6cc...fa6b2` | `e1a6cc...fa6b2` |

The tuple hash covers compact JSON for sorted `{id,name,size,digest}` entries plus one LF. `download_count` is excluded because reads can change it and it is not asset identity.

Fresh API and `gh release view` reads returned the approved title/body byte-for-byte and unchanged invariants. A separate read-only verifier repeated Release, current Latest, direct tag, asset metadata, and body-format checks and returned `VERIFIED_NO_P0_P1_P2`: body `2429` bytes, SHA-256 `c5ff94...e839d`, and 36 assets.

Machine-readable evidence: [`artifacts/r127/release-notes-edit.json`](./artifacts/r127/release-notes-edit.json).

## Evidence verification

```text
bun run test:repo-hardening
85 pass, 0 fail

cd docs/.site && bun run docs:check
42 pages prepared; MDX generation and TypeScript checks passed

R127 JSON parse, local links, bilingual heading parity, staged evidence redaction,
git diff --cached --check, and git diff --check
PASS
```

A final independent evidence review returned `VERIFIED_NO_P0_P1_P2`.

## Not run and residual risk

- Assets were not downloaded again because this title/body-only command cannot replace immutable asset bytes; all API-bound ID/name/size/digest tuples were compared before and after.
- The GitHub-rendered browser page was not visually tested; exact Markdown was compared through the API and `gh release view`.
- No additional Candidate, Promotion, deployment, rollback, package build, Release create/delete, tag mutation, asset mutation, Latest mutation, or reaction was run for this metadata edit.
- Physical Android acceptance remains not performed and is not claimed.
- A historical publication retry that requires the workflow-generated title/body will now fail closed. Candidate and Promotion are complete and no retry is authorized.
