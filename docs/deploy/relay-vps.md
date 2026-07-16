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

Do not store `LYNTTY_MASTER_SECRET` in GitHub Actions. The deploy workflow only needs SSH access and an image tag.

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
      NODE_ENV: production
      DATA_DIR: /data
      PGLITE_DIR: /data/pglite
      PORT: "3005"
    volumes:
      - /opt/lyntty/data:/data
    ports:
      - "127.0.0.1:3005:3005"
```

Start:

```bash
cd /opt/lyntty
sudo docker compose pull
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

Trigger:

- push to `main`
- optional `workflow_dispatch`

Output image:

```text
ghcr.io/jczhang02/lyntty-relay:sha-<shortsha>
ghcr.io/jczhang02/lyntty-relay:main
```

Rules:

- Use root `Dockerfile`.
- `sha-<shortsha>` is production deploy target.
- `main` is convenience/testing tag, not default production pin.

## Manual deploy workflow design

Trigger: `workflow_dispatch`

Inputs:

- `image_tag`: required or defaulted from latest successful build metadata; recommended value `sha-<shortsha>`.

GitHub Secrets:

- `LYNTTY_VPS_HOST`
- `LYNTTY_VPS_USER`
- `LYNTTY_VPS_SSH_KEY`

Deployment script shape:

```bash
set -euo pipefail
cd /opt/lyntty
sudo sed -i "s/^LYNTTY_RELAY_IMAGE_TAG=.*/LYNTTY_RELAY_IMAGE_TAG=${IMAGE_TAG}/" /opt/lyntty/.env
sudo docker compose pull
sudo docker compose up -d
sudo docker compose ps
curl -fsS http://127.0.0.1:3005/health
curl -fsS https://relay.jczhang.cc/health
```

Do not run `git pull`, package installation, or source builds on the VPS.

## Rollback

Pick previous known-good sha tag:

```bash
cd /opt/lyntty
sudo sed -i 's/^LYNTTY_RELAY_IMAGE_TAG=.*/LYNTTY_RELAY_IMAGE_TAG=sha-<previous-shortsha>/' /opt/lyntty/.env
sudo docker compose pull
sudo docker compose up -d
curl -fsS https://relay.jczhang.cc/health
```

Record rollback tag and reason in evidence.

## Backup

First version: daily encrypted local backup of `/opt/lyntty/data`.

Example `/opt/lyntty/scripts/backup.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail

backup_root=/opt/lyntty/backups
stamp=$(date -u +%Y%m%dT%H%M%SZ)
plain="${backup_root}/lyntty-data-${stamp}.tar.zst"
encrypted="${plain}.age"

mkdir -p "$backup_root"
tar --zstd -cpf "$plain" -C /opt/lyntty data
age -r '<age-recipient-redacted>' -o "$encrypted" "$plain"
rm -f "$plain"
find "$backup_root" -name 'lyntty-data-*.tar.zst.age' -mtime +30 -delete
```

Permissions:

```bash
sudo chmod 700 /opt/lyntty/scripts/backup.sh
```

Systemd timer sketch:

```ini
# /etc/systemd/system/lyntty-backup.service
[Unit]
Description=Lyntty relay data backup

[Service]
Type=oneshot
ExecStart=/opt/lyntty/scripts/backup.sh
```

```ini
# /etc/systemd/system/lyntty-backup.timer
[Unit]
Description=Daily Lyntty relay data backup

[Timer]
OnCalendar=*-*-* 03:30:00 UTC
Persistent=true

[Install]
WantedBy=timers.target
```

Enable:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now lyntty-backup.timer
systemctl list-timers lyntty-backup.timer
```

## Restore drill

Stop relay:

```bash
cd /opt/lyntty
sudo docker compose down
```

Restore backup:

```bash
tmp=$(mktemp -d)
age -d -i <identity-file> /opt/lyntty/backups/lyntty-data-<stamp>.tar.zst.age > "$tmp/restore.tar.zst"
sudo rm -rf /opt/lyntty/data
sudo tar --zstd -xpf "$tmp/restore.tar.zst" -C /opt/lyntty
sudo chmod 700 /opt/lyntty/data
```

Start and verify:

```bash
cd /opt/lyntty
sudo docker compose up -d
curl -fsS https://relay.jczhang.cc/health
```

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
{"status":"ok"}
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
