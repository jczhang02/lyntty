# R112 — Multi-agent guidance and documentation audit

Date: 2026-07-24

Status: underlying changes implemented, verified, independently reviewed, and locally committed with Good OpenPGP signatures; this evidence record is the separate final documentation unit

Bead: `lyntty-v9z`

## Scope

The task required multiple independent agents to determine whether the current root and nested Agent guidance was sound, inspect tracked documentation for obsolete or useless material, delete only evidence-backed safe candidates, and leave the local branch ready for review without push or PR creation.

The audit covered:

- the root and all six nested `AGENTS.md` files;
- canonical `release-flow` and `release-notes` skills;
- 230 tracked Markdown files before cleanup, including 165 evidence narratives;
- current contexts, PRDs, architecture, release/deploy runbooks, research, migration plans, and docs-site generation;
- exact-path/code/config references and generated-site navigation;
- current App, CLI, Relay, Wire, workflow, package-script, and evidence truth used by those documents.

## Multi-agent review

Five read-only agents performed the first independent pass:

1. Agent-guidance correctness and command/claim-gate audit.
2. Current, historical, correction, and deletion classification.
3. Legacy Happy/Claude/Codex/Gemini/OpenClaw and removed-workspace search.
4. Markdown/site graph, navigation, duplicate, and broken-link audit.
5. Skeptical preservation review for audit, release, security, and migration value.

The first guidance verdict was `FAIL`, not a rubber-stamped approval. It found factual or fail-open gaps around direct `lyntty remote` Relay access, native-signing staging, the one-time Expo Dev publication, Android package identities, metadata-bound Release retry, version/target validation, stale current context, and the untested docs-site guide.

Four post-change reviewers then independently checked Agent rules, deletion/preservation, the documentation graph/build, and current product truth. Their findings drove further corrections for APK Preview metadata-bound retry, current acceptance wording, Relay R104 deployment state, hidden mobile context, `invoke_pi_command`, actual App/Relay stacks, worktree opt-in, and pending VPS restore validation. The agent harness returned the following final verdicts; raw reviewer transcripts are not tracked repository artifacts:

- Agent/release guidance reviewer: `PASS`.
- Documentation deletion/preservation reviewer: `PASS`.
- Documentation graph/build reviewer: `PASS`.
- Product truth and EN/ZH consistency reviewer: `PASS`.
- Independent dependency-security reviewer: `PASS`.

## Agent guidance result

The current guidance now:

- distinguishes `lynttyd`, the only node-side session bridge, from the direct operator-facing `lyntty remote` control-plane client;
- keeps the Pi extension strictly local to `lynttyd`;
- classifies `native-signing-*` as operational staging and rejects curated product notes for it;
- makes future Expo Dev GitHub Release creation fail closed while retaining audit/edit/delete protection for the existing prerelease;
- distinguishes `.dev`, `.preview`, and production Android package identities;
- requires successful originating publication completion and no pending retry/Draft resume before curated notes;
- records that curated title/body edits disable every applicable metadata-bound audit/retry path, including `scripts/github-release.ts` and APK Preview promotion;
- validates the literal user version against the exact Release identity without inferring it;
- explicitly binds `docs/.site/AGENTS.md` into root inheritance and static tests.

## Deletion decision

Exactly three tracked files were deleted.

| Deleted file | Proof | Replacement or consequence |
| --- | --- | --- |
| `CONTEXT-MAP.lyntty.md` | Blob `335094153560c57f5d1451317c96bfca57f56a48`, byte-identical to `CONTEXT-MAP.md`; no independent consumer | Canonical `CONTEXT-MAP.md` remains |
| `docs/contexts/product/CONTEXT.lyntty.md` | Blob `22297a1980e0b33a3d171d1841926a296d447f38`, byte-identical to `docs/contexts/product/CONTEXT.md`; no independent consumer | Canonical product context remains |
| `docs/research/agent-teams-claude-code-stuck-non-interactive.png` | Blob `06cf88e48d87c37e1eec11cae8a178db42ce9439`, 123,545 bytes; no pre-cleanup independent consumer, owning narrative, conclusion, or Lyntty decision. The final absence regression test intentionally names the deleted path. | No replacement required |

`docs/evidence/h0-lyntty-import.md` preserves the original import observation and adds a separate later-disposition note for the two duplicate snapshots.

No unique roadmap, research record, release/deploy runbook, evidence narrative, release input, legal/store document, or evidence artifact was deleted. Historical age and lack of inbound Markdown links were explicitly rejected as sufficient deletion evidence. The deletion pass reduced the inventory from 230 to 228 tracked Markdown files; adding this EN/ZH R112 evidence pair returns the final tree to 230.

## Current documentation corrections

- `CONTEXT-MAP.md` and product contexts point only to present current sources.
- Removed `Review Evidence`, removed workspaces, raw unknown-command fallback, and obsolete initial-milestone claims no longer appear in current contexts/PRDs.
- The PRD reflects Fastify/Socket.IO/Prisma/PGlite and Expo Router/Zustand/MMKV, plus explicit worktree opt-in.
- Shared-control architecture records implemented R50 behavior, current strict commands including `invoke_pi_command`, clean visible prompts, hidden mobile context, R57 echo merge, and current residual work.
- Completed migration roadmaps, research snapshots, fork plan, and mobile-shell baseline carry prominent historical/superseded headers and current-source pointers.
- The Bun standardization plan is marked complete rather than tied to the removed migration branch.
- Relay deployment runbooks identify signed Stable sequence 1/R104, preserve R65 as bootstrap history, include direct operator CLI topology, and distinguish completed deployment checks from the still-pending VPS restore drill.
- Docs-site navigation labels the migration roadmap as historical.

## Static contracts and TDD

New `scripts/docs-currentness.test.mjs` is part of `test:repo-hardening`. Existing Agent and release tests were expanded.

```text
Initial focused contract:
6 pass, 10 fail (expected before implementation)

Final focused contract:
16 pass, 0 fail

Final repository hardening:
53 pass, 0 fail
```

Before the R112 pair was added, the graph reviewer scanned the resulting 228 tracked Markdown files and found 31 relative Markdown destinations with zero missing targets. The generated-site audit found no missing route or same-page fragment target. Generated output remained ignored and untracked.

## Dependency-audit blocker

The first final `ci:fast` attempt reached `bun audit` and failed on newly published `GHSA-c96f-x56v-gq3h`:

- package: `find-my-way`;
- severity: high;
- affected: `<= 9.6.0`;
- first patched: `9.7.0`;
- published: 2026-07-23T19:33:15Z.

The repository had `find-my-way@9.6.0` through Fastify 5.10.0. The narrow fix adds an exact root override for `9.7.0`, updates the lockfile override table plus that package resolution/integrity, and adds a regression assertion rejecting 9.6.0. Fastify's `^9.6.0` dependency accepts 9.7.0.

A stale ignored worktree symlink initially still resolved 9.6.0 after the dependency-resolution change. `bun install --frozen-lockfile --force` refreshed the isolated worktree, after which the actual Fastify child resolved 9.7.0. The full gates were rerun against those bytes. A separate reviewer also verified a clean frozen install and Fastify/Relay smoke.

## Final verification

The following results were observed in this isolated worktree and are recorded here; raw command logs and reviewer transcripts are not committed as separate artifacts.

```text
bun install --frozen-lockfile --force
actual Fastify child: find-my-way 9.7.0

bun run ci:fast
PASS
  repository hardening: 53 pass
  Wire: 36 pass
  CLI: 585 pass
  Relay: 119 pass
  App: 819 pass, 3295 assertions across 90 files
  development scripts: 36 pass
  bun audit: No vulnerabilities found

bun run ci:daemon-integration
compiled CLI/lynttyd daemon integration passed

cd docs/.site
bun run docs:check
bun run docs:build
PASS; 19 Fumadocs source pages and 24 static routes generated

bun pm untrusted
0 untrusted dependencies with scripts

git diff --check
PASS
```

The Next build emitted its existing workspace-root inference warning because multiple lockfiles are present; compilation, typechecking, static generation, and raw Markdown generation all completed.

## Commits

- Agent/release corrections: `4f65038204e1ded39ff64c3acd6f93b6f6b4f07b`
  - tree `37e3787f6743719a840529ca4f22040981501872`
- Documentation pruning/currentness: `47401e672f6c2161df3af60e535d46e48bbc4b47`
  - tree `4e16ce89c69d893ea497eaa97de4895e74ca7f25`
- Dependency audit fix: `663ae2c4f33d0ab632e3e763818e4528f2dd58e6`
  - tree `9ed8b62b2a18a9a3bb154a77730b2cf45fcd357c`
- Signing key: `BABC6A51B0F43016329922DE1F863CBFD6EDCA6B`
- Signature result: Good for all three commits

## Not run and residual risk

- No APK, Maestro, physical-phone, Pi-extension live install, production deploy, workflow dispatch, GitHub mutation, push, or PR creation occurred. Product/runtime code did not change; compiled Relay and daemon integration covered the dependency-only runtime change.
- External documentation URLs were not exhaustively network-validated.
- The docs site intentionally publishes a selected 19-page surface rather than all 230 final tracked Markdown records. Source entry points identify current runbooks; this remains an information-architecture limitation, not a broken-link condition.
- Historical bodies intentionally retain point-in-time claims and old paths beneath explicit historical/superseded headers.
- Automatic nested-`AGENTS.md` discovery remains client-dependent; repository guidance and static tests require and bind every current nested guide.
