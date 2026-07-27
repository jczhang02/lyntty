# R122 — Stable Compatibility 1.2.2 release preparation

Date: 2026-07-27

Branch: `release/stable-1.2.2`

Bead: `lyntty-90z`

Base: `4a20aec65b76e3aa005be23402a12fc9a4fd80f9`

## Release identity

The next intended Stable Compatibility set is:

| Component | Version |
| --- | --- |
| App | `1.2.2` |
| CLI + `lynttyd` | `1.2.2` |
| Relay | `1.2.2` |
| Wire | `0.2.0` |

The intended immutable identity is:

```text
Sequence: 3
Android versionCode: 8
Tag: compat-v1.2.2_1.2.2_1.2.2_0.2.0-s3
Predecessor 1: compat-v1.2.1_1.2.1_1.2.1_0.2.0-s2
Predecessor 2: compat-v1.2.0_1.2.0_1.2.0_0.2.0-s1
```

The current immutable Stable Latest is sequence `2`, Android `versionCode` `7`, Release ID `360246346`, and source `f9698f4930294ee38ff914dfa6d7d0705bebc485`. Sequence `3` advances both monotonic coordinates and retains the complete current-plus-two Stable support window.

## Component version decisions

App, CLI, and Relay all changed since Stable 1.2.1:

- App integrates canonical Pi name persistence, stable-tag deletion tombstones, generation-safe progressive discovery, delayed-page protection, and authoritative history cursors.
- CLI/`lynttyd` integrates encrypt-once outbox retries, exact localId inventory, append-checkpoint recovery, progressive-history coverage, bounded metadata ACKs, managed-runtime rebind safety, and the corrected service PATH.
- Relay returns structured localId-content conflicts while retaining strict same-localId/different-ciphertext rejection.

Those three components therefore advance to `1.2.2`. Wire schemas, protocol `1.1`, and capability negotiation did not change, so Wire remains `0.2.0`.

`bun.lock` contains the same three workspace version updates. Relay's standalone build-identity regression expects `1.2.2`.

## Test-first version binding

After the three package identities and lockfile were advanced, the unchanged Relay identity test failed as intended:

```text
Expected version: 1.2.1
Received version: 1.2.2
5 pass, 1 fail
```

After updating the explicit release identity assertion:

```text
packages/lyntty-relay: bun test --isolate sources/standalone.spec.ts
6 pass, 0 fail
```

This prevents package metadata and the compiled Relay runtime identity from drifting independently.

## Local verification

```text
bun install --frozen-lockfile
bun pm untrusted
bun run ci:fast
```

Result:

- frozen install: pass;
- untrusted dependency scripts: `0`;
- repository hardening: `85 pass`, `0 fail`;
- dependency audit: no vulnerabilities;
- Wire: `36 pass`, `0 fail`;
- CLI: `656 pass`, `0 fail`;
- Relay: `120 pass`, `0 fail`;
- App: `878 pass`, `0 fail`, `3411` assertions across `99` files, bundle smoke pass;
- isolated development scripts: `36 pass`, `0 fail`;
- independent docs frozen install/audit/check: no vulnerabilities; `42` pages prepared; MDX generation and TypeScript checks passed;
- `git diff --check`: pass.

## Publication state

No Candidate workflow, tag, GitHub Release, GHCR promotion, production Relay deployment, local CLI update, daemon restart, extension reload, or live-session reconciliation was performed during release preparation.

Candidate and Promotion must run from the exact then-current protected `main`. The Candidate must use Stable sequence `3`, Android `versionCode` `8`, and the exact two predecessors above. Promotion must consume that exact successful Candidate and must not rebuild any artifact.

## Not run and residual risk

- The production-signed APK, five standalone CLI archives, multiarchitecture Relay OCI layout, signed BOM, SPDX SBOMs, provenance, and attestations are produced only by the protected Candidate workflow and are not claimed here.
- No physical Android validation was performed or claimed. Promotion must use workflow inputs `physical_phone_accepted=false` and an empty `accepted_android_apk_sha256`; the generated schema-2 `android-validation.json` records `mode: false`, `physicalPhoneAccepted: false`, `authorizationMode: "optional-not-performed"`, and the exact Candidate `apkSha256`.
- Production Relay deployment and local `lyntty`/`lynttyd` update remain separate post-release operations.
- Workflow-generated Release notes remain authoritative. No curated title/body edit is included.
- Preview, Expo Dev, native-signing staging, rollback, existing tags, and existing Releases remain untouched.
