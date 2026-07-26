---
name: release-flow
description: Lyntty release runbook for candidate, promotion, native-signing operational staging, GitHub Release creation, edit, deletion, prerelease, rollback, and release-audit work across Stable, Preview, existing Expo Dev, and retained historical Releases. Use before any release-flavored task; pure Actions Artifact tasks are explicitly excluded.
---

# Lyntty Release Flow

Use this runbook to classify and control release work. Repository workflows and the source-of-truth release docs remain authoritative. This skill coordinates them and does not replace their gates.

## Scope and authority

Before acting, classify the request as one of these intents:

- read-only release audit;
- candidate build or validation;
- promotion or publication;
- native-signing operational staging or verification;
- curated Release Notes or another existing-Release metadata edit;
- exact historical Release deletion or cleanup;
- rollback;
- pure Actions Artifact production or inspection.

Restate the exact channel or tag, the external operations that will be touched, and the channels that will not be touched. If the user already stated that scope explicitly, record it without asking again.

Loading this skill never authorizes an external side effect. Workflow dispatch, push, PR creation or merge, tag creation or deletion, Release creation, edit, deletion or publication, rollback, and reactions each require explicit current-task authorization for the exact object and operation. Authority to delete a Release never implies authority to delete its Git tag. Read-only GitHub inspection is not mutation authority.

Read the relevant runbook before changing state:

- Stable and Compatibility Preview: `docs/release/compatibility-bom.md` and `docs/release/android-apk.md`;
- APK-only Preview and existing Expo Dev: `docs/release/android-apk.md` plus the latest matching evidence under `docs/evidence/`;
- native-signing operational staging: `docs/release/native-signing.md` and the two native-signing workflows;
- rollback: `docs/release/compatibility-bom.md` and `.github/workflows/release-rollback.yml`.

## Distribution channels

| Channel | GitHub identity | Publication behavior | Notes behavior |
| --- | --- | --- | --- |
| Stable Compatibility | `compat-v*` | Signed Compatibility BOM promotion, normal Release, GitHub Latest | Compact curated notes after preserving every mandatory disclosure |
| Compatibility Preview | `compat-preview-*` | Signed Preview BOM promotion, prerelease, never Latest | Compact curated notes after preserving every mandatory disclosure |
| APK-only Preview | `android-preview-v*` | Exact candidate promotion, prerelease, never Latest | Compact curated notes; preserve the physical-validation waiver when present |
| Existing Expo Dev prerelease | `android-expo-dev-v*` | One previously authorized manual promotion; current policy has no repeatable publication path, so future creation fails closed | Existing Release may receive compact curated notes with the Metro limitation first |
| Native-signing operational staging | `native-signing-*` | Workflow-produced immutable prerelease inputs for independent verification, never a product channel or Latest | Preserve the workflow-generated operational body; curated product notes are forbidden |
| Rollback | workflow-defined Compatibility tag | New higher Stable BOM sequence, no artifact rebuild | Operational rollback record, not marketing notes |

Stable Compatibility, Compatibility Preview, and APK-only Preview are different release paths. Never move assets, signers, packages, trust roots, tags, Relay images, Latest state, or self-update state between them. Native-signing staging is an operational trust input, not another product channel.

### Actions Artifact is not a Release

A pure Actions Artifact has no GitHub Release page and does not receive curated Release Notes. In particular, the Android-only verification candidate and `.github/workflows/android-expo-dev.yml` produce short-lived Artifacts without publishing. Do not treat either run as a tag, prerelease, Compatibility Preview, or Stable publication.

If classification finds pure Actions Artifact work, stop applying this skill after recording the exclusion. Follow the relevant build or artifact runbook instead. Do not continue into Release preflight, publication, curated notes, or post-publication steps.

This Release flow applies to Expo Dev only when the user explicitly scopes an existing prerelease edit, deletion, cleanup, or audit. Expo Dev has no repository publication workflow, and its runbook defines only the normal 14-day Artifact path. The one existing durable prerelease remains auditable, editable, and deletable under the protections here, but future Expo Dev Release creation must fail closed until a protected policy change adds a complete repeatable publication runbook or workflow. Historical evidence of the prior one-time promotion is not reusable publication authority. The explicit `release-notes` skill can edit an existing Expo Dev prerelease but can never create it.

## Release sequence

1. **Fix the scope**: record intent, exact channel or tag, source commit, requested side effects, and explicit exclusions. For deletion, distinguish the Release object and attached assets from its direct Git tag.
2. **Inspect live state**: read the current workflow, runbook, latest matching evidence, protected branch state, target Release if one exists, and current Stable Latest identity.
3. **Run the channel preflight**: use the exact checks and protected environment required by that channel. Do not substitute one channel's evidence for another.
4. **Build once**: candidate workflows produce the bytes. Promotion and rollback must not rebuild or silently replace them.
5. **Verify before publication**: bind source, hashes, manifests, provenance, attestations, signer or trust identities, release inventory, and any claimed Android acceptance to the exact APK.
6. **Publish only with current authority**: use the repository workflow for channels that have one. Expo Dev Release creation has no current publication path and must stop; its Artifact workflow never publishes. Never infer permission from a successful candidate, a prior one-time publication, or this skill.
7. **Apply curated notes separately**: only after the exact Release exists, the originating publication workflow or transaction completed successfully, and no publication retry or Draft-resume path remains pending. Use only the explicit `release-notes` skill. Record that replacing workflow-generated title/body removes compatibility with metadata-bound publication audit/retry paths that require the original body, including `scripts/github-release.ts` and APK Preview's `.github/workflows/android-preview-promote.yml`.
8. **Audit after mutation**: re-read GitHub and compare every invariant. Record exact commands, artifacts, not-run reasons, and residual risk in the matching evidence when project policy requires it.

A failure at any gate stops the sequence. Do not weaken a check, swap a candidate, recreate a Release, or repair an immutable object through a different channel.

## Curated notes handoff

Curated notes belong to `.agents/skills/release-notes/SKILL.md`. The user must explicitly invoke:

`/skill:release-notes <version> <CodeName> <emoji> <channel-or-tag>`

Do not infer missing inputs. The notes skill edits an existing workflow-created or explicitly approved product Release. It must never create a replacement Release. It must stop for `native-signing-*`, whose operational staging body is part of the verification contract rather than product marketing.

Before handoff, prove the originating publication workflow or transaction completed successfully and that no retry or Draft-resume path is pending. Curated metadata breaks every originating metadata-bound audit/retry path that requires the original title/body, including `scripts/github-release.ts` and APK Preview's `.github/workflows/android-preview-promote.yml`; record that consequence rather than treating the edit as retry-safe.

When a workflow or release policy requires a public warning, waiver, or unsigned-platform statement, preserve that workflow-mandated disclosure verbatim as a leading prefix. The compact body does not add optional Warning, Download, Integrity, signer, waiver, or device-validation sections of its own.

## Existing Release title or body edits

Treat a metadata-only correction as a narrowly bounded publication:

1. Resolve one exact existing Release, reject `native-signing-*`, prove its originating publication workflow or transaction completed successfully with no retry or Draft-resume path pending, and snapshot its release ID, tag, tag ref, assets, target, draft, prerelease, immutable, and Latest state.
2. Store each asset's ID, name, size, and digest in the before snapshot.
3. Render the complete proposed title and body. Obtain approval for that exact draft unless the user's current request already approves it with every required notes input. Record that the edit removes compatibility with every originating metadata-bound audit/retry path, including `scripts/github-release.ts` and APK Preview promotion.
4. With explicit current-task authorization, run only `gh release edit <tag> --title ... --notes-file ...`.
5. Never run `gh release create`, move or recreate the tag, upload or delete an asset, change target, toggle draft or prerelease, or alter Latest state to repair notes.
6. Re-read the Release, tag ref, Latest endpoint, and asset inventory. Require exact equality for release ID, tag, target, draft, prerelease, immutable, Latest identity, and every asset tuple.

If the Release does not exist, stop. Missing notes are not permission to create one.

## Existing Release deletion

Release deletion is destructive cleanup, not a notes correction, failed-promotion repair, rollback, or implicit channel migration. It deletes the Release object and every attached asset. Use it only when the user explicitly authorizes deletion of each exact existing tag in the current task.

Before deleting:

1. Resolve and show every exact Release tag. Do not infer a similarly named channel or expand an instruction such as "old Releases" without an enumerated set.
2. State that attached assets will be deleted. Separately state whether the direct Git tags will be preserved; Release-deletion authority alone preserves them.
3. Inspect current distribution and retention dependencies, including Latest, update manifests, pinned download URLs, matching runbooks, and durable evidence. Report any live consumer or required retention conflict before mutation.
4. Snapshot each target Release's numeric/node ID, title/body, target, draft, prerelease, immutable state, timestamps, direct tag ref, and every asset's ID, name, size, and digest.
5. Snapshot every preserved current-channel Release, its direct tag and asset tuples, plus the GitHub Latest identity. For multiple deletions, complete one preflight for the entire exact set before the first mutation.

With explicit current-task authorization for the exact Release and with the tag-preservation scope recorded, run only:

```bash
gh release delete "$tag" --repo jczhang02/lyntty --yes
```

Do not pass `--cleanup-tag`; that flag requires separate explicit authorization for deletion of the exact Git tag. Never delete a tag merely because its Release was deleted. Do not use `gh api --method DELETE` as an alternate path around this bounded command.

After each deletion and again after the complete set:

- require HTTP 404 for the deleted Release by tag and former numeric ID;
- require HTTP 404 for every former Release asset ID;
- require the direct tag object to remain structurally equal to its snapshot when tag preservation was scoped;
- require all preserved Releases, direct tags, asset tuples, and GitHub Latest identity to remain equal to their pre-delete snapshots;
- record exact commands, deleted identities, preserved identities, not-run checks, and downstream URL implications in durable evidence.

If a target is missing, has drifted since preflight, is required by a current retention/update path, or cannot be independently verified, stop. Do not broaden deletion or delete a tag as a repair.

## Mandatory public disclosures

The compact format removes optional safety and integrity sections, not release-policy requirements:

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

A release audit is read-only unless the user separately authorizes a mutation. Compare the live Release, tag, assets, attestations, channel state, and Latest identity with source and durable evidence. Report drift before proposing a repair, and do not turn an audit request into creation, edit, publication, or deletion authority.
