# Lyntty Relay

Lyntty Relay is the self-hosted API and encrypted synchronization service used by the Lyntty Android app and `lynttyd`.

## Runtime boundary

- The Android app connects to the Relay for pairing, encrypted session state, queued input, attachments, and push registration.
- Only `lynttyd` connects computer-side Pi sessions to the Relay.
- The Pi extension talks only to local `lynttyd`; it never connects to the public Relay.
- Pi JSONL is canonical history. Relay data is encrypted sync state, queues, metadata, and caches.
- Relay is API-only. It does not serve a browser client or static web app.

Relay stores message and metadata ciphertext without the client data keys. Authentication and operational metadata are still security-sensitive and must be protected like any production service.

## Development

From the repository root:

```bash
bun install --frozen-lockfile
bun run --cwd packages/lyntty-relay typecheck
bun run --cwd packages/lyntty-relay test
bun run --cwd packages/lyntty-relay standalone:dev
```

`standalone:dev` uses `.env.dev`, runs pending PGlite migrations, and starts the API on port 3005 by default. With Podman available, `bun run --cwd packages/lyntty-relay test:postgres` runs the real PostgreSQL 17 migration/lease gate and `test:container` rebuilds and drills the runtime image.

## Compiled runtime

Build the standalone executable from the repository root:

```bash
bun run --cwd packages/lyntty-relay build:standalone
```

The output is `packages/lyntty-relay/dist/lyntty-relay`. The release artifact and container runtime do not require Bun or Node.

```text
lyntty-relay migrate
lyntty-relay doctor [--json]
lyntty-relay backup <path> [--force]
lyntty-relay restore <path> --force
lyntty-relay serve
```

PGlite `serve` applies immutable migrations automatically. PostgreSQL deployments must run an explicit migration job before starting the new Relay version; both `doctor` and `serve` fail closed on pending, unfinished, checksum-mismatched, or contract-incompatible schemas.

`backup` writes a private atomic PGlite data-directory tarball or a PostgreSQL custom-format dump plus a SHA-256 sidecar. `restore` requires that sidecar and explicit `--force`; PGlite swaps back to the old data directory if import fails, while PostgreSQL uses `pg_restore --single-transaction --exit-on-error`. PGlite lifecycle commands use a cross-process lease and reject backup/restore while Relay is live; stop Relay first and keep backup files outside `PGLITE_DIR`. PostgreSQL backup may run online, but restore belongs in a maintenance window and both providers require a tested restore drill.

PostgreSQL tools receive credentials through libpq environment variables, never process arguments. The container includes PostgreSQL 17 client tools; `pg_dump` 17 can back up supported older servers and PostgreSQL 17.

## Storage

PGlite is the default database and persists under `PGLITE_DIR`. PostgreSQL is optional and selected explicitly with `DB_PROVIDER=postgres` plus `DATABASE_URL`.

Encrypted attachments use the local filesystem by default. Setting `S3_HOST` enables S3-compatible storage.

| Variable | Required | Default | Purpose |
| --- | --- | --- | --- |
| `LYNTTY_MASTER_SECRET` | Yes | — | Relay authentication and server-side key derivation |
| `DB_PROVIDER` | No | `pglite` | `pglite` or `postgres` |
| `DATABASE_URL` | PostgreSQL only | — | PostgreSQL connection URL |
| `DATA_DIR` | No | `./data` | Base local state directory |
| `PGLITE_DIR` | No | `<DATA_DIR>/pglite` | PGlite database directory |
| `PUBLIC_URL` | Recommended behind a proxy | Request origin | Public base URL for local attachment transfer |
| `PORT` | No | `3005` | API port |
| `HOST` | No | `0.0.0.0` | API bind address |
| `REDIS_URL` | No | — | Socket.IO multi-process adapter |
| `LYNTTY_RELEASE_TRUST_ROOTS` | Required for Android updates | — | Reviewed public Ed25519 roots plus Stable/Preview package, certificate, and image pins |
| `LYNTTY_STABLE_BOM_URL` | No | GitHub latest Stable BOM | Override signed Stable Compatibility BOM discovery |
| `LYNTTY_PREVIEW_BOM_URL` | Preview only | — | Explicit signed Preview BOM; never falls back to Stable |
| `LYNTTY_STABLE_MINIMUM_BOM_SEQUENCE` | No | `0` | Persistent operator replay floor for Stable metadata |
| `LYNTTY_PREVIEW_MINIMUM_BOM_SEQUENCE` | No | `0` | Persistent operator replay floor for Preview metadata |
| `S3_HOST` | No | — | Enable S3-compatible attachment storage |
| `S3_PORT` | No | provider default | S3 port |
| `S3_USE_SSL` | No | `true` | S3 TLS setting |
| `S3_REGION` | No | `us-east-1` | S3 region |
| `S3_ACCESS_KEY` | S3 only | — | S3 access key |
| `S3_SECRET_KEY` | S3 only | — | S3 secret key |
| `S3_BUCKET` | S3 only | — | Attachment bucket |

`HANDY_MASTER_SECRET` is accepted only while Relay schema compatibility remains at version 1. The fallback closes at the schema-2 contract boundary; new deployments must use `LYNTTY_MASTER_SECRET`, and existing operators must copy the exact same secret bytes to the canonical name rather than rotate the secret during migration.

Never commit secrets, production database URLs, auth tokens, pairing URLs, or attachment authorization material.

## Deployment

The production image contains the compiled Relay executable, PGlite assets, immutable Prisma migrations, and PostgreSQL 17 backup/restore clients. It contains no Bun or Node executable. The image verification workflow builds both `linux/amd64` and `linux/arm64` without publishing.

Migration jobs maintain `_lyntty_schema_compatibility`, including an attestation over the complete applied migration set. Additive future migrations remain usable by an older Relay only when the database explicitly declares a compatible minimum Relay schema and the complete-set attestation is current. Contract migrations raise that minimum, causing older binaries to fail closed. PostgreSQL serve holds a shared schema lease for its lifetime while migration jobs take the exclusive lease. This is the expand–migrate–contract rollback boundary; never edit or delete applied migration files.

Pin deployments to a release digest and keep release publication separate from production rollout.

See [`../../docs/deploy/relay-vps.md`](../../docs/deploy/relay-vps.md) for the operator runbook.
