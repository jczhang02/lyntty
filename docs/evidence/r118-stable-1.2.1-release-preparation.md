# R118 — Stable Compatibility 1.2.1 release preparation

Date: 2026-07-26

Branch: `release/stable-1.2.1`

Bead: `lyntty-mpr`

Base: `57ae1ccf0bff974b29bd7dcf7e356b06fa648ed4`

## Release identity

The next intended Stable Compatibility set is:

| Component | Version |
| --- | --- |
| App | `1.2.1` |
| CLI + `lynttyd` | `1.2.1` |
| Relay | `1.2.1` |
| Wire | `0.2.0` |

The intended immutable identity is:

```text
Sequence: 2
Android versionCode: 7
Tag: compat-v1.2.1_1.2.1_1.2.1_0.2.0-s2
Predecessor 1: compat-v1.2.0_1.2.0_1.2.0_0.2.0-s1
Predecessor 2: empty
```

App and CLI contain runtime changes since Stable sequence 1, including progressive Sessions Home retrieval and the daemon's persistent incremental Pi-session index. Relay artifact inputs also changed through the patched runtime dependency set, including `find-my-way`; those three components advance by one patch version. Wire schemas and protocol negotiation did not change, so Wire remains `0.2.0`.

`bun.lock` contains the same three workspace version updates. Relay's runtime identity regression test expects `1.2.1`.

## Policy included in the source

R117 changes only Stable physical-device policy: validation is optional, false requires an empty accepted hash and adds no Release-body warning, while true still binds the exact Candidate APK SHA-256. APK-only Preview and every non-device supply-chain gate remain unchanged.

## Local verification

```text
bun install --frozen-lockfile
bun pm untrusted
bun run ci:fast
```

Result:

- frozen install: pass;
- untrusted dependency scripts: `0`;
- repository hardening: `84 pass`, `0 fail`;
- dependency audit: no vulnerabilities;
- Wire: `36 pass`, `0 fail`;
- CLI: `606 pass`, `0 fail`;
- Relay: `119 pass`, `0 fail`;
- App: `863 pass`, `0 fail`, `3381` assertions across `98` files;
- isolated development scripts: `36 pass`, `0 fail`;
- `git diff --check`: pass.

Additional release-policy checks:

```text
bun test --timeout 20000 scripts/workflow-hardening.test.mjs \
  scripts/release-agent-rules.test.mjs scripts/evidence-redaction.test.mjs
39 pass, 0 fail

ruby YAML parse of .github/workflows/release-promote.yml
9 Promotion run blocks: bash -n and shellcheck -S error
packages/lyntty-relay: bun test --isolate sources/standalone.spec.ts
6 pass, 0 fail
```

Documentation-site validation used its independent frozen install:

```text
cd docs/.site
bun install --frozen-lockfile
bun audit --audit-level=high
bun run docs:check
```

Result: no vulnerabilities, 42 pages prepared, MDX generation and TypeScript checks passed.

One initial `ci:fast` attempt stopped before package gates because three tracked cross-agent guidance symlinks were absent in the local task worktree. Restoring the exact `HEAD` symlinks (`CLAUDE.md` and the two `.claude/skills/*` links) removed that environment-only failure; the complete rerun above passed. No product or release-policy assertion failed in the final run.

## Publication state

No Candidate workflow, tag, GitHub Release, GHCR promotion, or production Relay deployment was created during release preparation. Candidate and Promotion must still run from the exact then-current protected `main`; any source drift invalidates the Candidate and requires a rebuild.

## Not run and residual risk

- The real production-signed APK, five CLI archives, multiarchitecture Relay OCI layout, signed BOM, provenance, and attestations are produced only by the protected Candidate workflow and are not claimed by local checks.
- Physical Android validation is intentionally not required under R117. No physical-device install, launch, or phone-to-Relay-to-`lynttyd` round trip is claimed.
- Production Relay deployment is outside this release task and requires separate authorization and `production-relay` approval.
