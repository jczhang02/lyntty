# Troubleshooting

Status: current user and operator guide

[简体中文](./troubleshooting.zh.md)

Start with these checks on the paired computer:

```bash
lyntty daemon status
lyntty doctor
lyntty update status --json
```

Check the self-hosted endpoint separately:

```bash
curl -fsS https://<your-relay-host>/health
```

Expected health shape is `{"status":"ok","service":"lyntty-relay"}`. A generic healthy response does not prove that the signed Compatibility BOM, App update, node authentication, or session path is correct.

## App cannot connect to the relay

Check the exact HTTPS URL, certificate, DNS, firewall, and `/health` response. The App and node must use the same self-hosted `relay`. The project does not provide a default hosted endpoint for new installations.

If this computer has never paired, run `lyntty auth login`. If credentials already exist but were revoked, reset, or belong to another `relay`, use `lyntty auth login --force`. The force path stops `lynttyd` and clears the old credentials and machine id before pairing again. Do not paste a complete pairing URL into an issue, chat, screenshot, or command transcript.

## Node Management does not show the computer

Run:

```bash
lyntty daemon status
lyntty doctor
```

If the service is not installed, run `lyntty daemon install`. If authentication was revoked or the `relay` changed, pair again first:

```bash
lyntty auth login --force
lyntty daemon install
```

Linux uses a systemd user service. macOS uses a per-user LaunchAgent. The service must run as the logged-in user, not root. See [CLI and daemon release artifacts](./release/cli.md) for service paths and commands.

## Session Remote says `Waiting for Pi extension`

Install or repair the local extension:

```bash
lyntty remote install
```

Then start a new Pi session or run `/reload` yourself in the existing session. The installer does not force a reload. Do not work around a stale extension by launching another session process for the same Pi history.

Ordinary phone delivery must remain:

```text
phone -> relay -> lynttyd -> Pi extension -> pi
```

## A message is queued or rejected

A queued or explicit failure is safer than dropping input. Confirm that `lynttyd` is reachable and that the Pi extension is attached to the intended session. Wait for the visible remediation state to clear before retrying. Repeated taps should not be used to create parallel work.

## Session history shows `history_gap`

`history_gap` means Lyntty cannot prove continuous ordered history for that range. Pi JSONL on the paired node is still canonical.

Keep the node and `lynttyd` available, reconnect, and allow progressive replay to continue. Do not edit Relay storage to fabricate missing history, and do not delete the local Pi JSONL file. If the gap persists, collect sanitized daemon/App timestamps and the affected session id without copying private conversation content.

## Android blocks APK installation

Stable and Preview APKs use Android Package Installer. Android may require unknown sources permission for the browser or file manager that opened the APK.

Open the app-specific unknown-source setting, allow the selected installer source, then retry. Lyntty cannot silently install or bypass Android confirmation. A checksum mismatch must stop before Package Installer opens.

## The App and node report a version mismatch

Use App, CLI/`lynttyd`, `relay`, and Wire artifacts selected by one signed Compatibility BOM. Matching SemVer strings alone do not prove compatibility.

Check:

```bash
lyntty update check
lyntty update status --json
```

Stable uses the signed Compatibility BOM to select App, CLI, Wire, and `relay` artifacts. The current APK-only Preview publishes only its separate APK and audit sidecars; it has no Preview BOM, CLI archive, hosted `relay`, or Preview `relay` image. Do not treat the Preview APK as a complete compatibility channel. CLI rollback uses `lyntty update rollback`; Android cannot downgrade its monotonic `versionCode`.

## Expo Dev opens with a Metro error

The Expo Dev APK is a development artifact. It has no embedded JavaScript bundle and requires a compatible source checkout running Metro on port `8081`. Start Metro with the documented development command before opening `dev.jczhang.lyntty.dev`.

Stable and Preview APKs are standalone release-style builds. A Metro `8081` error from a supposed Stable or Preview package indicates the wrong package or artifact was installed.

## Preview is stuck on relay setup

Preview has no hosted `relay`. Configure an explicit local endpoint before account or session actions can load. Preview uses package `dev.jczhang.lyntty.preview`; its data is separate from production and development packages.

## Update or rollback did not complete

Run:

```bash
lyntty update status --json
lyntty doctor
```

The updater records intent and recovers an interrupted transaction before another install. Do not delete its journal, release directories, or quarantined candidate by hand. `relay` rollback is a protected operator workflow that creates a new higher signed BOM sequence; do not deploy an old mutable tag directly.

## Collecting a safe report

Record exact package ids, versions, release tags, source commits, and timestamps. Before attaching evidence, remove credentials, complete pairing URLs, auth headers, encryption keys, signing material, private code, hostnames, addresses, and private command output.

Use the bug form for non-sensitive defects. Follow [`SECURITY.md`](../SECURITY.md) for vulnerabilities. The private-reporting page may be unavailable until the repository setting is enabled; the policy provides a detail-free contact fallback.
