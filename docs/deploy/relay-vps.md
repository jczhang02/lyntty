# Relay VPS deployment runbook

Date: 2026-07-06
Status: signed Stable sequence 1 deployed and independently verified on 2026-07-22; see `docs/evidence/r104-stable-relay-production-deployment.md`
Bootstrap history: `docs/evidence/r65-relay-vps-deploy.md`
Related: `docs/standardization/PLAN.md`

## Purpose

Run personal-use Lyntty relay at:

```text
https://relay.jczhang.cc
```

The relay routes/authenticates/caches encrypted state. It does not own canonical Pi history; Pi JSONL on the node remains canonical.

## Target topology

```text
Android app / lynttyd / operator `lyntty remote`
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

- Android and the explicit operator `lyntty remote` client may connect to Relay. Only `lynttyd` bridges node-side Pi sessions; the Pi extension remains local-only.
- Cloudflare record starts **DNS-only** (gray cloud), not proxied.
- Caddy terminates HTTPS directly and obtains Let’s Encrypt certificates.
- VPS runs the prebuilt, runtime-free GHCR image; it does not clone the repository or build source.
- PGlite and uploaded files persist under `/opt/lyntty/data`.
- `LYNTTY_MASTER_SECRET` stays on the VPS and in a password manager/encrypted backup, not GitHub Secrets.

## VPS prerequisites

- Linux VPS with Docker Engine and Docker Compose plugin.
- `jq`, `curl`, `sha256sum`, and GNU `base64` available on the host.
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
LYNTTY_RELAY_IMAGE=ghcr.io/jczhang02/lyntty-relay@sha256:<64-hex-digest>
LYNTTY_RELEASE_TRUST_ROOTS=<single-line-reviewed-trust-store-JSON>
```

Permissions:

```bash
sudo chmod 600 /opt/lyntty/.env
```

Do not store `LYNTTY_MASTER_SECRET` in GitHub Actions. The deploy workflow needs SSH access, pinned known-host material, and a signed Stable BOM tag; it resolves the image digest from the BOM. `LYNTTY_RELEASE_TRUST_ROOTS` contains public keys and release identity pins, not private signing material. Existing Relay-schema-1 deployments using `HANDY_MASTER_SECRET` must copy the exact same secret bytes to `LYNTTY_MASTER_SECRET` before the schema-2 contract boundary; do not rotate the value during the name migration. Formal deployment requires exactly one non-empty, canonical `LYNTTY_MASTER_SECRET=...` entry (no `export`, leading whitespace, alternate assignment, or duplicate), mode `0600`/root ownership for `.env`, and an existing canonical `LYNTTY_RELAY_IMAGE` already pinned by digest. Convert any historical mutable `sha-*` reference and verify the old runtime before the first formal rollout.

## Docker Compose

`/opt/lyntty/docker-compose.yml`:

```yaml
services:
  lyntty-relay:
    image: ${LYNTTY_RELAY_IMAGE}
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

The protected deploy accepts the historical variable-based Compose layout for a one-time migration only when it resolves to one of two audited production identities: R65 `sha-9752c689c927` → `sha256:2eb926b37741e9b047b6e6f178ffdb0e84ed41c6649180421b3f4861838ff715`, or its later deployed successor `sha-e243429200bd` → `sha256:fe3bf95fd7e19cd34c3f94ff2aedeced9497535db797f07ba37241083dd8e83d` (R103). Before stopping Relay, it proves that the configured tag, running container, local image ID, expected RepoTag, sole GHCR `RepoDigest`, pulled immutable digest, and exact tag-to-digest mapping are the same bytes. It then creates paired root-private backups, atomically stages `${LYNTTY_RELAY_IMAGE}` plus the derived digest, and adds the persistent `/opt/lyntty/backups:/backups` bind if absent. Ambiguous YAML, unlisted runtime tags/digests, alternate repositories, multiple digests, missing containers, or any identity mismatch fail before service/database mutation. The R102 exception repairs only stale configuration back to exact proven R65 running bytes; it does not accept the unlisted configured SHA as a runtime. For later Stable N→N+1 upgrades, the canonical predecessor digest is accepted only from the paired, root-owned mode-600 `deployed-bom.txt` and `deployed-sequence.txt`; the running-byte check still applies. Do not reproduce this with manual `sed` edits.

Start:

```bash
sudo docker compose --project-directory /opt/lyntty pull
sudo docker compose --project-directory /opt/lyntty run --rm lyntty-relay migrate
sudo docker compose --project-directory /opt/lyntty run --rm lyntty-relay doctor
sudo docker compose --project-directory /opt/lyntty up -d
sudo docker compose --project-directory /opt/lyntty ps
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

GHCR publication belongs to an approved Compatibility BOM promotion. The release records the immutable OCI digest and signs/attests the image by digest; production deploy accepts only that signed Stable BOM and uses its exact `@sha256:` reference. Release publication and production rollout remain separate approvals.

## Manual deploy workflow design

Trigger: `workflow_dispatch`

Inputs:

- `bom_tag`: an exact signed Stable Compatibility release tag. Mutable image tags and raw operator-supplied digests are not accepted.

GitHub Secrets:

- `LYNTTY_VPS_HOST`
- `LYNTTY_VPS_USER`
- `LYNTTY_VPS_SSH_KEY`
- `LYNTTY_VPS_KNOWN_HOSTS`

Production environment variable:

- `LYNTTY_RELEASE_TRUST_ROOTS` (reviewed public Stable roots and identity pins)

Deployment transaction (brief maintenance window):

1. Verify protected main, the current immutable signed Stable BOM, exact OCI digest, attestations, SSH host key, root-private files, and absence of incomplete markers.
2. While the old Relay is still healthy, normalize the documented schema-1 secret key and pre-Stable image layout only through the bounded backup-first migrations above. Resolve the prior digest from the running image bytes and require its audited tag-to-digest mapping; never trust a mutable remote tag alone.
3. Prepare a root-private rollback-only Compose override that maps `HANDY_MASTER_SECRET` from the exact canonical `LYNTTY_MASTER_SECRET`; it is used only if the verified pre-Stable image must be restarted before schema mutation.
4. Stop the old Relay, atomically install the target digest/trust roots/sequence, pull and verify the target image, then create and checksum the persistent database backup.
5. Write `.migration-incomplete`, run `migrate` and `doctor`, start the exact digest, and verify local and public `/health` plus the full `/v1/version` BOM/APK contract.

Relay holds a schema lease while serving. The workflow accepts only the current immutable signed Stable head and requires its sequence to advance `deployed-sequence.txt`. A generic `/health` response is insufficient. Compose one-shot jobs detach stdin so they cannot consume the remote `bash -s` script stream. Before schema mutation, failure restores the prior env and restarts the exact prior image bytes with the private compatibility override; failed restoration writes `.rollback-incomplete`. Any failure after `.migration-incomplete` is written leaves Relay stopped. Retries remain blocked until an operator verifies the named backup or prior runtime, restores or validates schema state, runs `doctor`, and explicitly removes the applicable marker. Preserve the pre-deploy backup and its `.sha256` sidecar until rollback is no longer required.

Do not run `git pull`, package installation, or source builds on the VPS.

## Rollback

Run the protected `Roll back stable compatibility release` workflow with one of the two retained predecessor Stable tags and a new higher sequence. It preserves the current Android App, selects the retained CLI/Relay bytes, verifies all current-plus-two rolling combinations, signs a new BOM, and advances Stable latest without rebuilding. Then run `Deploy relay from Compatibility BOM` with that new rollback tag.

Do not directly edit the VPS to an older mutable image tag or deploy a historical signed BOM directly. The deploy workflow records the exact current-head BOM, monotonic sequence, and `@sha256:` reference. Failures before migration restore the prior image; once migration begins, any failure or cancellation leaves Relay stopped until backup/schema compatibility is explicitly verified. If the retained image's `doctor` rejects a contract migration, do not start it: restore the matching pre-deploy backup and sidecar in the maintenance window, rerun `doctor`, then start. Record the BOM, image digest, schema decision, backup identity, and rollback reason in evidence.

## Backup

Use the compiled backup command rather than archiving a live PGlite directory. PGlite must be quiescent:

```bash
#!/usr/bin/env bash
set -euo pipefail
if (( EUID != 0 )); then
  echo "backup must run as root" >&2
  exit 1
fi

cd /opt/lyntty
stamp=$(date -u +%Y%m%dT%H%M%SZ)
plain="/opt/lyntty/backups/lyntty-pglite-${stamp}.tar.gz"
encrypted="${plain}.age"

docker compose stop lyntty-relay
trap 'docker compose start lyntty-relay >/dev/null' EXIT
docker compose run --rm lyntty-relay \
  backup "/backups/$(basename "$plain")"
age -r '<age-recipient-redacted>' -o "$encrypted" "$plain"
age -r '<age-recipient-redacted>' -o "${plain}.sha256.age" "${plain}.sha256"
rm -f "$plain" "${plain}.sha256"
find /opt/lyntty/backups -name 'lyntty-pglite-*.tar.gz.age' -mtime +30 -delete
find /opt/lyntty/backups -name 'lyntty-pglite-*.tar.gz.sha256.age' -mtime +30 -delete
docker compose start lyntty-relay
trap - EXIT
curl -fsS http://127.0.0.1:3005/health
```

For PostgreSQL, the same command creates a custom-format `pg_dump` and may run online. The image contains PostgreSQL 17 clients; retain and encrypt both the dump and its `.sha256` sidecar before deleting plaintext.

Run the script from a root-owned systemd timer. Keep the script mode `0700`, the backup directory non-public, and encryption keys outside the VPS backup set.

## Restore drill

Decrypt the selected backup and recreate its checksum sidecar. Stop Relay before PGlite restore:

```bash
sudo bash -se <<'ROOT'
set -euo pipefail
cd /opt/lyntty
plain=/opt/lyntty/backups/restore-pglite.tar.gz
identity_file=/root/.config/age/keys.txt
stamp=20260718T120000Z # replace with the selected backup timestamp
restore_started=false
success=false
cleanup() {
  rm -f "$plain" "${plain}.sha256"
  if [[ "$success" != true ]]; then
    if [[ "$restore_started" == true ]]; then
      docker compose stop lyntty-relay >/dev/null || true
      echo "Restore failed after database replacement began; Relay remains stopped." >&2
    else
      docker compose start lyntty-relay >/dev/null || true
    fi
  fi
}
trap cleanup EXIT
trap 'exit 130' INT TERM
age -d -i "$identity_file" \
  "backups/lyntty-pglite-${stamp}.tar.gz.age" > "$plain"
age -d -i "$identity_file" \
  "backups/lyntty-pglite-${stamp}.tar.gz.sha256.age" > "${plain}.sha256"
docker compose stop lyntty-relay
restore_started=true
docker compose run --rm lyntty-relay \
  restore "/backups/$(basename "$plain")" --force
docker compose run --rm lyntty-relay doctor
docker compose start lyntty-relay
curl -fsS http://127.0.0.1:3005/health
success=true
cleanup
trap - EXIT INT TERM
ROOT
curl -fsS https://relay.jczhang.cc/health
```

For PostgreSQL, `restore --force` verifies the sidecar and runs `pg_restore` with one transaction and `--exit-on-error`. Perform PostgreSQL restore only in an approved maintenance window and take a fresh backup first.

## Logs and health

Common checks:

```bash
sudo docker compose --project-directory /opt/lyntty ps
sudo docker compose --project-directory /opt/lyntty logs --tail=200 lyntty-relay
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
- Deploy only the current signed Stable BOM selected by the protected workflow; the resolved Relay reference must use `@sha256:...`, never a mutable or `sha-*` tag.
- Keep Cloudflare proxy off for first version to reduce WebSocket/TLS/timeout variables.

## Acceptance

- [x] `relay.jczhang.cc` DNS resolves to VPS.
- [x] Caddy obtains valid HTTPS certificate.
- [x] `https://relay.jczhang.cc/health` returns healthy.
- [x] Protected deploy verified the immutable signed Stable BOM, image signature, provenance, SBOM, trust-root digest, running container digest, and exact `/v1/version` identity for Stable sequence 1; see `docs/evidence/r104-stable-relay-production-deployment.md`.
- [x] `/opt/lyntty/data` persists across restart.
- [x] Protected deploy applied the signed BOM-selected digest and recorded Stable sequence 1; the previous manual tag deployment remains bootstrap history, not formal acceptance.
- [ ] A higher-sequence signed rollback BOM has been deployed; not exercised yet because no formal predecessor release exists.
- [x] Daily encrypted local backup exists.
- [ ] Restore procedure has been run at least once on copied data or maintenance window.
