# R80 — Relay standalone, migration, backup, and recovery evidence

Date: 2026-07-18

Branch: `refactor/bun-migration`

Bead: `lyntty-6o0.5`

## Scope

This round completes the Relay delivery boundary required before release orchestration:

- compiled `lyntty-relay` commands for `migrate`, `doctor`, `backup`, `restore`, and `serve`;
- PGlite automatic immutable migration and explicit PostgreSQL migration jobs;
- fail-closed migration checksum, unfinished-state, schema-minimum, and complete applied-set attestation checks;
- cross-process PGlite lifecycle leases and PostgreSQL lifetime shared/exclusive schema leases;
- canonical `LYNTTY_MASTER_SECRET` with the legacy-name fallback machine-bounded to Relay schema 1;
- private, fsynced, atomic backup plus SHA-256 sidecar and destructive restore requiring `--force`;
- PGlite failed-restore directory recovery and PostgreSQL single-transaction restore;
- digest-pinned Bun builder and PostgreSQL 17 runtime bases;
- runtime-free Relay image with PostgreSQL 17 clients and direct executable entrypoint;
- non-publishing amd64/arm64 image verification workflow with QEMU configured for arm64.

The Relay remains API-only. Pi JSONL remains canonical history; Relay storage remains encrypted sync state, metadata, queues, and caches.

## Safety boundaries

- All PGlite state lived under ignored `packages/lyntty-relay/dist/test-state` paths and was removed after each gate.
- PostgreSQL used temporary Podman containers with tmpfs data and local-only credentials; every container was removed.
- No production Relay, production database, VPS, live `~/.lyntty`, Pi environment, or tmux pane was touched.
- No image was pushed and no production deployment workflow was run.
- Large state was kept out of `/tmp`; generated test state was cleaned after completion.

## Verification

### Relay suite and compiled lifecycle

```bash
bun run --cwd packages/lyntty-relay test
bun run --cwd packages/lyntty-relay typecheck
bun run --cwd packages/lyntty-relay build:standalone
bun run --cwd packages/lyntty-relay test:compiled
```

Results:

- Relay: **110 passed, 0 failed, 317 assertions, 18 files**.
- TypeScript: passed.
- Compiled lifecycle: migration, doctor, backup/restore, health, signal shutdown, live-PGlite backup refusal, and forbidden-runtime sentinel passed.
- The compiled gate put failing `bun`, `node`, `npm`, `pnpm`, `npx`, and `tsx` sentinels first on `PATH`; none ran.

Retained summaries: `docs/evidence/artifacts/r80-relay/relay-tests.txt` and `compiled-smoke.txt`.

The old-PGlite test removes compatibility metadata, nulls a legacy migration checksum, retains an `Account` row, reruns migration, and proves both data preservation and a compatible final state.

### Migration compatibility and concurrency

The tracked integration gate is reproducible with:

```bash
bun run --cwd packages/lyntty-relay test:postgres
```

It uses a digest-pinned PostgreSQL 17 container and covers:

- fresh database rejects `doctor`/`serve` before explicit migration;
- legacy null checksums reject serving and are backfilled only by `migrate`;
- known checksum mismatch and unfinished migration fail closed;
- stale metadata cannot bless an unknown migration inserted before the known head;
- valid additive compatibility requires head, head checksum, applied count, and deterministic SHA-256 over the complete active migration set;
- contract metadata requiring Relay schema 2 rejects this schema-1 binary;
- a serving PostgreSQL Relay holds a shared advisory schema lease for its lifetime, and an explicit migration job waits on the exclusive lease until shutdown;
- an existing `Account` row survives legacy-metadata migration;
- `HANDY_MASTER_SECRET` remains byte-compatible at schema 1, while schema 2 requires the canonical variable and preserves the existing crypto-domain identifiers.

Result: fresh/old migration, complete-set additive compatibility, contract rejection, failed-migration rejection, data preservation, and lifetime migration serialization passed against PostgreSQL 17. The retained non-secret result is `docs/evidence/artifacts/r80-relay/postgres-integration.txt`; the complete gate is reproducible from the executable tracked script.

### Backup and restore

PGlite and PostgreSQL gates verified:

- backup and checksum files are mode `0600`;
- temporary files are privately precreated and fsynced before atomic commit;
- `--force` replaces the prior regular file by rename without first unlinking it;
- destination operation locks serialize competing backup/restore commands;
- PGlite backup/restore rejects a live Relay lease;
- symlink aliases resolve to one PGlite lease identity;
- backup destinations inside PGlite are rejected through direct paths, symlinked parents, and replaceable final-component symlinks;
- backup destinations and restore sources cannot be the PGlite data directory;
- restore requires a matching SHA-256 sidecar and explicit `--force`;
- PGlite imports into a replacement directory and restores the prior directory after failure;
- PostgreSQL credentials stay in libpq environment variables rather than argv;
- real `pg_dump` 17 and `pg_restore --single-transaction --exit-on-error` succeeded, and restore returned a backed-up probe row from its post-backup value to its captured value.

### OCI runtime

```bash
bun run --cwd packages/lyntty-relay test:container
# rebuilds the image, then runs isolated PGlite and PostgreSQL 17 lifecycle gates
```

Local validation image ID:

```text
c6c464a0dc1104b43d8098018ee4b5df6eb8f044874c492504f865e91ec5a339
```

Result:

- no `bun`, `node`, `npm`, `pnpm`, `npx`, or `tsx` executable in runtime image;
- `flock`, `pg_dump`, and `pg_restore` present; PostgreSQL client major version is 17;
- direct image arguments dispatch migration, doctor, backup, and restore;
- default image command serves and returns `{"status":"ok","service":"lyntty-relay"}`;
- PGlite and PostgreSQL 17 backup/restore drills passed.

The retained non-secret result is `docs/evidence/artifacts/r80-relay/container-smoke.txt`; the full gate is reproducible from the tracked script.

Both Docker base references are pinned to multiarchitecture index digests. The workflow configures commit-pinned QEMU before Buildx and requests `linux/amd64,linux/arm64` without publishing.

### Repository hardening

```bash
bun install --frozen-lockfile
bun pm untrusted
bun audit
bun run test:repo-hardening
bun -e '<parse .github/workflows/relay-image.yml>'
bun test scripts/evidence-redaction.test.mjs
git diff --check
```

Results: frozen install made no changes, lifecycle audit reported **0 untrusted dependencies**, dependency audit reported no vulnerabilities, repository workflow/evidence hardening passed, workflow YAML parsed, evidence redaction passed, and whitespace validation passed.

## Independent review

Three review rounds drove fixes for:

- stale and incomplete migration compatibility attestations;
- legacy missing checksums incorrectly passing serve;
- private temporary-file creation and force-replacement atomicity;
- backup destination serialization;
- PostgreSQL inspect/start migration races;
- image entrypoint command swallowing;
- diagnostic creation of typo PGlite directories;
- PGlite quiescence and symlink-alias locking;
- final-component symlink write-location containment;
- missing arm64 QEMU setup;
- missing explicit PostgreSQL restore database selection.

The final targeted reviewer found no unresolved P0/P1 and ended **APPROVE**.

## Residual gates

Not claimed in this round:

- the amd64/arm64 GitHub image workflow has not yet run on this commit;
- the image has not been pushed to GHCR and has no release digest yet;
- SBOM, provenance, digest signature, component SemVer, channel metadata, and Compatibility BOM belong to the release task;
- no production Relay migration/deploy or production restore was attempted;
- Redis and S3 integration behavior was not changed and was not exercised against live external services;
- the local image is an unsigned validation artifact, not a promoted release.
