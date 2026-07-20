# R86 — Android Preview APK prerelease

Date: 2026-07-20

Status: implementation ready for protected PR; candidate not yet built or published

## Scope

This release path publishes only the developer Android Preview package:

```text
applicationId: dev.jczhang.lyntty.preview
versionName: 1.2.0
versionCode: 920001
ABIs: arm64-v8a, x86_64
Tag: android-preview-v1.2.0-920001
Title: V1.2.0 Local First 📡
```

It does not publish or deploy Stable Android, CLI/daemon archives, Relay OCI, Compatibility BOM, a hosted Preview Relay, Google Play, or OTA updates.

## Preview first-run contract

Preview now requires a persisted, validated Relay before authentication or sync can initialize:

- no configured or policy-invalid Relay means stored credentials are cleared without being read or restored;
- credential deletion failures stop bootstrap or Relay replacement before the new URL can be persisted;
- deep links cannot mount account routes, and the sync/navigation graph is lazy-loaded only after setup, while **Connect to Relay** uses an independent route group with no business index;
- validation probes canonical `GET /health` and requires `status: ok` plus `service: lyntty-relay`;
- Preview HTTP accepts only localhost, loopback, private RFC1918/CGNAT IPv4, or local IPv6; HTTPS remains available;
- existing valid custom Relay settings survive an in-place Preview update;
- changing or clearing Relay clears old authentication/sync state;
- Stable keeps its production HTTPS and public default behavior.

## Candidate and promotion boundary

`.github/workflows/android-preview-candidate.yml` builds once from exact protected `main`, audits the APK, sole signer, and Bun-only execution boundary, generates SHA-256/provenance/Mole-style bilingual notes plus a strict content manifest, attests both APK and manifest, and uploads a 30-day candidate artifact. It has no contents-write permission and cannot create a Release.

After the candidate SHA-256 is reviewed into `scripts/preview-apk-allowlist.json`, the exact candidate must pass physical Android update and fresh-start testing. Candidate-to-Promotion source changes are restricted to the exact allowlist and R86 Candidate evidence files. Repository immutable releases and an update/deletion-blocking `android-preview-v*` tag ruleset are external Promotion gates, persisted as separately reviewed repository variables after admin-API verification. `.github/workflows/android-preview-promote.yml` accepts only that run id and tested SHA-256, requires explicit physical acceptance, verifies protected refs, the exact reviewed delta, both attestations, all manifest/provenance/audit fields, the five release assets immediately before and after publication, immutable tag identity, `isImmutable=true`, and final protected `main`. Promotion does not build and remains idempotent for an already exact immutable prerelease.

## Verification completed before candidate

- focused URL/health policy tests went red before implementation and pass afterward;
- focused bootstrap policy tests went red before implementation and pass afterward, including deletion failure and deep-link route blocking;
- workflow hardening tests went red while the two workflows were absent and pass afterward;
- GitHub admin API confirms immutable releases are enabled; active no-bypass tag ruleset `19203462` blocks `update` and `deletion` for `refs/tags/android-preview-v*`; matching repository gate variables are set;
- TypeScript and i18n gates pass for the implemented App surface.

Final local `bun run ci:fast` passed at the review-hardened head: repo hardening 19; Wire 33; CLI 585; Relay 119 / 332 assertions; App 809 / 3,268 assertions across 89 isolated files; dev/Preview lifecycle 35 / 194 assertions. Both workflows also passed YAML parsing, extracted Bash ShellCheck, and `git diff --check`. Protected PR CI is still pending.

## Not run yet

- GitHub candidate workflow;
- APK audit on the `920001` candidate;
- in-place physical update from `910003` to `920001`;
- fresh-data mandatory Relay setup, Android Back behavior, Clear Relay re-gating, pairing, Pi message round trip, and reopen;
- public Promotion workflow.

No public Release exists from this work at this stage.
