---
name: release-flow
description: Lyntty release runbook for candidate, promotion, GitHub Release, prerelease, rollback, and release-audit work across Stable, Preview, and Expo Dev channels. Use before any release-flavored task; pure Actions Artifact tasks are explicitly excluded.
---

# Lyntty Release Flow

Use this runbook to classify and control release work. Repository workflows and the source-of-truth release docs remain authoritative. This skill coordinates them and does not replace their gates.

## Scope and authority

Before acting, classify the request as one of these intents:

- read-only release audit;
- candidate build or validation;
- promotion or publication;
- curated Release Notes;
- rollback;
- pure Actions Artifact production or inspection.

Restate the exact channel or tag, the external operations that will be touched, and the channels that will not be touched. If the user already stated that scope explicitly, record it without asking again.

Loading this skill never authorizes an external side effect. Workflow dispatch, push, PR creation or merge, tag creation, Release creation or edit, publication, rollback, and reactions each require explicit current-task authorization. Read-only GitHub inspection is not publication authority.

Read the relevant runbook before changing state:

- Stable and Compatibility Preview: `docs/release/compatibility-bom.md` and `docs/release/android-apk.md`;
- APK-only Preview and Expo Dev: `docs/release/android-apk.md` plus the latest matching evidence under `docs/evidence/`;
- rollback: `docs/release/compatibility-bom.md` and `.github/workflows/release-rollback.yml`.

## Distribution channels

| Channel | GitHub identity | Publication behavior | Notes behavior |
| --- | --- | --- | --- |
| Stable Compatibility | `compat-v*` | Signed Compatibility BOM promotion, normal Release, GitHub Latest | Compact curated notes after preserving every mandatory disclosure |
| Compatibility Preview | `compat-preview-*` | Signed Preview BOM promotion, prerelease, never Latest | Compact curated notes after preserving every mandatory disclosure |
| APK-only Preview | `android-preview-v*` | Exact candidate promotion, prerelease, never Latest | Compact curated notes; preserve the physical-validation waiver when present |
| Expo Dev durable prerelease | `android-expo-dev-v*` | Exceptional manual promotion of already verified Expo Dev Artifact bytes, prerelease, never Latest | Compact curated notes with the Metro limitation first |
| Rollback | workflow-defined Compatibility tag | New higher Stable BOM sequence, no artifact rebuild | Operational rollback record, not marketing notes |

Stable Compatibility, Compatibility Preview, and APK-only Preview are different release paths. Never move assets, signers, packages, trust roots, tags, Relay images, Latest state, or self-update state between them.

### Actions Artifact is not a Release

A pure Actions Artifact has no GitHub Release page and does not receive curated Release Notes. In particular, the Android-only verification candidate and `.github/workflows/android-expo-dev.yml` produce short-lived Artifacts without publishing. Do not treat either run as a tag, prerelease, Compatibility Preview, or Stable publication.

If classification finds pure Actions Artifact work, stop applying this skill after recording the exclusion. Follow the relevant build or artifact runbook instead. Do not continue into Release preflight, publication, curated notes, or post-publication steps.

This Release flow applies to Expo Dev only when the user explicitly scopes a durable GitHub prerelease creation, edit, or audit. Expo Dev has no repository publication workflow: a durable prerelease is an exceptional operator-run promotion of already verified Artifact bytes, with its own explicit authorization, Draft review, invariant snapshot, post-publication audit, and durable evidence. The explicit `release-notes` skill can edit that existing prerelease but can never create it.

## Release sequence

1. **Fix the scope**: record intent, exact channel or tag, source commit, requested side effects, and explicit exclusions.
2. **Inspect live state**: read the current workflow, runbook, latest matching evidence, protected branch state, target Release if one exists, and current Stable Latest identity.
3. **Run the channel preflight**: use the exact checks and protected environment required by that channel. Do not substitute one channel's evidence for another.
4. **Build once**: candidate workflows produce the bytes. Promotion and rollback must not rebuild or silently replace them.
5. **Verify before publication**: bind source, hashes, manifests, provenance, attestations, signer or trust identities, release inventory, and required Android acceptance or waiver.
6. **Publish only with current authority**: use the repository workflow for channels that have one. For an explicitly authorized Expo Dev durable prerelease, use the exceptional manual promotion described above; never claim that its Artifact workflow publishes. Never infer permission from a successful candidate, a prior publication, or this skill.
7. **Apply curated notes separately**: only after the exact Release exists and only through the explicit `release-notes` skill.
8. **Audit after mutation**: re-read GitHub and compare every invariant. Record exact commands, artifacts, not-run reasons, and residual risk in the matching evidence when project policy requires it.

A failure at any gate stops the sequence. Do not weaken a check, swap a candidate, recreate a Release, or repair an immutable object through a different channel.

## Curated notes handoff

Curated notes belong to `.agents/skills/release-notes/SKILL.md`. The user must explicitly invoke:

`/skill:release-notes <version> <CodeName> <emoji> <channel-or-tag>`

Do not infer missing inputs. The notes skill edits an existing workflow-created or explicitly approved Release. It must never create a replacement Release.

When a workflow or release policy requires a public warning, waiver, or unsigned-platform statement, preserve that workflow-mandated disclosure verbatim as a leading prefix. The compact body does not add optional Warning, Download, Integrity, signer, waiver, or device-validation sections of its own.

## Existing Release title or body edits

Treat a metadata-only correction as a narrowly bounded publication:

1. Resolve one exact existing Release and snapshot its release ID, tag, tag ref, assets, target, draft, prerelease, immutable, and Latest state.
2. Store each asset's ID, name, size, and digest in the before snapshot.
3. Render the complete proposed title and body. Obtain approval for that exact draft unless the user's current request already approves it with every required notes input.
4. With explicit current-task authorization, run only `gh release edit <tag> --title ... --notes-file ...`.
5. Never run `gh release create`, move or recreate the tag, upload or delete an asset, change target, toggle draft or prerelease, or alter Latest state to repair notes.
6. Re-read the Release, tag ref, Latest endpoint, and asset inventory. Require exact equality for release ID, tag, target, draft, prerelease, immutable, Latest identity, and every asset tuple.

If the Release does not exist, stop. Missing notes are not permission to create one.

## Mandatory public disclosures

The compact format removes optional safety and integrity sections, not release-policy requirements:

- Stable owner-waiver releases keep the exact leading bilingual physical-Android disclosure generated by the Stable promotion path.
- APK-only Preview waiver releases keep the exact leading bilingual physical-Android disclosure generated by Preview promotion.
- Stable macOS and Windows archives keep the required public platform-unsigned disclosure from `docs/release/compatibility-bom.md`.
- Expo Dev has no extra safety disclosure in curated notes. Its first English and Chinese changelog item must state that Metro on port `8081` is required and the APK cannot run standalone.

Do not paraphrase a mandatory workflow disclosure in a way that changes its meaning. Internal validation, audit, provenance, and evidence requirements remain unchanged even when they are absent from the curated body.

## Rollback notes

Rollback releases must not use a CodeName, emoji, or marketing Changelog. Do not invoke `release-notes` for rollback.

Use an operational bilingual record that states:

- the new higher BOM sequence and exact rollback tag;
- the selected retained predecessor and reason for rollback;
- that Android remains on the current App because `versionCode` cannot downgrade;
- the exact CLI and Relay artifacts selected;
- verification performed, required approvals, and residual operational risk.

Preserve workflow-generated notes and mandatory disclosures. A rollback reselects retained immutable artifacts; it never rebuilds them or rewrites an older Stable Release.

## Audit-only requests

A release audit is read-only unless the user separately authorizes a mutation. Compare the live Release, tag, assets, attestations, channel state, and Latest identity with source and durable evidence. Report drift before proposing a repair, and do not turn an audit request into publication authority.
