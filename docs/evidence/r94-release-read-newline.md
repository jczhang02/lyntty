# R94 — Newline-safe release identity reads

Date: 2026-07-22

Branch: `fix/release-read-newline`

Bead: `lyntty-24v`

Implementation commit: `cf0100501356861fc91538b60a368678e087b380` (GPG signature verified locally).

## Failure

Stable Promotion run `29853303938` independently verified Candidate `29849923597`, revalidated protected main and channel head, installed registry tools, and logged in to GHCR. It then stopped at the first line of `Promote existing Relay OCI bytes by digest`.

The process substitution emitted repository and digest with `process.stdout.write(...)` but no trailing newline. Bash `read` populated its fields and returned nonzero at EOF; `set -e` stopped the step before `skopeo inspect`, `skopeo copy`, image signing, asset preparation, tag/Release creation, or production deployment. No GHCR write or public Release occurred.

The production Relay deployment workflow contained the same latent pattern for its eight BOM identity fields.

## Fix

Both Bun producers now use `console.log(...)`, guaranteeing a terminating newline so Bash `read` returns success. Hardening tests bind both `read` consumers to newline-terminated producers and reject the old `process.stdout.write` form.

Promotion's current-main gate means Candidate `29849923597` becomes stale after this fix merges. The next attempt must rebuild all Candidate bytes from the new protected main.

## Verification

- hardening/redaction/Relay-SBOM: `32 pass / 0 fail`;
- all workflow YAML parsed;
- all `14` Promotion/deployment shell blocks passed `bash -n` and error-level ShellCheck;
- `git diff --check`: pass.

## Residual risk

The replacement Promotion remains the real GHCR/Release transaction test. Production Relay deployment still requires its separate protected environment and trusted VPS inputs.
