# R95 — Production Relay legacy `.env` canonicalization

Date: 2026-07-22

Branch: `fix/relay-env-canonicalization`

Bead: `lyntty-24v`

## Failure

Production deployment run `29858379372` verified the immutable Stable Release, signed BOM, exact Relay OCI digest, attestations, protected main, and pinned SSH host key. It authenticated to the VPS, then stopped before service shutdown, `.env` mutation, backup, migration, or container replacement because the existing `LYNTTY_MASTER_SECRET` was not exactly one canonical unprefixed assignment.

The failure confirmed the legacy environment needs a narrow migration; it did not justify sourcing `.env`, selecting among duplicates, printing the secret, or weakening the canonical-state gate.

## Fix

The protected deployment now accepts required `LYNTTY_MASTER_SECRET` and `LYNTTY_RELAY_IMAGE` only when each is either:

1. already exactly one canonical `KEY=value` assignment; or
2. exactly one exported assignment that can be normalized without changing its raw value.

For the second case it:

- rejects missing, duplicate, empty, unsupported, symlinked, or ambiguous state;
- writes a root-private `0600` backup before transformation;
- transforms into a separate same-directory `0600` file and atomically renames it;
- leaves the original untouched on transform/inspection/install failure;
- removes relevant ambient variables and validates the rendered `lyntty-relay` service environment/image through `docker compose --env-file .env config --format json`;
- rejects semantically empty, whitespace-only, or comment-only deployed values;
- atomically restores the exact backup on rendered-config failure and verifies bytes plus `root:600`;
- appends only key/form/backup metadata to a non-symlinked `0600` receipt, never the value.

All existing incomplete-migration, rollback, prior-runtime, backup, doctor, digest, local `/health`, local `/v1/version`, and public `/v1/version` gates remain after this preflight.

## Verification

- hardening/redaction/Relay-SBOM: `33 pass / 0 fail`;
- behavioral tests cover both required keys, exact backup bytes/modes, idempotent retry, duplicates/missing/raw and semantic empties, comment-only values, ambient override isolation, parser-failure restore, secret non-output, and dangling receipt symlinks;
- all workflow YAML parsed;
- all `5` Relay deployment shell blocks passed `bash -n` and error-level ShellCheck;
- `git diff --check`: pass;
- final adversarial review: `PASS`, no P0/P1/P2.

## Residual risk

The next protected deployment is the only test against the actual production Compose file and legacy assignment form. Any state outside the one safely normalizable exported assignment remains fail-closed and requires explicit operator repair.
