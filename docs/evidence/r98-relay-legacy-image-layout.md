# R98 — Production Relay legacy image layout

Date: 2026-07-22

Branch: `fix/relay-legacy-image`

Bead: `lyntty-24v.3`

## Production evidence

Protected deployment run `29866546707` re-verified protected main, the immutable Stable Release, signed BOM, exact Relay OCI digest and attestations, and pinned SSH trust. It successfully completed the R97 `HANDY_MASTER_SECRET → LYNTTY_MASTER_SECRET` migration, proving the value-preserving key change live. It then stopped before service shutdown, database backup/migration, target configuration, or container replacement because `LYNTTY_RELAY_IMAGE` had zero assignments.

Public Relay remained healthy and continued serving the prior Android update metadata (`versionCode=5`). R65 source and deployment evidence identify the remaining layout:

- Compose image: `ghcr.io/jczhang02/lyntty-relay:${LYNTTY_RELAY_IMAGE_TAG}`;
- env tag: `LYNTTY_RELAY_IMAGE_TAG=sha-9752c689c927`;
- persistent data bind, but no `/backups` bind in the original Compose model.

## Fix

The protected deploy now accepts only that exact R65 layout (plus a bounded hardcoded equivalent and generated interruption states). Before stopping Relay it:

1. rejects symlinks, incomplete markers, BOM/CR/tab/NUL input, external Compose inputs, YAML anchors/aliases/merges/tags/escaped or explicit keys, duplicate services/images, and ambiguous mounts;
2. pins an explicit Compose project/file/env boundary with ambient Compose and Lyntty variables removed;
3. proves the rendered R65 tag, sole running container reference, container image ID, configured local image ID, sole same-repository `RepoDigest`, immutable pull, and post-pull image ID all identify the same bytes;
4. creates exact root-private env/Compose backups;
5. stages only the image scalar, digest assignment, and missing `/opt/lyntty/backups:/backups` bind, then verifies the rendered staged model;
6. atomically installs env first and Compose second. The validated legacy tag remains during this phase so both possible SIGKILL intermediate states are retryable; the later target-env transaction removes it;
7. restores both backups unconditionally on any noncommitted exit and verifies the still-running prior bytes, writing `.rollback-incomplete` if recovery cannot be proven.

The normal pre-schema rollback now prepares a private Compose override that maps `HANDY_MASTER_SECRET` from the exact canonical `LYNTTY_MASTER_SECRET` only when restarting the prior R65 image. The override is rendered and equality-checked without output, removed after successful recovery/deploy, and retained with a `0600` blocking marker if restart verification fails. Every identity check returns explicitly even when called from a Bash OR-list.

All signed-BOM, target-digest, backup checksum, migration marker, `migrate`, `doctor`, local health/version, public version, and fail-stop gates remain.

## Verification

- full `bun run ci:fast`: pass (Wire, CLI, Relay, App, bundle smoke, isolated lifecycle);
- hardening/redaction/Relay-SBOM suite: `35 pass / 0 fail`;
- behavioral migration coverage: exact R65 variable and hardcoded forms, generated env-first retry, canonical retry, paired backup bytes/modes, persistent backup mount, malformed/escaped/tagged YAML, foreign/multiple digests, image-ID mismatch, stopped/multiple containers, env/Compose rename failures, post-install failure, and secret non-output;
- behavioral pre-schema rollback coverage: compatibility alias equality, prior-image restart/verification, override cleanup, and blocking-marker behavior;
- workflow YAML parse: pass;
- all `5` Relay deployment shell blocks: `bash -n` and error-level ShellCheck pass;
- `git diff --check`: pass;
- final adversarial review: `PASS`, no P0/P1/P2.

## Residual risk

The next protected deployment is the first live proof of the exact raw R65 image layout, local `RepoDigests` cardinality, staged backup bind, old-image compatibility restart path, and final target deployment. Every mismatch remains a pre-stop failure; no waiver is allowed.
