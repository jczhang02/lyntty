# Getting started

Status: current owner-operated setup path

[简体中文](./getting-started.zh.md)

Lyntty connects an Android App to `pi` sessions on a computer you control. The project does not operate a hosted `relay` or publish through Google Play. A working installation combines one signed Stable Compatibility Release with a self-hosted `relay` and a paired node.

## Before you begin

You need:

- an Android device or emulator for the App;
- a Linux or macOS computer for `lynttyd` and [pi](https://github.com/earendil-works/pi);
- a Linux host with HTTPS for the self-hosted `relay`;
- access to the [current Stable Release](https://github.com/jczhang02/lyntty/releases/latest).

Windows CLI artifacts receive smoke coverage, but Windows service installation is not supported. iOS is best-effort and is not a release acceptance target.

The ordinary shared-control path is:

```text
phone -> relay -> lynttyd -> local Pi extension -> pi
```

Pi JSONL on the paired node remains canonical history. The `relay` routes encrypted sync state, metadata, queues, and caches; it is not a history backup.

## 1. Select one Stable release set

Open the [current Stable Release](https://github.com/jczhang02/lyntty/releases/latest) and read its leading validation and platform-signing disclosures. The signed Compatibility BOM selects the matching App, CLI/`lynttyd`, `relay`, and Wire artifacts.

Do not mix an APK from one Release with a CLI archive or `relay` image from another. Do not infer trust from matching version numbers, an unsigned mirror, a mutable image tag, or a `/latest/` asset URL outside the Stable BOM contract. The complete policy is in [Compatibility release and support policy](./release/compatibility-bom.md).

The first owner-operated Stable used an explicit waiver instead of physical Android acceptance. Release notes and `android-validation.json` are authoritative for that status. Documentation screenshots or emulator captures do not turn that release into a physical-device validation.

## 2. Deploy the relay

Follow the [`relay` VPS runbook](./deploy/relay-vps.md). The reference topology uses a DNS-only record, Caddy TLS termination, a digest-pinned OCI image selected by the signed Stable BOM, and persistent PGlite data.

Before pairing a node, confirm the endpoint returns the expected health document:

```bash
curl -fsS https://<your-relay-host>/health
```

Expected shape:

```json
{"status":"ok","service":"lyntty-relay"}
```

Keep `LYNTTY_MASTER_SECRET`, SSH material, backups, and deployment credentials outside Git and issue reports.

## 3. Install and configure the Android App

Download the production APK selected by the same Stable Release. Its package id is `dev.jczhang.lyntty`. Verify the Release checksum and signed BOM binding before opening it.

Android always asks the user to confirm installation. If Android blocks the APK, allow unknown-source installation for the browser or file manager you used, then retry. Lyntty never performs a silent install.

Open the App, enter the exact self-hosted `relay` URL, and complete the owner account setup. Wait until the App can display the node-pairing flow. The node installer authenticates through that App, so the App and `relay` must be ready first.

Development package `dev.jczhang.lyntty.dev` and Preview package `dev.jczhang.lyntty.preview` keep separate data and are not replacements for the production package.

## 4. Persist the node relay URL

The installed user service reads the `serverUrl` field from `${LYNTTY_HOME_DIR:-$HOME/.lyntty}/settings.json`. Create that file before the first install, replacing the example URL with the same origin configured in the App:

```bash
state_dir="${LYNTTY_HOME_DIR:-$HOME/.lyntty}"
test ! -e "$state_dir/settings.json" || {
  echo "Refusing to overwrite existing Lyntty settings" >&2
  exit 1
}
umask 077
mkdir -p "$state_dir"
cat > "$state_dir/settings.json" <<'JSON'
{
  "serverUrl": "https://your-relay.example.com"
}
JSON
```

`LYNTTY_SERVER_URL` overrides only the current process. It does not persist into the installed user service. Do not rely on a temporary shell variable for the daemon endpoint.

## 5. Install the CLI, daemon, and Pi extension

Use the hash-pinned installer process in [CLI and daemon release artifacts](./release/cli.md). Installer, archive, and internal manifest digests must come from the reviewed Stable Release and its signed Compatibility BOM. Never pipe an unverified network response into a shell.

The installer runs interactive authentication before installation. Accept the pairing request in the already configured App. After authentication, the same transaction installs `lyntty` and `lynttyd`, installs the local Pi extension, creates or starts the user daemon service, and verifies the candidate.

The installed executables are standalone. End users do not need Bun, Node, npm, pnpm, npx, or tsx.

Do not repeat the following commands during a successful first install. They are repair paths for an existing installation:

```bash
lyntty auth login --force  # stale, revoked, or wrong-relay credentials
lyntty daemon install      # missing or damaged user service
lyntty remote install      # missing or damaged local Pi extension
```

The installer does not reload a live Pi session. Start a new Pi session or run `/reload` yourself after the extension changes.

## 6. Verify the installation

Check the node:

```bash
lyntty daemon status
lyntty doctor
lyntty update status --json
```

Then verify the user path:

1. `Node Management` shows the paired computer as reachable.
2. `Sessions Home` shows a local Pi session.
3. Opening `Session Remote` displays existing history without replacing canonical Pi JSONL.
4. A phone message reaches the same computer-running Pi session.
5. A follow-up or stop action affects that same `active runtime`.

If the Pi extension is missing or stale, the App must show remediation such as `Waiting for Pi extension`. Input must not disappear or create another runtime.

## Updates and rollback

Check the CLI-selected Stable update with:

```bash
lyntty update check
lyntty update status --json
```

The signed BOM determines the exact platform archive and manifest digest. The transactional installer or update path stops the service, swaps the release and extension atomically, verifies the restarted daemon, and restores the previous known-good release on failure.

CLI rollback is explicit:

```bash
lyntty update rollback
```

Android updates remain user-confirmed and cannot silently downgrade `versionCode`. `relay` rollback uses a new higher signed BOM sequence and the protected release/deploy workflows; do not replace the running image with a mutable tag by hand.

## If setup does not complete

Use [Troubleshooting](./troubleshooting.md) for pairing, daemon, extension, history, APK, Metro, and version mismatch symptoms. Non-sensitive reproducible defects use the repository bug form. Vulnerabilities follow [`SECURITY.md`](../SECURITY.md).
