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

`standalone:dev` uses `.env.dev`, runs pending PGlite migrations, and starts the API on port 3005 by default.

## Compiled runtime

Build the standalone executable from the repository root:

```bash
bun run --cwd packages/lyntty-relay build:standalone
```

The output is `packages/lyntty-relay/dist/lyntty-relay`. The release artifact and container runtime do not require Bun or Node.

```text
lyntty-relay migrate
lyntty-relay serve
```

PGlite deployments may run `migrate` automatically from the container entrypoint. PostgreSQL deployments must run an explicit migration job before starting the new Relay version; serving against an unapplied schema must fail closed.

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
| `S3_HOST` | No | — | Enable S3-compatible attachment storage |
| `S3_PORT` | No | provider default | S3 port |
| `S3_USE_SSL` | No | `true` | S3 TLS setting |
| `S3_REGION` | No | `us-east-1` | S3 region |
| `S3_ACCESS_KEY` | S3 only | — | S3 access key |
| `S3_SECRET_KEY` | S3 only | — | S3 secret key |
| `S3_BUCKET` | S3 only | — | Attachment bucket |

`HANDY_MASTER_SECRET` is accepted only as a temporary compatibility fallback. New deployments must use `LYNTTY_MASTER_SECRET` without changing the secret value during migration.

Never commit secrets, production database URLs, auth tokens, pairing URLs, or attachment authorization material.

## Deployment

The production image contains the compiled Relay executable, PGlite assets, and immutable Prisma migrations. Pin deployments to a release digest and keep release publication separate from production rollout.

See [`../../docs/deploy/relay-vps.md`](../../docs/deploy/relay-vps.md) for the operator runbook.
