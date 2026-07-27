# R126 — Stable 1.2.2 curated Release Notes

Date: 2026-07-27

Status: live and independently verified

Release: [`compat-v1.2.2_1.2.2_1.2.2_0.2.0-s3`](https://github.com/jczhang02/lyntty/releases/tag/compat-v1.2.2_1.2.2_1.2.2_0.2.0-s3)

## Claim

The existing immutable Stable 1.2.2 Release now uses the compact bilingual Lyntty format and the inferred title `V1.2.2 Session Continuity 🧭`. The only user-controlled Release fields changed were title and body; GitHub advanced `updated_at` for that metadata edit. Release ID, tag, direct tag commit, target, draft/prerelease/immutable state, Latest identity, and all 36 asset tuples remained exact.

## Policy prerequisite

PR [#68](https://github.com/jczhang02/lyntty/pull/68) merged the proactive Release Notes policy as GitHub-verified `main@5b20b0b93bac95b8d74f59205aa78ef6ba5f0349`. All 15 final check contexts passed. The first macOS isolated-lifecycle attempt timed out in unchanged development lifecycle tests; the failed-only rerun passed, and no gate was bypassed.

The policy merge made `release-notes` proactively invocable while retaining exact-target, exact-draft, and explicit public-edit authority. It also kept Rollback and `native-signing-*` excluded and preserved mandatory disclosure and immutable Release boundaries.

## Target and inference

One exact existing target was resolved:

| Field | Value |
| --- | --- |
| Release ID | `360359261` |
| Tag | `compat-v1.2.2_1.2.2_1.2.2_0.2.0-s3` |
| Source and direct tag commit | `f2b22a4da144627aef485e984de9aa2324bbc08c` |
| Version | `1.2.2` |
| CodeName | `Session Continuity` |
| Emoji | `🧭` |

`Session Continuity` comes from the dominant verified user-visible theme in the Stable 1.2.2 source: canonical Pi history, progressive older-history loading, session-name preservation, restart-safe forward sync, and restored local session discovery. `🧭` follows the skill's history/sync/reliability/control mapping. The title stays descriptive and does not add a performance, security, completeness, or platform-support guarantee.

## Draft and review

The public body preserves the exact existing mandatory first line:

```text
macOS and Windows CLI archives: intentionally not platform code-signed for this owner-operated self-use release.
```

The centered logo is pinned to source `f2b22a4...bc08c`. Four English items and four Chinese items cover the same behavior in the same order: continuous long-session history, canonical session names, non-blocking Pi history retries, and service-side local Pi discovery. The body has no emoji, em dash, optional Download/Integrity section, inline PR reference, or unverified contributor.

Mechanical checks passed for the title, single title emoji, disclosure prefix, source-pinned logo, `Lyntty` h1, section order, bilingual item parity, and formatting exclusions. Independent source review found one initial P1: the third item incorrectly described Pi-history outbox recovery as phone-input delivery. The item was corrected to Relay-response-loss history retry semantics; final draft review returned `VERIFIED_NO_P0_P1_P2`.

## Mutation

Immediately before editing, fresh API snapshots matched the approved baseline. Candidate run `30256019450` and Promotion run `30259067520` were successful against exact source `f2b22a4...bc08c`, and no Candidate or Promotion retry was active.

The only Release mutation was:

```text
gh release edit <exact-tag> --repo jczhang02/lyntty --title <exact-title> --notes-file <approved-draft>
```

No create/delete command, tag operation, asset operation, channel/state flag, Latest flag, or reaction was used. Replacing the workflow-generated metadata intentionally removes compatibility with publication audit/retry paths that require the original title/body. No such retry is pending or authorized.

## Before and after

| Field | Before | After |
| --- | --- | --- |
| Title | workflow-generated Stable title | `V1.2.2 Session Continuity 🧭` |
| Body bytes | `575` | `2300` |
| Body SHA-256 | `4b47b0...86b0f` | `9dd29e...de237` |
| GitHub `updated_at` | `2026-07-27T10:47:50Z` | `2026-07-27T14:30:14Z` |
| Release ID | `360359261` | `360359261` |
| Target/tag commit | `f2b22a4...bc08c` | `f2b22a4...bc08c` |
| Draft / prerelease / immutable | `false / false / true` | `false / false / true` |
| Latest Release ID | `360359261` | `360359261` |
| Asset count | `36` | `36` |
| Asset tuple SHA-256 | `df6325...36a3` | `df6325...36a3` |

The asset tuple hash covers sorted `{id,name,size,digest}` values. `download_count` is intentionally excluded because reads can change it and it is not asset identity.

Fresh `gh api` and `gh release view` reads returned the exact approved title/body and unchanged invariants. A separate read-only verifier repeated the live Release, Latest, tag-ref, asset, body-format, and body-hash checks and returned `VERIFIED_NO_P0_P1_P2` with body SHA-256 `9dd29e...de237` and 36 assets.

Machine-readable evidence: [`artifacts/r126/release-notes-edit.json`](./artifacts/r126/release-notes-edit.json).

## Evidence verification

```text
bun run test:repo-hardening
85 pass, 0 fail

cd docs/.site && bun run docs:check
42 pages prepared; MDX generation and TypeScript checks passed

R126 JSON parse, local links, bilingual heading parity, staged evidence redaction,
git diff --cached --check, and git diff --check
PASS
```

A final independent evidence review returned `VERIFIED_NO_P0_P1_P2`.

## Not run and residual risk

- Assets were not downloaded again because a title/body-only edit cannot replace immutable asset bytes; every API-bound ID/name/size/digest tuple was compared before and after.
- The GitHub-rendered browser page was not visually tested; exact Markdown was compared byte-for-byte through both API and `gh release view`.
- No additional Candidate, Promotion, deployment, rollback, package build, Release creation/deletion, tag mutation, asset mutation, or reaction was run for this metadata edit.
- Physical Android acceptance remains not performed and is not claimed by the curated notes.
- A historical publication retry that requires the workflow-generated title/body will now fail closed. Candidate and Promotion are complete and no retry is authorized.
