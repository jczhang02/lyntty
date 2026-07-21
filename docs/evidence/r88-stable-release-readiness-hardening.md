# R88 — First Stable release readiness hardening

Date: 2026-07-21

Branch: `fix/stable-release-hardening`

Bead: `lyntty-24v`

Implementation commits:

- `e6105043698480dd2227a6c184b11b206658c1b0` — signed Stable supply-chain hardening;
- `13b9c0f4fbf9259c67bf3509aae4fb116d01a068` — isolated Preview dirty-source fixture.

## Scope

This round prepares, but does not publish, the first complete Compatibility Stable line:

- App/CLI/Relay/Wire `1.2.0` / `1.2.0` / `1.2.0` / `0.2.0`;
- Stable sequence `1`, tag `compat-v1.2.0_1.2.0_1.2.0_0.2.0-s1`;
- Android package `dev.jczhang.lyntty`, `versionCode=6`, and continuity with production certificate SHA-256 `25e3928a7cc228254e8249e684c6ab661f5c87140e23db7406afc64af29f0cf5`;
- five signed/runtime-free CLI and `lynttyd` archives;
- multiarchitecture Relay OCI, signed Compatibility BOM, SBOM/provenance, immutable GitHub Release, and separately approved production Relay deployment.

No Candidate, native staging Release, Stable tag/Release, GHCR promotion, Android publication, or production deployment occurred in this round.

## Trust bootstrap

A new permanent Stable Ed25519 identity was generated as `stable-2026-01`, valid from sequence 1. The reviewed public store is `config/release-trust-roots/stable.json`:

- public store file SHA-256: `def81e7ccffac1915c5b792674876f0c24fb4b8df648da0f3d39e75e117b0608`;
- encrypted private backup: `~/.local/share/lyntty/release-secrets/stable-bom-2026-01.json.gpg`, mode `0600`;
- encrypted backup SHA-256: `974245cea5e15d76d2604d57ff726acff00e85976c7e0c3d75065792fd428482`.

The encrypted backup was decrypted through the local GPG identity in a pipe and its private seed was used only in memory to prove the derived public key matches the committed root. No seed, password, certificate, token, pairing URL, or VPS credential is recorded in repository evidence.

Candidate, Promotion, rollback, native staging, and Relay deployment now compare protected environment roots with the committed store. Preview Candidate/Promotion reject any public key reused from Stable, including when the channel stores are separate.

## Release transaction

`scripts/github-release.ts` provides one tested publication seam for Compatibility Promotion, rollback, and native staging:

- one exact Release ID and deterministic title/body/target;
- exact asset names, numeric IDs, state, size, GitHub API SHA-256 digest, and authenticated downloaded bytes;
- no asset/Release deletion, replacement, or clobber;
- repeated protected-main and current-latest checks;
- non-force creation of the exact direct tag, with interrupted retry accepting only that same tag/commit;
- one complete Release-ID `PATCH` followed by immutable/latest/tag/asset re-verification;
- audit-only retry for an already published exact immutable Release.

Stable Promotion additionally requires physical Android acceptance of the exact Candidate APK and its SHA-256. There is no Stable waiver mode.

## Native signing

`.github/workflows/native-signing-producer.yml` adds the missing producer path:

- matching `macos-26-intel`, arm64 `macos-26`, and `windows-2025` runners;
- ephemeral Developer ID keychain and Windows certificate-store import;
- exact four-executable inventory, architecture checks, explicit codesign/Authenticode, trusted timestamp, notarization/Gatekeeper, and runtime/tool checks;
- post-signing manifest regeneration that permits only executable-byte changes;
- strict Ubuntu transport verification that permits no subsequent byte change before deterministic archive creation;
- immutable `native-signing-*` staging through the exact Release transaction;
- independent `.github/workflows/native-signing.yml` metadata, trust-root, size, signature, runtime, and attestation verification before Candidate use.

The workflow was statically and locally reviewed only. Production Apple/Windows identities and services were not available and were not simulated.

## Relay deployment

The hardened deployment now requires current protected workflow source, current immutable Stable BOM, exact committed trust roots, pinned SSH host keys, and a digest-pinned healthy prior container. Before migration it atomically updates `.env`, verifies the new image label/runtime identity, and validates the backup plus sidecar. Failure before schema mutation must restore and verify the prior image/health or write `.rollback-incomplete`; failure after mutation stays stopped behind `.migration-incomplete`. Secret-bearing temporary `.env` files are trap-cleaned.

Acceptance requires the exact running container image plus local and public `/v1/version` fields for BOM id/sequence/hash and APK URL/hash. `/health` alone is insufficient. The production VPS path was not executed.

## Verification

Commands:

```bash
bun install --frozen-lockfile
bun pm untrusted
bun run ci:fast
bun test scripts/release.test.ts scripts/github-release.test.ts packages/lyntty-cli/scripts/build-artifact.test.ts
ruby -e 'require "yaml"; Dir[".github/workflows/*.yml"].each { |f| YAML.load_file(f, aliases: true) }'
# Extract 53 non-PowerShell run blocks from changed workflows, replace GitHub expressions, then:
bash -n /tmp/<isolated-shell-blocks>/*.sh
shellcheck -S error /tmp/<isolated-shell-blocks>/*.sh
git diff --check
```

Results:

- repository hardening/redaction: 26 passed;
- Wire: 34 tests, 77 assertions;
- CLI: 585 tests, 1,272 assertions;
- Relay: 119 tests, 332 assertions plus compiled smoke;
- App: 812 tests, 3,276 assertions across 90 files plus bundle smoke;
- isolated development/Preview lifecycle: 35 tests, 194 assertions;
- focused release/finalization suite: 22 passed, 96 assertions;
- YAML parse, 53 Bash syntax/error-level ShellCheck blocks, frozen install, lifecycle trust, audit, and `git diff --check`: passed.

The first `ci:fast` attempt exposed a test-only dirty-source fixture problem. The Preview import test now creates its synthetic source commit in a temporary Git object/index directory and removes it, rather than writing an unreachable stash object into the developer repository. The final complete gate passed.

## External blockers / not run

Publication remains fail-closed until all of these are real and independently approved:

- protected environments with a non-author reviewer and self-review disabled;
- active no-bypass update/deletion rulesets for `compat-v*` and `native-signing-*`;
- Android/Firebase/Expo secrets moved into Stable environments and certificate continuity proven by a Candidate;
- Apple Developer ID P12/notarization credentials and Windows Authenticode PFX/RFC3161 credentials;
- immutable native staging plus three successful verifier attestations;
- exact Stable Candidate and physical Android `5 → 6` upgrade/fresh-start acceptance bound to its APK hash;
- pinned VPS known-host material, canonical master-secret migration, digest-pinned healthy previous image, verified backup/restore drill, and maintenance approval.

These are release gates, not local acceptance claims. Missing credentials must not be replaced with self-signed identities or waived evidence.

## Independent verification

Two adversarial reviews found and drove fixes for Release tag binding, exact first-release identity, channel-key separation, native transport finalization, PowerShell native-command failure handling, Relay root/config/rollback behavior, and remote script stdin consumption. The final read-only verifier returned `PASS — no P0/P1/P2 implementation defects found`. It separately confirmed that no external signing, physical Android acceptance, publication, or deployment evidence exists yet.
