# R92 — Explicit owner waiver for Stable Android physical validation

Date: 2026-07-21

Branch: `fix/stable-owner-validation-waiver`

Bead: `lyntty-24v`

Implementation commit: `895901a9b645122d0b9b188d5d934a2d3bfef5a4` (GPG signature verified locally).

## Decision

The owner explicitly determined that physical Android validation is unnecessary for this owner-operated self-use Stable release. This supersedes the earlier first-Stable policy that had no waiver path; it does not turn missing validation into a passing result.

The last audited Candidate, run `29836884743`, remains recorded as `physicalPhoneAccepted=false`. Because Promotion requires Candidate source to equal current protected `main`, merging this policy change makes that Candidate stale and requires a complete rebuild from the new protected main. Its bytes cannot be silently reused.

## Guarded waiver

Stable Promotion now has two mutually exclusive paths:

1. `physical_phone_accepted=true`, empty waiver, and the exact physically accepted APK SHA-256; or
2. `physical_phone_accepted=false`, empty accepted hash, and exact phrase `I accept publishing this exact Stable Candidate without physical Android validation`.

Preview must keep the Stable waiver input empty. Both paths retain protected-main freshness, Candidate attestation/checksums, signed BOM, Android production signer pin, immutable APK digest, protected Environment approval, tag ruleset, Release/asset ID binding, and post-publication byte verification.

For a waiver release, `android-validation.json` is checksummed, attested, and published with:

```json
{
  "schemaVersion": 1,
  "mode": false,
  "authorizationMode": "owner-waiver-unverified",
  "physicalPhoneAccepted": false,
  "apkSha256": "<exact Candidate APK SHA-256>",
  "ownerWaiverAcknowledgement": "I accept publishing this exact Stable Candidate without physical Android validation"
}
```

The immutable Release body begins with a deterministic bilingual warning that the exact APK was not physically validated. It also retains the disclosure that macOS and Windows archives are intentionally not platform code-signed.

## Verification

- `bun run ci:fast`: pass;
- hardening/redaction/Relay-SBOM: `32 pass / 0 fail`;
- behavioral tests cover physical/waiver mutual exclusion, exact phrase, empty accepted hash, boolean `mode=false`, exact APK digest, deterministic leading warning, and inconsistent-record rejection;
- all workflow YAML parsed;
- all `9` Promotion shell blocks passed `bash -n` and error-level ShellCheck;
- `git diff --check`: pass.

## Residual risk

Physical-device installation, `versionCode 5 → 6` upgrade, launch, and Relay behavior remain unverified by explicit owner decision. Release integrity and identity checks do not substitute for those user-path tests; the public warning and audit asset preserve that distinction.
