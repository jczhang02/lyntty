# Relay VPS deployment runbook

Date: 2026-07-06
Status: deployed on `relay-hk` 2026-07-07; see `docs/evidence/r65-relay-vps-deploy.md`
Related: `docs/standardization/PLAN.md`

## Purpose

Run personal-use Lyntty relay at:

```text
https://relay.jczhang.cc
```

The relay routes/authenticates/caches encrypted state. It does not own canonical Pi history; Pi JSONL on the node remains canonical.

## Target topology

```text
Android app / lynttyd
        |
        | HTTPS / WebSocket
        v
Cloudflare DNS-only A record relay.jczhang.cc -> VPS IP
        |
        v
Caddy on VPS :443
        |
        v
Docker Compose service lyntty-relay :3005
        |
        v
/opt/lyntty/data  (PGlite + local files)
```

Decisions:

- Cloudflare record starts **DNS-only** (gray cloud), not proxied.
- Caddy terminates HTTPS directly and obtains Let’s Encrypt certificates.
- VPS runs the prebuilt, runtime-free GHCR image; it does not clone the repository or build source.
- PGlite and uploaded files persist under `/opt/lyntty/data`.
- `LYNTTY_MASTER_SECRET` stays on the VPS and in a password manager/encrypted backup, not GitHub Secrets.

## VPS prerequisites

- Linux VPS with Docker Engine and Docker Compose plugin.
- Caddy installed on host.
- Firewall allows inbound `80/tcp` and `443/tcp`; SSH restricted to owner IPs if practical.
- Cloudflare DNS:
  - Type: `A`
  - Name: `relay`
  - Target: VPS IPv4
  - Proxy status: DNS only
- Directory layout:

```bash
sudo mkdir -p /opt/lyntty/data /opt/lyntty/backups /opt/lyntty/scripts
sudo chown -R root:root /opt/lyntty
sudo chmod 700 /opt/lyntty
```

## Secrets

Generate `LYNTTY_MASTER_SECRET` once on the VPS:

```bash
openssl rand -base64 48
```

Write `/opt/lyntty/.env`:

```dotenv
LYNTTY_MASTER_SECRET=<redacted-random-secret>
PUBLIC_URL=https://relay.jczhang.cc
PORT=3005
DATA_DIR=/data
PGLITE_DIR=/data/pglite
LYNTTY_RELAY_IMAGE_TAG=sha-<shortsha>
```

Permissions:

```bash
sudo chmod 600 /opt/lyntty/.env
```

Do not store `LYNTTY_MASTER_SECRET` in GitHub Actions. The deploy workflow only needs SSH access and an image tag. Existing Relay-schema-1 deployments using `HANDY_MASTER_SECRET` must copy the exact same secret bytes to `LYNTTY_MASTER_SECRET` before the schema-2 contract boundary; do not rotate the value during the name migration.

## Docker Compose

`/opt/lyntty/docker-compose.yml`:

```yaml
services:
  lyntty-relay:
    image: ghcr.io/jczhang02/lyntty-relay:${LYNTTY_RELAY_IMAGE_TAG}
    restart: unless-stopped
    env_file:
      - /opt/lyntty/.env
    environment:
      DATA_DIR: /data
      PGLITE_DIR: /data/pglite
      PORT: "3005"
    volumes:
      - /opt/lyntty/data:/data
      - /opt/lyntty/backups:/backups
    ports:
      - "127.0.0.1:3005:3005"
```

Start:

```bash
cd /opt/lyntty
sudo docker compose pull
sudo docker compose run --rm lyntty-relay migrate
sudo docker compose run --rm lyntty-relay doctor
sudo docker compose up -d
sudo docker compose ps
curl -fsS http://127.0.0.1:3005/health
```

## Caddy

`/etc/caddy/Caddyfile`:

```caddyfile
relay.jczhang.cc {
    encode zstd gzip
    reverse_proxy 127.0.0.1:3005
}
```

Reload:

```bash
sudo caddy validate --config /etc/caddy/Caddyfile
sudo systemctl reload caddy
curl -fsS https://relay.jczhang.cc/health
```

## GitHub image build workflow design

`.github/workflows/relay-image.yml` verifies `linux/amd64` and `linux/arm64` images on pull requests and manual dispatch. It does not publish from an ordinary `main` push.

GHCR publication belongs to an approved Compatibility BOM release. The release records the immutable OCI digest; production deploy uses that digest or its full-commit release tag. Release publication and production rollout remain separate approvals.

## Manual deploy workflow design

Trigger: `workflow_dispatch`

Inputs:

- `image_tag`: required or defaulted from latest successful build metadata; recommended value `sha-<shortsha>`.

GitHub Secrets:

- `LYNTTY_VPS_HOST`
- `LYNTTY_VPS_USER`
- `LYNTTY_VPS_SSH_KEY`

Deployment script shape (brief maintenance window for both providers):

```bash
set -euo pipefail
cd /opt/lyntty
stamp=$(date -u +%Y%m%dT%H%M%SZ)
sudo docker compose stop lyntty-relay
sudo sed -i "s/^LYNTTY_RELAY_IMAGE_TAG=.*/LYNTTY_RELAY_IMAGE_TAG=${IMAGE_TAG}/" /opt/lyntty/.env
sudo docker compose pull
sudo docker compose run --rm lyntty-relay backup "/backups/predeploy-${stamp}.backup"
sudo docker compose run --rm lyntty-relay migrate
sudo docker compose run --rm lyntty-relay doctor
sudo docker compose up -d
sudo docker compose ps
curl -fsS http://127.0.0.1:3005/health
curl -fsS https://relay.jczhang.cc/health
```

Relay holds a schema lease while serving. Stop every old Relay replica before the explicit migration job; otherwise the migration waits rather than racing an active binary. Any failed backup, migration, or `doctor` leaves Relay stopped for explicit operator rollback rather than starting an unverified image. Preserve the pre-deploy backup and its `.sha256` sidecar until rollback is no longer required.

Do not run `git pull`, package installation, or source builds on the VPS.

## Rollback

Stop Relay, select the previous immutable image, and run its compatibility check before starting it:

```bash
cd /opt/lyntty
sudo docker compose stop lyntty-relay
sudo sed -i 's/^LYNTTY_RELAY_IMAGE_TAG=.*/LYNTTY_RELAY_IMAGE_TAG=sha-<previous-shortsha>/' /opt/lyntty/.env
sudo docker compose pull
sudo docker compose run --rm lyntty-relay doctor
sudo docker compose up -d
curl -fsS https://relay.jczhang.cc/health
```

An additive migration with a current complete-set attestation may permit binary-only rollback. If the previous image's `doctor` rejects a contract migration, do not start it: restore the matching pre-deploy backup and sidecar in the maintenance window, rerun `doctor`, then start. Record the image digest, schema decision, backup identity, and rollback reason in evidence.

## Backup

Use the compiled backup command rather than archiving a live PGlite directory. PGlite must be quiescent:

```bash
#!/usr/bin/env bash
set -euo pipefail

cd /opt/lyntty
stamp=$(date -u +%Y%m%dT%H%M%SZ)
plain="/opt/lyntty/backups/lyntty-pglite-${stamp}.tar.gz"
encrypted="${plain}.age"

sudo docker compose stop lyntty-relay
trap 'sudo docker compose start lyntty-relay >/dev/null' EXIT
sudo docker compose run --rm lyntty-relay \
  backup "/backups/$(basename "$plain")"
sudo age -r '<age-recipient-redacted>' -o "$encrypted" "$plain"
sudo age -r '<age-recipient-redacted>' -o "${plain}.sha256.age" "${plain}.sha256"
sudo rm -f "$plain" "${plain}.sha256"
sudo find /opt/lyntty/backups -name 'lyntty-pglite-*.tar.gz.age' -mtime +30 -delete
sudo find /opt/lyntty/backups -name 'lyntty-pglite-*.tar.gz.sha256.age' -mtime +30 -delete
sudo docker compose start lyntty-relay
trap - EXIT
curl -fsS http://127.0.0.1:3005/health
```

For PostgreSQL, the same command creates a custom-format `pg_dump` and may run online. The image contains PostgreSQL 17 clients; retain and encrypt both the dump and its `.sha256` sidecar before deleting plaintext.

Run the script from a root-owned systemd timer. Keep the script mode `0700`, the backup directory non-public, and encryption keys outside the VPS backup set.

## Restore drill

Decrypt the selected backup and recreate its checksum sidecar. Stop Relay before PGlite restore:

```bash
cd /opt/lyntty
sudo docker compose stop lyntty-relay
plain=/opt/lyntty/backups/restore-pglite.tar.gz
sudo age -d -i <identity-file> \
  /opt/lyntty/backups/lyntty-pglite-<stamp>.tar.gz.age > "$plain"
sudo age -d -i <identity-file> \
  /opt/lyntty/backups/lyntty-pglite-<stamp>.tar.gz.sha256.age > "${plain}.sha256"
sudo docker compose run --rm lyntty-relay \
  restore "/backups/$(basename "$plain")" --force
sudo rm -f "$plain" "${plain}.sha256"
sudo docker compose start lyntty-relay
curl -fsS https://relay.jczhang.cc/health
```

For PostgreSQL, `restore --force` verifies the sidecar and runs `pg_restore` with one transaction and `--exit-on-error`. Perform PostgreSQL restore only in an approved maintenance window and take a fresh backup first.

## Logs and health

Common checks:

```bash
cd /opt/lyntty
sudo docker compose ps
sudo docker compose logs --tail=200 lyntty-relay
curl -fsS http://127.0.0.1:3005/health
curl -fsS https://relay.jczhang.cc/health
journalctl -u caddy --since '1 hour ago'
```

Health endpoint expected shape:

```json
{"status":"ok","service":"lyntty-relay"}
```

## Security notes

- Keep SSH key restricted to deployment user and command scope where practical.
- Keep `LYNTTY_MASTER_SECRET` out of GitHub and logs.
- Do not paste full pairing URLs, auth tokens, public-key blobs used as auth material, request headers, or secrets into evidence.
- Use pinned sha tags for production deploys.
- Keep Cloudflare proxy off for first version to reduce WebSocket/TLS/timeout variables.

## Acceptance

- [x] `relay.jczhang.cc` DNS resolves to VPS.
- [x] Caddy obtains valid HTTPS certificate.
- [x] `https://relay.jczhang.cc/health` returns healthy.
- [x] Container uses GHCR image pinned to `sha-9752c689c927`.
- [x] `/opt/lyntty/data` persists across restart.
- [x] Manual deploy can apply a pinned image tag and healthcheck.
- [ ] Rollback to previous tag works; not exercised yet because there is no older production relay tag.
- [x] Daily encrypted local backup exists.
- [ ] Restore procedure has been run at least once on copied data or maintenance window.
