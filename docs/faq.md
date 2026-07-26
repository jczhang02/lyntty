# FAQ

Status: current product and support boundaries

[简体中文](./faq.zh.md)

## Does Lyntty provide a hosted service?

No. You run the `relay` on infrastructure you control. The project does not provide a public hosted `relay`, a default cloud account, or a Play Store listing. Start with the [getting-started guide](./getting-started.md) and the [`relay` deployment runbook](./deploy/relay-vps.md).

## Does the phone start another `pi` process?

Ordinary phone input goes to the same computer-running `pi` session:

```text
phone -> relay -> lynttyd -> local Pi extension -> pi
```

A session has one `active runtime`. If the extension is missing or stale, Lyntty must queue or reject the message with visible remediation such as `Waiting for Pi extension`. It must not silently start a duplicate runtime.

## Where do session history and credentials live?

Pi JSONL on the paired node is canonical history. Workspaces, tools, MCP configuration, and provider credentials also stay on that node unless another tool moves them. Release signing credentials are separate and belong only in protected release environments.

The `relay` stores encrypted sync state, metadata, queues, and caches needed for routing. It is not a Pi history backup. Lyntty applies basic redaction before events leave the node, but it does not claim a zero-trust or fully end-to-end encrypted architecture. See the [privacy policy](../PRIVACY.md) and [shared-control architecture](./architecture/pi-shared-control.md).

## Which Android build should I install?

For normal use, choose the APK selected by the signed Compatibility BOM in the [current Stable Release](https://github.com/jczhang02/lyntty/releases/latest). Use matching App, CLI/`lynttyd`, `relay`, and Wire artifacts from that release set.

The current Android APK-only Preview is separate from a signed Compatibility Preview. The APK-only Preview publishes an APK, checksum, audits, and provenance, but no Preview BOM or matching CLI/`relay` set. Expo Dev is a short-lived development artifact: it has no embedded JavaScript bundle and needs a compatible source checkout running Metro on port `8081`. Development, Preview, and production packages keep separate Android identities and data.

## Does a screenshot prove Android release acceptance?

No. Emulator captures and documentation screenshots are visual references, not physical Android acceptance or Stable artifact validation. Physical validation is optional for Stable; `android-validation.json` records whether the exact APK was accepted on a physical phone, and the absence of a Release-body warning does not imply acceptance. For the current APK-only Preview, use its prerelease notes, checksum, audits, and provenance instead. Its separate waiver policy remains unchanged.

## Which desktop platforms are supported?

Linux and macOS have supported user-service paths for the CLI and `lynttyd`. Windows artifacts receive smoke coverage, but Windows service installation is not supported. iOS remains best-effort and is not a release acceptance target.

## How do updates and rollback work?

Stable updates use the signed Compatibility BOM to select exact artifacts and digests. The CLI updater keeps the previous known-good release and exposes explicit status and rollback commands:

```bash
lyntty update check
lyntty update status --json
lyntty update rollback
```

Android still requires user confirmation and cannot silently lower `versionCode`. A `relay` rollback publishes a new higher signed BOM sequence rather than reusing a mutable tag. See the [compatibility and rollback policy](./release/compatibility-bom.md).

## What should I do when the App says `Waiting for Pi extension`?

Repair the local extension with `lyntty remote install`, then start a new Pi session or run `/reload` yourself. The installer does not reload a live session. More symptom-based steps are in [Troubleshooting](./troubleshooting.md).

## How do I report a problem?

Use the bug form for a reproducible, non-sensitive defect. Never post credentials, a complete pairing URL, auth headers, keys, private code, or private command output. Vulnerabilities follow [`SECURITY.md`](../SECURITY.md); when private vulnerability reporting is unavailable, use only its detail-free contact fallback.
