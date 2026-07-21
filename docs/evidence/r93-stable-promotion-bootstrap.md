# R93 — Stable Promotion bootstrap ordering

Date: 2026-07-22

Branch: `fix/stable-promotion-bootstrap`

Bead: `lyntty-24v`

Implementation commit: `555808b9b73b35a895a6393b8b080468a12708c3` (GPG signature verified locally).

## Failure

Stable Promotion run `29848838205` stopped in `Validate protected promotion request` with `bun: command not found`. The request passed actor, protected-ref, immutable-release, tag-ruleset, and explicit owner-waiver checks, then invoked Bun to parse `gh run view` output before the later `Setup Bun` step.

The failure occurred before Candidate download, GHCR login/push, image signing, asset preparation, tag/Release creation, or production deployment. No publication side effect occurred.

## Fix

The pre-bootstrap Candidate-run identity check now uses already-available `jq` instead of Bun. Bun remains pinned and installed before every actual Bun command later in the job. A regression assertion scans all workflow text before `Setup Bun` and rejects any Bun command there while requiring the Candidate workflow identity check.

Because Promotion requires Candidate source to equal current protected `main`, merging this fix makes Candidate run `29844664891` stale. A replacement Candidate must rebuild all bytes from the new protected main; neither failed Promotion nor the stale Candidate may be reused.

## Verification

- hardening/redaction/Relay-SBOM: `32 pass / 0 fail`;
- all workflow YAML parsed;
- all `9` Promotion shell blocks passed `bash -n` and error-level ShellCheck;
- `git diff --check`: pass.

## Residual risk

This fix proves bootstrap ordering statically and through protected PR CI. The replacement Promotion remains the real end-to-end publication test and must still pass every immutable identity and byte gate.
