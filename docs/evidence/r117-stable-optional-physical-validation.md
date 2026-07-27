# R117 — Optional Stable physical-device validation

Date: 2026-07-26

Branch: `release/stable-1.2.1`

Bead: `lyntty-mpr`

Base: `57ae1ccf0bff974b29bd7dcf7e356b06fa648ed4`

## Decision

The owner explicitly changed the Stable Compatibility release policy: physical Android validation is optional, and a release without it does not require a waiver phrase or a public Release-body warning.

This policy applies only to Stable Compatibility promotion. It does not alter APK-only Preview's separate reviewed waiver path, production Android signing continuity, Compatibility BOM signing, source binding, protected environments, immutable Releases, tag rulesets, checksums, provenance, attestations, Relay image identity, predecessor history, sequence monotonicity, or Android `versionCode` monotonicity.

## Implementation

- `physical_phone_accepted=false` is accepted only with an empty accepted APK hash.
- `physical_phone_accepted=true` still requires a lowercase SHA-256 that matches the exact Candidate APK bytes during Promotion.
- The obsolete Stable waiver input and acknowledgement phrase are removed.
- A false value no longer adds an unverified-device warning or status line to the Release body.
- The checksummed and attested `android-validation.json` advances to schema 2 and records either `physical-phone` or `optional-not-performed` plus the exact APK digest.
- Stable runbooks, FAQ guidance, and release-agent rules describe the new policy. APK-only Preview disclosure requirements remain unchanged.

## Test-first evidence

The hardening tests were changed before the workflow and helper. The first focused run failed in the three expected Stable-policy cases:

```text
bun test --timeout 20000 scripts/workflow-hardening.test.mjs
28 pass, 3 fail
```

After implementing the policy:

```text
bun test --timeout 20000 scripts/workflow-hardening.test.mjs
31 pass, 0 fail
```

The focused coverage proves that:

- Stable Promotion has no waiver input or warning generator;
- false plus an empty accepted hash succeeds;
- false plus a hash fails;
- true plus the exact-format hash succeeds and an empty hash fails;
- any other boolean representation fails;
- schema-2 audit output is deterministic for both modes;
- Candidate bytes are still verified and no build command enters Promotion.

## Publication state

No Candidate, tag, GitHub Release, GHCR promotion, or production Relay deployment was created while implementing this policy. Stable `1.2.1` publication remains a later protected workflow operation.

## Residual risk

A Stable release may now be published without evidence that the exact APK installs, launches, or completes a real phone-to-Relay-to-`lynttyd` path on a physical device. This is intentional owner policy. The workflow still prevents that unperformed validation from being recorded as accepted and retains all non-device artifact and supply-chain gates.
