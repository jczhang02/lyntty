# Lyntty standardization plan

Date: 2026-07-06
Status: accepted planning snapshot, implementation pending
Beads: `lyntty-3t8`
Evidence: `docs/evidence/r62-standardization-docs.md`

## Goal

Make Lyntty usable for stable personal daily use:

- public GitHub repo at `jczhang02/lyntty`;
- clean push/PR CI for app/cli/relay/wire health;
- VPS relay at `https://relay.jczhang.cc` with HTTPS, persistence, restart policy, logs, and backups;
- `lynttyd` connects to that relay and remains node-local authority;
- GitHub Actions can build relay Docker images and manually deploy them to VPS;
- GitHub Actions can manually produce signed production Android APK releases;
- installed APK can discover newer APKs, download them, verify `sha256`, then invoke Android Package Installer with user confirmation;
- Android phone can control an ordinary computer-side `pi` session through shared control.

## Non-goals

- Public SaaS launch.
- Play Store / App Store release as primary distribution.
- Silent APK install or bypassing Android system confirmation.
- Native Android updater shim.
- EAS Build / EAS Update as main release channel.
- Restoring Happy/Claude/Codex/Gemini/OpenClaw product surfaces.
- Making iOS acceptance equal to Android for this standardization pass.

## Product invariants

Source of truth: `docs/contexts/product/CONTEXT.md` and `docs/architecture/pi-shared-control.md`.

- `pi` is the only supported runtime in product scope.
- `lynttyd` is the local node daemon.
- Only `lynttyd` connects to `relay`; Pi extension talks only to local `lynttyd`.
- Pi JSONL remains canonical history.
- `relay` stores encrypted sync state, metadata, queues, and caches; it is not canonical Pi history.
- One Pi session has one `active runtime`; takeover is explicit.
- Phone sends to ordinary computer-running `pi` sessions use shared control:

```text
phone -> relay -> lynttyd -> Pi extension -> pi.sendUserMessage()
```

- Extension-missing or stale cases queue/fail with explicit remediation such as `Waiting for Pi extension`; no silent drop and no silent duplicate runtime.

## Accepted decisions

| Area | Decision |
| --- | --- |
| Initial target | Stable personal use, not public release. |
| GitHub repo | `origin` should become `git@github.com:jczhang02/lyntty.git`; repo public; default branch `main`. |
| Upstream Happy | Optional `upstream` only for history lookup/cherry-pick; no automatic merge/sync. |
| Public push gate | Run full git-history secret scan before public push. True secret means rotate/revoke and rewrite history before push. |
| Default production relay | `https://relay.jczhang.cc`. |
| Cloudflare | `relay.jczhang.cc` starts DNS-only (gray cloud), A record to VPS. |
| CI | Push/PR CI runs install plus focused tests/typecheck; no APK release, VPS deploy, Maestro, or Windows matrix by default. |
| Relay image | GitHub Actions builds GHCR image `ghcr.io/jczhang02/lyntty-relay`. Push both `sha-<shortsha>` and `main`; production deploy pins a sha tag. |
| Relay deploy | Manual GitHub Actions workflow SSHes to VPS and runs `docker compose pull && docker compose up -d && healthcheck`. VPS does not git pull or build. |
| Relay VPS shape | Single VPS, Docker Compose, host Caddy HTTPS, PGlite persistent volume at `/opt/lyntty/data`, restart `unless-stopped`. |
| Relay secret | `HANDY_MASTER_SECRET` generated once for VPS, kept in `/opt/lyntty/.env` plus password manager/encrypted backup; not stored in GitHub Secrets. |
| Relay backups | First version: daily encrypted local VPS backup of `/opt/lyntty/data`, retain 14-30 days; remote backup later. |
| Android package names | Production `dev.jczhang.lyntty`; dev/E2E `dev.jczhang.lyntty.dev`; preview optional `dev.jczhang.lyntty.preview`. |
| Android data isolation | Production/dev data remain isolated by package name; no automatic cross-package migration. |
| Existing signed app conflict | If old `dev.jczhang.lyntty` has different signing key, uninstall/reinstall once; do not chase old key. |
| Android release key | Create new permanent `lyntty-release.jks`, keep out of git, local encrypted backup, GitHub Secrets for CI signing. |
| Android release trigger | APK release workflow is manual `workflow_dispatch` only. Ordinary fixes do not auto-release APK. |
| Version strategy | `versionName` human version, e.g. `1.7.1`; `versionCode` from GitHub run number by default; tag `android-v<versionName>-<versionCode>`. |
| APK distribution | GitHub Releases is primary APK distribution. Relay returns manifest/URL; relay does not host APK as primary path. |
| Update manifest | Android release workflow generates `latest.json`; relay reads GitHub latest release manifest, caches briefly, and returns `/v1/version` response. |
| APK self-update | App downloads APK with Expo/React Native APIs, verifies `sha256`, then invokes Android Package Installer; user confirms install. |
| Update permission | Production APK may request `android.permission.REQUEST_INSTALL_PACKAGES`. |
| Hash requirement | `sha256` verification is first-version requirement, even if file bytes are read into memory. |
| Installer implementation | No Android-only native shim. Use `expo-file-system` / `expo-file-system/legacy`, `expo-crypto`, `expo-intent-launcher`, Android intents. |
| EAS | EAS Update can remain secondary OTA for JS/assets if useful; not main native release/update mechanism. |

## Current code gaps to close

Observed from current tree:

- `packages/lyntty-app/sources/sync/serverConfig.ts` defaults to `https://api.cluster-fluster.com`, not `https://relay.jczhang.cc`.
- `packages/lyntty-app/app.config.js` has production package `dev.jczhang.lyntty`, but checked-in `android/app/build.gradle` still hardcodes `dev.jczhang.lyntty.dev` and release signing uses debug keystore.
- `packages/lyntty-app/app.config.js` does not yet request `REQUEST_INSTALL_PACKAGES`.
- `packages/lyntty-app/sources/sync/sync.ts` posts `platform`, `version`, and `app_id` to `/v1/version`, and expects `update_required` / `update_url`; it does not send `versionCode` yet.
- `packages/lyntty-app/sources/components/UpdateBanner.tsx` opens native update URL externally, not through APK download/hash/install flow.
- `packages/lyntty-relay/sources/app/api/routes/versionRoutes.ts` is Happy-era semver/store logic and returns `{ updateUrl }`, not the planned APK manifest shape.
- `packages/lyntty-relay/sources/versions.ts` uses static `>=1.4.1` constraints.
- Existing `.github/workflows/typecheck.yml` only typechecks app.
- Existing `.github/workflows/cli-smoke-test.yml` does broad CLI smoke including Linux/Windows matrix; planned default CI should be simpler and focused.
- `packages/lyntty-app/eas.json` and release scripts are still EAS/store oriented.
- Root `Dockerfile` is the preferred standalone relay image base; `Dockerfile.server` is not the deployment target for this plan.
- Package metadata is partly still upstream-oriented in `lyntty-relay`, `lyntty-wire`, and `lyntty-agent`.

## Implementation phases

### Phase 0 — docs and decision ledger

Exit:

- `docs/standardization/PLAN.md` records accepted standardization plan.
- `docs/deploy/relay-vps.md` records VPS/relay runbook.
- `docs/release/android-apk.md` records APK release/update runbook.
- `docs/evidence/r62-standardization-docs.md` records evidence and not-run items.

### Phase 1 — repo hygiene and public push gate

Work:

- Update package repository/homepage/bugs metadata to `jczhang02/lyntty` where still upstream-oriented.
- Confirm `.gitignore` blocks `.jks`, `.keystore`, `.env`, and local secrets.
- Run `gitleaks detect` or `trufflehog git file://...` before public push.
- If secret scan hits a real secret, rotate/revoke and rewrite history before publishing.
- Configure `origin` to `git@github.com:jczhang02/lyntty.git` only after scan is clean.

Exit:

- Secret-scan report recorded in evidence.
- Repo remote configured only after clean scan.

### Phase 2 — focused CI

Work:

- Add default push/PR CI for:
  - `pnpm install --frozen-lockfile`
  - `pnpm --filter ./packages/lyntty-wire build`
  - `pnpm --filter ./packages/lyntty-wire test`
  - `pnpm --filter ./packages/lyntty-cli typecheck`
  - `pnpm --filter ./packages/lyntty-cli test`
  - `pnpm --filter ./packages/lyntty-relay typecheck`
  - `pnpm --filter ./packages/lyntty-relay test`
  - `pnpm --filter ./packages/lyntty-app typecheck`
  - `pnpm --filter ./packages/lyntty-app test`
  - `git diff --check`
- Do not run Maestro, APK release build, VPS deploy, or Windows smoke matrix by default.

Exit:

- Push/PR CI green for focused checks.

### Phase 3 — relay image and manual VPS deploy

Work:

- Add GitHub Actions workflow to build root `Dockerfile` and push GHCR tags `sha-<shortsha>` and `main`.
- Add manual deploy workflow with `image_tag` input and SSH secrets.
- Add/update VPS Compose and Caddy runbook from `docs/deploy/relay-vps.md`.
- Keep VPS secret local: `HANDY_MASTER_SECRET` in `/opt/lyntty/.env`, not GitHub Secrets.
- Add daily encrypted local backup timer.

Exit:

- `https://relay.jczhang.cc/health` returns healthy on pinned image tag.
- VPS can rollback by changing `LYNTTY_RELAY_IMAGE_TAG` to previous sha.

### Phase 4 — Android signed APK release and self-update

Work:

- Add Gradle properties/env wiring so default local builds use dev package and production release requires explicit opt-in.
- Add release signing from GitHub Secrets.
- Add manual Android release workflow.
- Generate signed production APK and `latest.json` as GitHub Release assets.
- Update relay `/v1/version` to read manifest and return snake_case update fields.
- Update app to send/compare `versionCode`, download APK, verify `sha256`, and invoke Android Package Installer through Expo APIs.
- Add `REQUEST_INSTALL_PACKAGES` for production APK.

Exit:

- Fresh install of signed production APK works.
- APK detects newer GitHub Release through relay.
- APK downloads update, verifies `sha256`, opens Android Package Installer, and user can confirm install.
- `sha256` mismatch does not open installer.

### Phase 5 — personal-use acceptance

Work:

- Validate phone can pair with node through `https://relay.jczhang.cc`.
- Validate `lynttyd` reconnect and shared-control send path for a computer-side `pi` session.
- Validate daemon restart and relay restart do not lose canonical history; Pi JSONL remains source.
- Validate APK update from one production version to next.
- Record evidence with exact commands, artifacts, and not-run reasons.

Exit:

- Daily-use path works on Android release-style APK.

## Acceptance checklist

- [ ] Public repo push prepared with clean secret-history scan.
- [ ] Focused CI green on `main`.
- [ ] GHCR relay image builds on push.
- [ ] Manual deploy workflow updates VPS by pinned sha tag.
- [ ] `https://relay.jczhang.cc/health` healthy through Caddy HTTPS.
- [ ] `/opt/lyntty/data` persists PGlite/files across container restart.
- [ ] Daily encrypted local backup exists and restore command is documented.
- [ ] Production APK package id is `dev.jczhang.lyntty`.
- [ ] Release APK signed with permanent release keystore, not debug key.
- [ ] Android release workflow is manual only.
- [ ] GitHub Release contains APK plus generated `latest.json`.
- [ ] Relay `/v1/version` returns GitHub APK manifest data.
- [ ] App compares `versionCode`, not only semver.
- [ ] App verifies APK `sha256` before invoking installer.
- [ ] App uses Android Package Installer with user confirmation; no silent install.
- [ ] Dev APK remains `dev.jczhang.lyntty.dev` and data-isolated.
- [ ] Phone controls computer-side `pi` session through shared control.

## Verification commands

Use narrow checks first, then broaden as touched layers require:

```bash
pnpm --filter ./packages/lyntty-wire build
pnpm --filter ./packages/lyntty-wire test
pnpm --filter ./packages/lyntty-cli typecheck
pnpm --filter ./packages/lyntty-cli test
pnpm --filter ./packages/lyntty-relay typecheck
pnpm --filter ./packages/lyntty-relay test
pnpm --filter ./packages/lyntty-app typecheck
pnpm --filter ./packages/lyntty-app test
git diff --check
```

Android release validation should add release-style APK install/update smoke and record artifact hashes.

## Residual risks

- Expo-only APK install path depends on `expo-file-system/legacy` content URI behavior on target SDK/device versions.
- Reading full APK bytes for SHA-256 may fail on low-memory devices if APK grows large.
- GitHub Release `latest.json` and relay cache behavior need robust fallback for GitHub outage/rate limits.
- Public repo scan may find historical upstream secrets requiring rewrite before push.
- Caddy/Cloudflare/Docker VPS deployment remains untested until VPS exists.
