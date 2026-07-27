---
name: release-notes
description: Draft and publish compact bilingual Lyntty notes for one existing Stable, Preview, or Expo Dev product Release. May be invoked proactively during release work and may infer title metadata from verified release context. Native-signing operational staging and Rollback are excluded.
---

# Lyntty Release Notes

This skill owns curated public notes after the exact GitHub Release already exists. It can edit that Release's title and body only. It cannot create or delete a Release or mutate its tag, assets, target, channel, or publication state. Release deletion belongs to `release-flow` and requires separate exact-tag authority.

## Invocation and inference contract

The agent may invoke this skill proactively when one release task reaches curated-notes preparation, or when the user asks to draft, improve, or publish Release Notes. Explicit invocation remains supported:

`/skill:release-notes <version> <CodeName> <emoji> <channel-or-tag>`

Every argument is optional when verified release context supplies it. An explicit user value always overrides an inferred value. Resolve inputs as follows:

- `version`: use the explicit version, or derive it from the one exact resolved Release and verify it against the released product identity;
- `channel-or-tag`: use the explicit channel/tag, or resolve it only when the current task and live state identify exactly one existing Release target;
- `CodeName`: preserve an explicit value; otherwise infer the CodeName from the dominant verified user-visible theme in the released commit range and evidence. Use one to three concise English Title Case words, led by the highest-impact changelog item rather than internal hardening. An inferred CodeName must stay neutral and descriptive; it must not claim unverified performance, security, reliability, completeness, or platform support;
- `emoji`: preserve an explicit value; otherwise infer the emoji by semantic match to that same theme. Choose the first applicable category: trust/security `🛡️`, speed/performance `⚡`, sync/history/reliability/control `🧭`, connection/discovery `🔗`, mobile/UI `📱`, or developer/Metro `🔌`.

If no dominant theme exists or equally important themes would make the title arbitrary, use the fallback for the resolved channel instead of asking for a creative preference:

- Stable Compatibility: `Stable Compatibility 🧭`;
- Compatibility Preview: `Compatibility Preview 🧪`;
- APK-only Preview: `APK Preview 📱`;
- Expo Dev: `Expo Dev 🔌`.

When a channel rather than a tag is supplied or inferred, inspect matching Releases and present the resolved exact tag before mutation. If the Release target is ambiguous, stop and ask for the exact channel or tag; never choose among multiple live Releases by recency alone. If the target resolves to Rollback, stop and follow `release-flow`; Rollback uses an operational record, not this curated format. If the exact tag matches `native-signing-*`, stop: its workflow-generated operational staging body is part of the verification contract and must not receive curated product notes.

Before asking for publication approval, show the resolved target, title inputs, inference rationale outside the public body, exact title, and complete body. Proactive invocation authorizes only read-only investigation and drafting. Editing the public Release still requires an explicit publish or submit instruction for that exact draft and target unless the user's current request already provides equivalent specific authorization.

## Existing Release requirement

Confirm that one exact Release already exists. If it is missing, wait for the authorized workflow or operator process. Never run `gh release create` or `gh release delete`; missing or poor notes are not a reason to create a competing Release or remove history.

Prove that the originating publication workflow or transaction completed successfully and that no publication retry or Draft-resume path is pending. Curated title/body edits remove compatibility with every originating metadata-bound audit/retry path that requires the original metadata, including `scripts/github-release.ts` and APK Preview's `.github/workflows/android-preview-promote.yml`; record this consequence before asking for publish approval.

Validate the explicit or inferred version against the resolved Release tag and the released App/product identity in its manifest, BOM, provenance, or source package as applicable. If the version and target mismatch, or the match cannot be proven, stop before drafting.

Before drafting:

1. Load `.agents/skills/release-flow/SKILL.md` and the relevant release runbook.
2. Read the target Release, its source commit, current body, and matching durable evidence.
3. Read the latest Stable body as a live visual reference, but follow this skill when an older body conflicts with the current compact policy.
4. Review the complete release commit range and commit bodies, not only subjects.
5. Identify user-visible behavior changes, constraints, removed behavior, issue reporters, and PR contributors.
6. Select or infer the CodeName and emoji from the highest-impact verified user-visible theme, recording the source and fallback decision outside the public body.
7. Verify every command or product concept mentioned still exists at the released source commit.
8. Identify any mandatory disclosure that release policy requires the public body to retain.

Do not use internal test counts, provenance detail, signer identity, checksums, waiver mechanics, or physical-device status as ordinary changelog material. A mandatory public disclosure is the sole exception and stays in its required prefix.

## Title

The title is exactly:

`V<version> <CodeName> <emoji>`

Use capital `V`. Preserve explicit title values; otherwise use the inference contract above. The emoji must be exactly one visible grapheme. Version, CodeName, and emoji appear only in the Release title. The body heading is only `Lyntty`.

## Body template

Use this exact section order. Omit the first placeholder and its following blank line when no mandatory disclosure applies.

```html
<mandatory disclosure prefix, when required>

<div align="center">
  <img src="https://raw.githubusercontent.com/jczhang02/lyntty/<source-commit>/packages/lyntty-app/sources/assets/images/icon.png" alt="Lyntty Logo" width="120" height="120" style="border-radius:22%" />
  <h1 style="margin: 12px 0 6px;">Lyntty</h1>
  <p><em>Mobile control for local <code>pi</code> sessions.</em></p>
</div>

### Changelog

1. **<English headline>**: <one concise English explanation>.

### 更新日志

1. **<中文标题>**：<一句简洁中文说明>。

### Thanks

<Verified contributor line, or: Thanks for using Lyntty. / 感谢使用 Lyntty。>
```

The source-pinned logo URL must use the Release's exact source commit rather than `main`.

## Mandatory disclosure prefix

Mandatory disclosure text is outside the curated sections. Preserve every workflow-mandated disclosure verbatim at the beginning of the body:

- APK-only Preview owner-waiver physical-Android disclosure;
- required Stable platform-unsigned disclosure for macOS and Windows archives.

Do not shorten, soften, translate again, or move a required disclosure below the logo. Do not add optional Warning, Download, Integrity, signer, waiver, attestation, checksum, or physical-device sections. Internal gates and evidence remain required.

## Format rules

- English `Changelog` comes first and Chinese `更新日志` second. They must contain the same number of items in the same order with equivalent meaning.
- Order items by user-perceived impact, not commit chronology.
- Use a colon in English and a full-width colon in Chinese. Do not use an em dash anywhere.
- Use no emoji in the body. The only emoji is in the Release title.
- Keep the body h1 exactly `Lyntty`; do not repeat version, channel, CodeName, or emoji there.
- Do not add horizontal separators, a trailing repository link, or separate Download, Install, Integrity, Build identity, or product-ad sections.
- Put PR references and verified reporter or contributor handles only in `Thanks`, never inline with changes. Exclude bots and the repository owner. If nobody qualifies, use the bilingual fallback line from the template.
- Describe only behavior supported by the released source and evidence. Do not turn internal hardening into promotional claims.
- Stable, Compatibility Preview, and APK-only Preview may describe channel-specific user behavior, but must not blur package, signer, Relay, trust-root, or Latest boundaries.
- For Expo Dev, the first English and Chinese items must say that Metro on port `8081` is required and the APK cannot run standalone. This is a user operating condition, not an extra warning section.

## Draft checks

Before showing the draft, verify mechanically or by direct inspection:

- title exactly matches `V<version> <CodeName> <emoji>` and contains exactly one title emoji grapheme;
- explicit values were preserved, and every inferred value has an evidence-backed inference rationale outside the public body;
- logo URL contains the exact released source commit;
- h1 is only `Lyntty`;
- section order is logo, `Changelog`, `更新日志`, `Thanks` after any mandatory prefix;
- English and Chinese item counts and order match;
- no em dash, body emoji, horizontal separator, inline PR reference, or unverified contributor appears;
- no optional safety, Download, Install, Integrity, or build-identity section appears;
- every required mandatory disclosure remains verbatim;
- Expo Dev begins with the Metro `8081` and cannot-run-standalone condition.

Write the draft to a temporary file outside the repository unless durable evidence explicitly requires a tracked copy.

## Publish an approved draft

Immediately before editing, re-prove that the originating publication transaction completed successfully and no retry or Draft-resume path is pending. Snapshot the release ID, tag, target, draft, prerelease, immutable, and Latest state, the direct tag ref, and every asset's ID, name, size, and digest. Save the exact existing title and body too, and retain the recorded loss of every applicable metadata-bound audit/retry path.

With explicit current-task authorization for the exact draft, run only:

```bash
gh release edit "$tag" --repo jczhang02/lyntty \
  --title "$title" \
  --notes-file "$draft_file"
```

Never run `gh release create` or `gh release delete`. Do not pass flags that change target, draft, prerelease, or Latest state. Do not upload, replace, rename, or delete assets, and do not move or recreate the tag.

Re-read the Release and require:

- exact approved title and body;
- unchanged release ID, tag, target, draft, prerelease, immutable, and Latest identity;
- unchanged direct tag ref;
- byte-for-byte equal sorted asset tuples of ID, name, size, and digest.

If any invariant differs, stop and report the drift. Do not attempt a broader repair under notes-edit authority.

Reactions are outside title/body authorization. Add none unless the user grants separate explicit permission for the exact Release and reaction set, then verify the resulting state independently.
