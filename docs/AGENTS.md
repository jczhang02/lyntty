# Documentation Agent Rules

The root `AGENTS.md` applies here. This guide adds documentation-specific deltas and cannot weaken root safety, permission, product, release, or verification rules.

English is canonical for issue and agent handoff unless a task says otherwise. Simplified Chinese mirrors user-facing product intent and decisions.

## Bilingual scope

- When an existing English/Chinese pair is changed, update both files in the same change and commit.
- New long-lived user-facing product, architecture decision, release, and operating documents require English `name.md` and Simplified Chinese `name.zh.md` siblings.
- A historical research or evidence singleton does not require translation backfill merely because it is touched. Preserve its language and add a sibling only when the task or audience requires one.
- An existing normative singleton also does not require translation backfill for a small maintenance edit. If a task substantially turns it into new long-lived user-facing product or operating guidance, add the missing sibling or stop for an explicit scope decision.
- If an existing pair cannot be synchronized immediately, add a visible sync note to the stale version and record the follow-up rather than implying parity.
- Technical names stay exact: `pi`, `lynttyd`, `relay`, `Sessions Home`, `Node Management`, `Session Remote`, `Review Evidence`, `active runtime`, `activation lock`, `history_gap`.

## Verification tiers

For Markdown-only edits that do not affect the documentation site, check links, commands, paired-file consistency, and `git diff --check` directly.

Before a claim about docs type safety, generated navigation, or MDX validity, run:

```bash
cd docs/.site
bun run docs:check
```

For site configuration, rendering, generated-page, or build-output changes, also run:

```bash
cd docs/.site
bun run docs:build
```

These docs-site gates are not included in the root `bun run ci:fast` command.
