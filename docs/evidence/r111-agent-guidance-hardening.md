# R111 — Cross-Agent Repository Guidance Hardening

Date: 2026-07-23

Status: implemented, tested, independently reviewed, and locally committed with a Good OpenPGP signature

## Reference and intent

The review compared Lyntty against `tw93/Mole` `AGENTS.md` at Mole `main` commit `17683e1ac501b80456c37b23b2895398c1fe6380` (file SHA-256 `414bcb76613d49ee53f062fe46e7079319e4ff21f1b13e13b6f386e4fdde7d33`). Mole supplied useful structural patterns, not product policy to copy.

Lyntty retained its Android-first, Pi-only, self-hosted contract, `.agents/skills/` canonical direction, Beads/evidence process, protected-main policy, and live Pi isolation rules. It did not add Mole's unverified `AGENTS.local.md` convention, macOS shell rules, or cumulative incident diary.

## Implemented guidance

- Root `AGENTS.md` now declares the repository-wide contract and requires the nearest nested `AGENTS.md` before subtree edits. Nested rules may add local deltas but cannot weaken root safety, permission, Git, product, release, or verification requirements.
- Current authority is separated from date-bound context. Root and nested guides, current context, accepted architecture/runbooks, and current code/tests are normative; `docs/research/` is historical background and `docs/evidence/` proves observations only at its recorded revision.
- A five-question Lyntty product filter tests Android/local-Pi value, the `phone -> relay -> lynttyd -> Pi extension -> pi` boundary, one active runtime and canonical Pi JSONL, APK surface discipline, and real-path verification.
- GitHub issue/PR operations now require a fresh live read, author-language handling, shipped-state verification, and exact current-task authority for every public mutation.
- Root verification text now describes `ci:fast` from the real scripts. It includes the isolated compiled Relay health/shutdown smoke but excludes daemon integration, docs gates, APK/Maestro, physical devices, deployed Relay validation, and end-to-end App/daemon/Relay behavior.
- App, CLI, Relay, and Wire guides distinguish focused development checks from their package claim gates. CLI guidance separately identifies `ci:daemon-integration` as the compiled `lyntty`/`lynttyd` plus standalone Relay integration gate.
- `docs/AGENTS.md` requires synchronized existing EN/ZH pairs and paired new long-lived user-facing guidance without pretending that every historical or existing normative singleton must be backfilled for a small edit. It documents `docs:check` and `docs:build` escalation.

## Release deletion contract

The root guide and canonical `release-flow` now classify any existing GitHub Release deletion as a release mutation. The flow requires:

- current-task authorization for every exact tag;
- disclosure that the Release object and attached assets are deleted;
- separate authority for Git tag deletion, with tags preserved by default;
- current retention, Latest, update-manifest, pinned-URL, runbook, and evidence inspection;
- complete target and preserved-channel preflight snapshots;
- only `gh release delete "$tag" --repo jczhang02/lyntty --yes` for Release deletion;
- no `--cleanup-tag` without separate explicit tag authority;
- post-delete 404 checks by tag, numeric Release ID, and former asset ID;
- structural equality for preserved tags, current Releases, asset tuples, and Latest;
- durable evidence and downstream URL implications.

Expo Dev explicitly participates in deletion/cleanup safeguards. `release-notes` explicitly cannot create or delete Releases and routes deletion back to `release-flow`. No publication workflow or release script changed.

## Regression tests

A new `scripts/agent-guidance.test.mjs` contract test was added to `test:repo-hardening`. It reads root and nested guides plus the real root, CLI, Relay, and docs-site package scripts. Existing release-agent tests gained focused exact-tag, asset-loss, tag-authority, Expo Dev, snapshot, 404, and preserved-state checks.

TDD progression:

```text
bun test scripts/agent-guidance.test.mjs scripts/release-agent-rules.test.mjs
initial contract: 3 pass, 6 fail (expected before implementation)
final contract:   9 pass, 0 fail
```

Final checks:

```text
bun run test:repo-hardening
46 pass, 0 fail

bun run ci:fast
PASS

bun run ci:daemon-integration
compiled CLI/lynttyd daemon integration passed

cd docs/.site
bun install --frozen-lockfile
bun run docs:check
PASS

bun pm untrusted
0 untrusted dependencies with scripts

git diff --check
PASS
```

The first isolated `docs:check` attempt failed because the worktree had no docs-site dependencies and could not resolve `fumadocs-mdx`. Installing 376 packages from `docs/.site/bun.lock` with `bun install --frozen-lockfile` fixed the environment; the lockfile and tracked dependency state did not change.

## Independent review

The first implementation review found two blockers:

1. CLI guidance incorrectly claimed `ci:cli` compiled both native executables.
2. An Expo Dev scope sentence omitted deletion/cleanup.

Both were corrected, and tests were strengthened against the actual package scripts. A follow-up review then found an inaccurate implication that `ci:fast` had no Relay runtime smoke; root guidance and tests were corrected to identify the isolated compiled Relay smoke while excluding deployed and end-to-end validation. Final independent verdict: `PASS`, with no remaining concrete issue.

## Commit

- Policy and tests: `63ee62ba2838fe8223ccf79b1cc6e832ef6539d8`
- Tree: `99b19c58127ba44d90b3df56c694b701f57ee37e`
- Subject: `docs(agent): harden repository guidance`
- OpenPGP key: `BABC6A51B0F43016329922DE1F863CBFD6EDCA6B`
- Verification: Good signature

## Not run and residual risk

- `docs:build` was not run because no site configuration, rendering component, generated navigation, or build output changed; `docs:check` covered the documentation contract change.
- No APK, Maestro, physical-device, or deployed-service validation was run because no product/runtime code changed.
- No workflow dispatch, GitHub issue/PR mutation, Release mutation, push, or PR creation occurred.
- Automatic nested-`AGENTS.md` discovery was not observed in a separate live session. Root guidance now requires agents to read the nearest file, and static tests bind every current nested guide, but client-specific loader behavior remains outside repository control.
- Historical research remains intentionally unchanged and may still contain obsolete names. It is now explicitly non-normative rather than silently rewritten.
