# R108 — Cross-agent Release rules

Date: 2026-07-23

Status: locally verified

## Claim

Lyntty now has one tracked Release policy that Pi, Claude, and Codex can discover without copied rule bodies. The policy separates release channels, keeps public side effects permission-gated, and gives curated GitHub Release Notes a user-only, edit-only interface.

## Scope

Added:

- the canonical `.agents/skills/release-flow/SKILL.md` runbook;
- the explicit-only `.agents/skills/release-notes/SKILL.md` formatter and edit protocol;
- `CLAUDE.md` and `.claude/skills/*` relative aliases;
- a minimal shared entry in `AGENTS.md`;
- a narrow `.gitignore` allowlist;
- `scripts/release-agent-rules.test.mjs` in the repository-hardening gate.

This change does not modify a release workflow, publication script, tag, asset, or live GitHub Release. Live title/body corrections are a separate authorized follow-up after all required Release Notes inputs are explicit.

## Enforced decisions

- `.agents/skills/` is canonical. Claude uses relative symlinks, Pi reads `.agents/skills/` directly, and no `.pi` mirror is tracked.
- `release-flow` covers Stable Compatibility, Compatibility Preview, APK-only Preview, Expo Dev durable prereleases, Rollback, and audits.
- Pure Actions Artifact work is terminally excluded. The Android verification candidate and normal 14-day Expo Dev Artifact are not GitHub Releases.
- Expo Dev has no publication workflow. A durable prerelease is an exceptional, separately authorized operator promotion of already verified bytes.
- Loading a skill grants no authority for dispatch, push, PR, tag, Release mutation, rollback, or reactions.
- `release-notes` requires `/skill:release-notes <version> <CodeName> <emoji> <channel-or-tag>` and cannot infer an input.
- Existing notes use one exact `gh release edit` command with only `--repo`, `--title`, and `--notes-file`. The flow never creates or replaces a Release.
- Before/after checks bind Release ID, tag and tag ref, target, draft, prerelease, immutable and Latest state, plus every asset ID, name, size, and digest.
- Mandatory Stable/Preview waiver and Stable unsigned-platform disclosures remain public and verbatim. Optional Warning, Download, Integrity, signer, and validation sections are not added.
- Expo Dev starts its bilingual changelog with the Metro `8081` and cannot-run-standalone condition. Rollback uses an operational record without CodeName or marketing changelog.

## Verification

The contract test was first run before implementation and failed in all four cases because the canonical skills and symlinks did not exist and the paths were ignored. After implementation and review fixes:

```text
bun test scripts/release-agent-rules.test.mjs
4 pass, 0 fail

bun run test:repo-hardening
41 pass, 0 fail

bun pm untrusted
Found 0 untrusted dependencies with scripts.

bun run ci:audit
No vulnerabilities found

bun run ci:fast
PASS

git diff --check
PASS
```

The isolated worktree used its own `bun install --frozen-lockfile`; no dependency directory or runtime state was shared with another worktree.

An independent read-only review found three issues: ambiguous Artifact-only candidate wording, an incorrect implication that Expo Dev had a publication workflow, and weak static command checks. The final rules make Artifact exclusion terminal, document the exceptional manual Expo Dev path, reject tracked `.pi` mirrors, and compare the allowed `gh release edit` command block exactly.

## Not run

- No live Pi, Claude, or Codex session was started solely to observe model-side skill selection. Discovery is verified through documented paths, real symlink resolution, frontmatter, ignore behavior, and static contracts.
- No workflow was dispatched and no GitHub Release was mutated in this evidence unit.

## Residual risk

Static rules cannot force a model to load a matching skill. The shared `AGENTS.md` entry, explicit invocation contract, filesystem aliases, and repository-hardening checks reduce drift, but external operations still require operator review and live before/after verification.
