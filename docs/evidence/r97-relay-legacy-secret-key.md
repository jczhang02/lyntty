# R97 — Production Relay legacy master-secret key

Date: 2026-07-22

Branch: `fix/relay-legacy-secret`

Bead: `lyntty-24v.2`

## Production evidence

Protected deployment run `29864206703` re-verified current protected main, immutable Stable Release, signed BOM, exact Relay OCI digest and attestations, then authenticated with pinned SSH trust. It stopped before backup, service shutdown, migration, configuration write, or container replacement because `LYNTTY_MASTER_SECRET` had zero recognized assignments.

This refines R95 rather than weakening its gate. Tracked deployment evidence R65 records that the schema-1 VPS `.env` contains `HANDY_MASTER_SECRET`; R80 and the deployment guide require copying the exact bytes to `LYNTTY_MASTER_SECRET` before the schema-2 boundary.

## Fix

The canonicalization primitive now accepts `HANDY_MASTER_SECRET` only when:

- `LYNTTY_MASTER_SECRET` is completely absent;
- the legacy key has exactly one canonical or exported assignment;
- the file has no UTF-8 BOM or hidden/noncanonical target assignment;
- an ambient-isolated Docker Compose render proves the target key is absent before transformation;
- the exact raw value is nonempty and resolves to a nonempty, non-comment deployed service value after transformation.

It creates the same root-private `0600` backup, changes only the key prefix in a staged same-directory file, verifies the raw value is byte-identical and the legacy assignment is gone, atomically installs it, and records only key/form/backup metadata. Coexisting aliases, duplicate legacy keys, semantic empties, BOM-hidden target keys, parser failures, and value changes fail closed; post-transform validation failures atomically restore and verify the original bytes and permissions.

All signed-BOM, digest, attestation, protected-main, SSH, prior-runtime, incomplete-migration, backup, migrate, doctor, rollback, local health/version and public version gates remain unchanged.

## Verification

- behavioral tests cover canonical and exported legacy forms, exact backups and modes, byte-preserved values, idempotent retry, coexistence, duplicates, semantic empty, ambient overrides, BOM-hidden target assignments, restoration, and secret non-output;
- hardening/redaction/Relay-SBOM suite: `33 pass / 0 fail`;
- all workflow YAML parsed;
- all `5` Relay deployment shell blocks passed `bash -n` and error-level ShellCheck;
- `git diff --check`: pass.

## Residual risk

The next protected deployment is the first live proof that production still has exactly one supported legacy assignment and that its Compose model exposes the renamed target through `env_file`. Any mismatch remains fail-closed before service mutation.
