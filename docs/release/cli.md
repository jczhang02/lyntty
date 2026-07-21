# CLI and daemon release artifacts

Lyntty ships `lyntty` and `lynttyd` together. They are standalone executables built with Bun; the destination computer does not need Bun, Node, npm, pnpm, npx, or tsx.

## Artifact layout

A release archive has one top-level directory:

```text
lyntty-cli-<version>-<target>/
  lyntty[.exe]
  lynttyd[.exe]
  artifact-manifest.json
  runtime/pi/
  tools/rg[.exe]
  tools/difft[.exe]
  licenses/
```

`runtime/pi` contains Pi themes, export templates, docs, assets, and Bun-adjusted examples. The Lyntty Pi extension remains embedded in both executables. Each newly built manifest records the exact 40-character source commit; formal artifact builds reject a dirty source tree or a mismatched `GITHUB_SHA`. Legacy local schema-1 manifests without this field remain readable, but protected native signing and Stable candidate workflows require an exact source-commit match. `lyntty --self-check --json` verifies the exact file inventory, file hashes, target, embedded extension digest, and sibling daemon build identity without authenticating or starting a service.

Linux artifacts target glibc. Supported target names are `linux-x64`, `linux-arm64`, `darwin-x64`, `darwin-arm64`, and `windows-x64`. Stable macOS/Windows bytes must pass the protected producer and independent verifier described in [`native-signing.md`](./native-signing.md); missing notarization, Authenticode, timestamp, or attestation blocks the entire Stable Candidate.

## Installation

A release-specific installer command must pin both the archive SHA-256 and `artifact-manifest.json` SHA-256 from the signed Compatibility BOM. Do not copy hashes from an unsigned mirror.

The formal Stable Release publishes `install.sh`, `install.sh.sha256`, `stable-release-trust-roots.json`, the detached signed BOM, and every selected archive together. Bootstrap by pinning the Release tag and first verifying the installer/root hashes against protected source or another reviewed channel; never pipe an unverified network response directly into a shell.

```bash
tag=compat-v1.2.0_1.2.0_1.2.0_0.2.0-s1
base="https://github.com/jczhang02/lyntty/releases/download/$tag"
curl --proto '=https' --tlsv1.2 -fsSLO "$base/install.sh"
printf '%s  install.sh\n' INSTALLER_SHA256_FROM_REVIEWED_RELEASE | sha256sum -c -
sh ./install.sh \
  --base-url "$base" \
  --version 1.2.0 \
  --archive-sha256 ARCHIVE_SHA256_FROM_SIGNED_BOM \
  --manifest-sha256 MANIFEST_SHA256_FROM_SIGNED_BOM
```

The script downloads into `${XDG_CACHE_HOME:-$HOME/.cache}/lyntty/install`, verifies the archive before extraction, checks archive paths, runs the candidate self-check, authenticates interactively in the CLI process, and then installs. Its transaction directory is removed on exit.

Default installation roots:

- Linux: `${XDG_DATA_HOME:-$HOME/.local/share}/lyntty`
- macOS: `$HOME/Library/Application Support/Lyntty`
- launcher: `$HOME/.local/bin/lyntty`

The install root contains `versions/`, an atomic `current` symlink, private extension snapshots, `install-state.json`, and a crash-recovery journal. Credentials and session state remain in `LYNTTY_HOME_DIR`; updates never copy or replace that directory.

## User services

Linux uses `~/.config/systemd/user/lynttyd.service` (or `XDG_CONFIG_HOME`). macOS uses `~/Library/LaunchAgents/dev.jczhang.lynttyd.plist`. Both run `current/lynttyd` directly as the logged-in user, with no sudo and no shell wrapper. Service installation refuses to run as root or before `lyntty auth login` succeeds.

```bash
lyntty daemon install
lyntty daemon status
lyntty daemon stop
lyntty daemon start
lyntty daemon uninstall
```

The installer never reloads a running Pi session. If it changes the managed extension, start a new Pi session or run `/reload` yourself.

## Explicit update and rollback

A verified candidate invokes:

```bash
./lyntty update apply --manifest-sha256 <trusted-manifest-sha256>
lyntty update status --json
lyntty update rollback
```

The updater writes intent before each mutation, stops the old service, swaps the extension and `current` pointer atomically, restarts `lynttyd`, and requires a matching healthy daemon before committing. A failed candidate restores the exact prior extension bytes and release pointer, restarts the old service, and quarantines the failed release. An interrupted journal is recovered before the next install/update. Rollback only selects the recorded previous known-good release.

`lyntty update check` now fetches and verifies the signed Compatibility BOM, applies Stable/Preview trust isolation, persists a monotonic highest accepted sequence/digest per channel, and selects the exact archive URL, archive SHA-256, and internal artifact-manifest SHA-256 for the current platform. A higher signed rollback sequence is authoritative even when the selected CLI SemVer decreases; older replay and same-sequence equivocation fail closed. Formal candidate artifacts embed the reviewed public trust store under `runtime/release/trust-roots.json`; source-mode checks require an explicit trust file or environment value. `update apply` remains the narrow transaction seam used by the hash-pinned installer and still requires the trusted internal manifest digest. macOS notarization and Windows Authenticode remain external Stable publication gates.
