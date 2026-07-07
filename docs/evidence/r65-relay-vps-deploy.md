# r65 Relay VPS deployment

Date: 2026-07-07
Scope: deploy personal-use Lyntty relay to `relay-hk` at `https://relay.jczhang.cc`.

## Result

Deployed and verified.

- VPS: `relay-hk`
- Public IPv4: `43.161.196.226`
- DNS: `relay.jczhang.cc A 43.161.196.226`, Cloudflare DNS-only
- Relay image: `ghcr.io/jczhang02/lyntty-relay:sha-9752c689c927`
- Container: `/opt/lyntty/docker-compose.yml`
- Persistent data: `/opt/lyntty/data`
- Public health: `https://relay.jczhang.cc/health`
- Android update route: `POST https://relay.jczhang.cc/v1/version`

Secrets were not printed into logs or this evidence file.

## Commands and evidence

### VPS packages and service layout

Installed on `relay-hk`:

```text
Docker version 29.1.3
Docker Compose version 2.40.3
Caddy 2.6.2
age
zstd
```

Created:

```text
/opt/lyntty/.env                 # mode 600, contains HANDY_MASTER_SECRET, not logged
/opt/lyntty/docker-compose.yml   # mode 600
/opt/lyntty/data                 # persistent PGlite/files
/opt/lyntty/backups              # encrypted backups
/opt/lyntty/scripts/backup.sh
/etc/caddy/Caddyfile
```

### Relay image

GitHub Actions relay image build:

```text
run: https://github.com/jczhang02/lyntty/actions/runs/28847187170
result: success
image: ghcr.io/jczhang02/lyntty-relay:sha-9752c689c927
```

### Container and local health

After `docker compose up -d`:

```text
NAME                    IMAGE                                             STATUS
lyntty-lyntty-relay-1   ghcr.io/jczhang02/lyntty-relay:sha-9752c689c927   Up
```

Local health:

```bash
curl -fsS http://127.0.0.1:3005/health
```

Result:

```json
{"status":"ok","service":"lyntty-relay"}
```

Relay logs showed 39 migrations applied and API ready on port 3005.

### DNS and TLS

Initial Caddy certificate issuance failed because public DNS for `relay.jczhang.cc` was NXDOMAIN. After adding Cloudflare DNS-only A record:

```text
relay.jczhang.cc A 43.161.196.226
```

Caddy obtained a Let’s Encrypt certificate:

```text
subject: CN=relay.jczhang.cc
issuer: C=US; O=Let's Encrypt; CN=YE1
notBefore: Jul 7 06:41:53 2026 GMT
notAfter: Oct 5 06:41:52 2026 GMT
```

443 was initially blocked by the cloud security group. After opening `TCP:443` from `0.0.0.0/0`, public health succeeded:

```bash
curl --noproxy '*' -fsS --max-time 20 https://relay.jczhang.cc/health
```

Result:

```json
{"status":"ok","service":"lyntty-relay"}
```

### Android version endpoint

Old app request:

```bash
curl -fsS -X POST https://relay.jczhang.cc/v1/version \
  -H 'content-type: application/json' \
  --data '{"platform":"android","app_id":"dev.jczhang.lyntty","version":"1.0.0","version_code":1}'
```

Result included:

```json
{
  "update_required": true,
  "version_name": "1.7.1",
  "version_code": 3,
  "apk_url": "https://github.com/jczhang02/lyntty/releases/download/android-v1.7.1-3/lyntty-android-v1.7.1-3.apk",
  "sha256": "9bd412dcc452d5cf046ee35a50a8ddd70ff9a6f207b2e2d6a967acd27af15b43"
}
```

Current app request with `version_code: 3` returned:

```json
{"update_required":false,"update_url":null}
```

### Restart and persistence

Ran:

```bash
cd /opt/lyntty
sudo docker compose restart lyntty-relay
```

After retry delay:

```text
container: Up
local health: ok
public health: ok
data_files=77
```

### Backups

Enabled:

```text
lyntty-backup.timer enabled/active
```

First backup:

```text
/opt/lyntty/backups/lyntty-data-20260707T065955Z.tar.zst.age
```

The VPS `.env` and backup age key were copied only through an SSH pipe into a local GPG-encrypted file:

```text
~/.lyntty/secrets/relay-hk-lyntty-secrets-20260707T070237Z.tar.gz.gpg
```

No plaintext relay secret was written to the repository.

### GitHub deploy workflow

First workflow dispatch failed because `/opt/lyntty` is root-only and the remote script tried `cd /opt/lyntty` as user `ubuntu`:

```text
run: https://github.com/jczhang02/lyntty/actions/runs/28852985394
result: failure
error: cd: /opt/lyntty: Permission denied
```

Fixed by changing `.github/workflows/relay-deploy.yml` to use `sudo test`, `sudo grep`, and `sudo sh -c 'cd /opt/lyntty && docker compose ...'`.

Successful deploy workflow:

```text
run: https://github.com/jczhang02/lyntty/actions/runs/28853214309
result: success
input image_tag: sha-9752c689c927
```

### Secret scan and CI

After relay deploy workflow fix:

```text
gitleaks detect: 187 commits scanned, 0 findings
report: /tmp/lyntty-gitleaks-report-relay-deploy-sudo-final.json
```

## Not run

- Rollback to a previous relay image tag: not run because there is no older production relay image tag.
- Full restore drill from encrypted backup: not run; should be done later on copied data or a maintenance window.
- Physical Android phone end-to-end pairing through the deployed relay: not run in this deployment step.

## Residual risk

- GHCR image is large (`~7.38GB` on VPS). Future work should slim the relay image.
- First backup exists, but restore has not been drilled.
- Relay health/version routes are verified; full phone-to-lynttyd control over the production relay still needs a separate Android/device validation pass.
