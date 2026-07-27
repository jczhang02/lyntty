# R125 — Autonomous Release Notes metadata

Date: 2026-07-27

Status: locally verified

## Claim

Lyntty agents may now invoke `release-notes` proactively and infer a Release CodeName and title emoji from verified release context. Creative inference no longer requires a four-argument user command, while public Release edits remain bound to one exact existing Release, one displayed draft, and explicit mutation authority.

## Scope

Changed:

- `AGENTS.md` now advertises proactive `release-notes` use and inference;
- `.agents/skills/release-flow/SKILL.md` hands completed product publications to `release-notes` proactively;
- `.agents/skills/release-notes/SKILL.md` removes `disable-model-invocation`, defines inference and neutral fallbacks, and keeps the existing edit-only boundary;
- `scripts/release-agent-rules.test.mjs` enforces the new invocation, inference, disclosure, and authorization contracts.

The policy implementation is GPG-signed commit `2911948bb0c4c6e02e9714de109b38135dc1bbac`. This change does not edit a live GitHub Release, tag, asset, Latest state, workflow, package, or runtime.

## Decisions

- An agent may start read-only Release Notes investigation and drafting after the current task and live state resolve exactly one existing product Release.
- Explicit version, target, CodeName, or emoji values override inference.
- Version and target may be derived only from an unambiguous verified Release identity. Multiple candidate Releases still fail closed.
- A missing CodeName is inferred from the highest-impact verified user-visible theme. It stays neutral and descriptive and cannot promise unverified performance, security, reliability, completeness, or platform support.
- A missing emoji follows an ordered semantic mapping. When no theme dominates, channel-identity fallbacks avoid invented product claims.
- The agent must show the resolved target, inferred values and rationale, exact title, and complete bilingual body outside the public Release before asking to publish.
- Proactive invocation authorizes only read-only investigation and drafting. `gh release edit` still requires explicit authority for the exact draft and target.
- Rollback and `native-signing-*` remain excluded. Mandatory Stable unsigned-platform and APK Preview waiver disclosures remain verbatim. Tags, assets, target, draft/prerelease/immutable state, and Latest identity remain immutable under this skill.

## Regression sequence

The contract test was changed first and failed against the old explicit-only policy:

```text
bun test scripts/release-agent-rules.test.mjs
1 pass, 3 fail

missing: proactive invocation in AGENTS.md and release-flow
unexpected: disable-model-invocation: true
```

The first implementation passed all four targeted tests. Independent review then identified two P2 gaps: marketing-like fallback names and tests that did not directly bind read-only drafting to exact-draft publication authority. Stronger tests failed before the review fix:

```text
bun test scripts/release-agent-rules.test.mjs
3 pass, 1 fail

missing: neutral, descriptive CodeName rule and non-promissory fallbacks
```

After replacing creative fallbacks with channel identities and adding paragraph-level authorization/disclosure assertions:

```text
bun test scripts/release-agent-rules.test.mjs
4 pass, 0 fail
```

The concise transcript is retained in [`artifacts/r125/tdd-red-green.log`](./artifacts/r125/tdd-red-green.log).

## Verification

```text
bun run test:repo-hardening
85 pass, 0 fail

bun pm untrusted
Found 0 untrusted dependencies with scripts.

bun run ci:audit
No vulnerabilities found

cd docs/.site && bun audit --audit-level=moderate
No vulnerabilities found
```

After the evidence pair was added, `docs:check` prepared 42 pages and passed MDX/TypeScript checks; local links, bilingual heading parity, staged redaction, and final diff checks also passed. A final independent read-only review returned `VERIFIED_NO_P0_P1_P2`.

## Not run

- No live GitHub Release title/body was edited. This task changes policy only.
- No candidate, promotion, deployment, rollback, or publication workflow was dispatched.
- No model session was started solely to observe future skill auto-selection. Discovery and behavior are checked through canonical skill frontmatter, shared aliases, root guidance, and repository contract tests.
- Full package `ci:fast` was not run because no App, CLI, Relay, Wire, workflow, package, or dependency implementation changed; the owning repository-hardening and documentation gates were run instead.

## Residual risk

A CodeName remains a language-model editorial judgment when one theme clearly dominates. The skill mitigates this with verified user-visible evidence, neutral wording, an ordered emoji map, channel-identity fallbacks, displayed inference rationale, and exact-draft approval before any public mutation.
