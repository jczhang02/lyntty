# R82 — Compatibility BOM and protected release-system evidence

Date: 2026-07-18

Branch: `refactor/bun-migration`

Bead: `lyntty-6o0.7`

## Scope

This round establishes the formal multi-component release contract after the standalone CLI/daemon, Relay, and Android delivery work:

- component SemVer for App `1.1.0`, CLI `1.2.0`, Relay `1.2.0`, and Wire `0.2.0`;
- Wire protocol `1.1`, explicit capability offers, one-minor negotiation, and fail-closed malformed/incompatible sockets;
- canonical Compatibility BOM file bytes, detached Ed25519 signatures, channel-specific trust roots, immutable artifact references, and current-plus-two compatibility history;
- persistent CLI Stable/Preview replay and same-sequence equivocation protection, including authoritative higher-sequence signed rollbacks;
- bounded, streamed, deadline-limited, canonical BOM fetches for CLI and Relay;
- build-once candidate, protected Stable/Preview promotion, monotonic Stable rollback, and current-head Relay deployment by signed digest;
- SPDX, in-toto candidate-verification statements, OCI signature/provenance/SBOM checks, and exact draft-resume publication;
- native macOS/Windows verification workflow that binds source/workflow digest, complete archive inventory, Apple Developer ID/notarization or Authenticode identity/timestamp, and per-archive attestations;
- retained compiled CLI and Relay runtime checks, including retained Relay `doctor` against the newest migrated schema.

## Safety and trust boundaries

- The test BOM under `docs/evidence/artifacts/r82-compatibility-release/` uses the deterministic fixture key from test source. Production release tooling explicitly rejects its key IDs, public root, and private seed; it is not a Stable/Preview key, candidate, or publishable release.
- Fixture native-attestation references are schema test data only. No local result claims Apple notarization, Authenticode, a permanent Android signer, or protected production credentials.
- Local compiled checks used isolated state under `packages/lyntty-cli/dist/test-state/r82-release` and a local loopback metadata server. They did not read or change live `~/.pi`, `~/.lyntty`, daemon, Relay, or Pi sessions.
- No GitHub Release, tag, GHCR image, production Relay deployment, native-signing run, Stable/Preview candidate, or promotion was created.
- Stable remains blocked until protected environments, permanent Android material, BOM keys/trust roots, Apple notarization credentials/identity, Windows certificate identity, external signed archives, and production approvals are present.

## Local cryptographic and consumer evidence

Test-only canonical assets:

- `validation-bom.json`: `fa8896865d1293add4dca2a7df6000c6e7c5c6ae599d8baa34e9ef564577602f`
- `validation-bom.sig.json`: `829fd82734262801500e6334f12d9e9a473af2ab57ef3dda7acbd1d89409eeaa`

Commands:

```bash
bun --no-install scripts/release.ts verify \
  --bom docs/evidence/artifacts/r82-compatibility-release/validation-bom.json \
  --signature docs/evidence/artifacts/r82-compatibility-release/validation-bom.sig.json \
  --trust-store docs/evidence/artifacts/r82-compatibility-release/test-trust-roots.json \
  --channel stable --minimum-sequence 18

bun --no-install scripts/release.ts verify-history \
  --current docs/evidence/artifacts/r82-compatibility-release/validation-bom.json \
  --predecessor docs/evidence/artifacts/r82-compatibility-release/predecessor-17.json \
  --predecessor docs/evidence/artifacts/r82-compatibility-release/predecessor-16.json
```

Results are retained as `bom-verification.json` and `compatibility-matrix.json`; the matrix reports three retained BOMs and `rollingUpgradeSafe: true`.

A freshly compiled Linux CLI artifact was built with the fixture public trust root and run under failing `bun`, `bunx`, `node`, `npm`, `pnpm`, `npx`, and `tsx` sentinels. `compiled-self-check.json` reports:

- release `lyntty-cli-1.2.0-linux-x64`;
- 178 exact files;
- CLI and daemon version `1.2.0`;
- Wire `1.1` and all six required Pi capabilities.

`compiled-update-check-summary.json` proves:

- sequence 18 was accepted and persisted for Stable;
- signed sequence 17 replay was rejected after process restart;
- signed sequence 19 selecting CLI `1.1.0` was actionable despite its lower SemVer.

## Verification commands

```bash
bun test scripts/workflow-hardening.test.mjs scripts/release.test.ts
bun run --cwd packages/lyntty-wire test
bun run --cwd packages/lyntty-app test
bun run --cwd packages/lyntty-app typecheck
bun run --cwd packages/lyntty-cli test
bun run --cwd packages/lyntty-cli typecheck
bun run --cwd packages/lyntty-relay test
bun run --cwd packages/lyntty-relay typecheck
bun install --frozen-lockfile
bun pm untrusted
ruby -e 'require "yaml"; Dir[".github/workflows/*.yml"].each { |f| YAML.load_file(f, aliases: true) }'
# Extract non-PowerShell run blocks, replace GitHub expressions, then:
bash -n /tmp/lyntty-r82-shell/*.sh
shellcheck -S error /tmp/lyntty-r82-shell/*.sh
git diff --check
```

Results:

- App: 791 tests, 3,182 assertions, 87 files; typecheck passed.
- CLI: 582 tests, 1,265 assertions, 72 files; typecheck passed.
- Relay: 119 tests, 332 assertions, 19 files; typecheck passed.
- Wire: 33 tests, 76 assertions, 5 files; build/typecheck passed.
- Release/workflow focused suite: 16 tests passed.
- Frozen install made no dependency changes; `bun pm untrusted` reported 0 untrusted lifecycle scripts.
- All workflow YAML parsed; 68 Bash run blocks passed `bash -n` and error-level ShellCheck; `git diff --check` passed.

## Release/deploy failure behavior

- Candidate and promotion re-resolve every paginated channel release and require the exact published head plus retained predecessors.
- Promotion requires a higher BOM sequence and Android `versionCode`; candidate source must still be current protected `main`.
- Existing OCI candidate tags are resumable only at the exact signed digest.
- Promotion and rollback create or resume drafts, compare existing assets byte-for-byte, verify the exact asset set, and publish only after completion.
- Relay deployment shares the Stable serialization lock, accepts only GitHub Stable latest, rejects a non-advancing deployed sequence, verifies image signature/provenance/SBOM, and enters the root-only VPS path through a privileged shell.
- Once migration begins, `.migration-incomplete` persists across failure/cancellation and prevents a retry from starting the failed image. Pre-migration failures may restore the prior digest; post-migration failures remain stopped for explicit backup/restore and `doctor` validation.

## Not run / external acceptance

The following require protected GitHub environments or production infrastructure and were not run locally:

- `.github/workflows/native-signing.yml` with Apple notarization and Windows Authenticode identities;
- `.github/workflows/release-candidate.yml` with permanent Stable/Preview keys and Android inputs;
- `.github/workflows/release-promote.yml`, signed GitHub Releases, OCI push/signing, and repository immutable-release rules;
- `.github/workflows/release-rollback.yml` against two real retained releases;
- `.github/workflows/relay-deploy.yml` against production VPS state.

The Windows PowerShell block received static/YAML review only because `pwsh` is unavailable on this Linux host. These are explicit external gates, not local acceptance claims.

## Review

- Compatibility cryptography, replay, bounded fetch, and Wire consumer re-review: `APPROVE`; no P0/P1/P2.
- Final release supply-chain re-review after fixture-key, archive, rollback-head, and native execution-order fixes: `APPROVE — no P0/P1 supply-chain blockers.`
- Final workflow/operations re-review after duplicate-permission, native-primary, root-only restore, and signal fail-stop fixes: `APPROVE — no P0/P1 workflow/operations blockers.`
