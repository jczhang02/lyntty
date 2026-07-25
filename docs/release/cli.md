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

Linux artifacts target glibc. Supported target names are `linux-x64`, `linux-arm64`, `darwin-x64`, `darwin-arm64`, and `windows-x64`. The first owner-operated self-use Stable release publishes all five, but the macOS and Windows executables are intentionally not Apple-notarized or Authenticode-signed. Their integrity is instead bound by the exact source commit, archive and manifest SHA-256 values, runtime-free self-checks, GitHub attestations, and the signed Compatibility BOM. Optional future platform signing is documented in [`native-signing.md`](./native-signing.md).

## Installation

A release-specific installer command must pin both the archive SHA-256 and `artifact-manifest.json` SHA-256 from the signed Compatibility BOM. Do not copy hashes from an unsigned mirror or infer them from independent `latest` files.

The formal Stable Release publishes `install.sh`, `install.sh.sha256`, `stable-release-trust-roots.json`, the detached signed BOM, and every selected archive together. The values below are a reviewed, release-specific bootstrap for immutable Stable `compat-v1.2.0_1.2.0_1.2.0_0.2.0-s1`; they are pinned in protected repository source rather than fetched from the same network response at execution time. Review the verified repository revision containing this table before trusting it. If you intend to install another Release, stop and obtain that Release's separately reviewed values.

The shell check hash-pins the installer, trust roots, BOM, and signature envelope. It does not itself perform the BOM's Ed25519 verification; the archive and internal-manifest values below are the reviewed values from that signed BOM. The installed candidate embeds the same Stable trust roots for subsequent update verification. Never pipe a network response directly into a shell.

```bash
tag=compat-v1.2.0_1.2.0_1.2.0_0.2.0-s1
version=1.2.0
base="https://github.com/jczhang02/lyntty/releases/download/$tag"
bootstrap_dir=$(mktemp -d)
trap 'rm -rf "$bootstrap_dir"' EXIT HUP INT TERM

curl --proto '=https' --tlsv1.2 -fsSL \
  --output "$bootstrap_dir/install.sh" "$base/install.sh"
curl --proto '=https' --tlsv1.2 -fsSL \
  --output "$bootstrap_dir/stable-release-trust-roots.json" "$base/stable-release-trust-roots.json"
curl --proto '=https' --tlsv1.2 -fsSL \
  --output "$bootstrap_dir/compatibility-bom.json" "$base/compatibility-bom.json"
curl --proto '=https' --tlsv1.2 -fsSL \
  --output "$bootstrap_dir/compatibility-bom.sig.json" "$base/compatibility-bom.sig.json"

if command -v sha256sum >/dev/null 2>&1; then
  sha256_file() { sha256sum "$1" | awk '{print $1}'; }
elif command -v shasum >/dev/null 2>&1; then
  sha256_file() { shasum -a 256 "$1" | awk '{print $1}'; }
else
  echo 'A SHA-256 tool is required' >&2
  exit 1
fi
check_sha256() {
  expected=$1
  path=$2
  [ "$(sha256_file "$path")" = "$expected" ] || {
    echo "SHA-256 mismatch: $path" >&2
    exit 1
  }
}

check_sha256 e6db6345bc2c0c22a180ff86d93df67486dbad9e694699ba74a8f4738272e85f "$bootstrap_dir/install.sh"
check_sha256 def81e7ccffac1915c5b792674876f0c24fb4b8df648da0f3d39e75e117b0608 "$bootstrap_dir/stable-release-trust-roots.json"
check_sha256 df231effa7b3047fb7acdd400cff49434494012b8e17767aee72f1d7049a8bca "$bootstrap_dir/compatibility-bom.json"
check_sha256 d74fb3508fad79c0705349788da12e1ba7e417953cf46d9e8afb4260b00bf43e "$bootstrap_dir/compatibility-bom.sig.json"

case "$(uname -s):$(uname -m)" in
  Linux:x86_64|Linux:amd64)
    target=linux-x64
    archive_sha256=f665417d53d259da143a42589a7efc1374e61aeff6c26367a6974719c08d658f
    manifest_sha256=9702e4f9c5220c549763fd796da747d92ad04d36d6af794dd1b75947b7822df9
    ;;
  Linux:aarch64|Linux:arm64)
    target=linux-arm64
    archive_sha256=29d6e6fc56eb0d7017c709bcc2de5fb48aaa97505c8eeec32aec72dca03a0091
    manifest_sha256=d0e5f254356870e45d8ed032e42989532e3308e03395adc5b37bbc309b3ce751
    ;;
  Darwin:x86_64|Darwin:amd64)
    target=darwin-x64
    archive_sha256=bfdaf396ed1c26ed6275811221a406a00c7fc87e1be72c913afac23968f2658d
    manifest_sha256=a6288f3839cbc59afe8aed63efa5ed1b4b50c28ef29e685b9ca8bcb1f3c13c05
    ;;
  Darwin:arm64|Darwin:aarch64)
    target=darwin-arm64
    archive_sha256=5b48ef1cd3cd830cb99b765bfe47159f185803a9d18eaa793aa6cd12db801731
    manifest_sha256=d29eaa68f21f6c85c0c61b90302191ba1e46f90c6018f7f8f1f8060726b78443
    ;;
  *)
    echo 'This installer supports Linux and macOS x64/arm64 only' >&2
    exit 1
    ;;
esac

sh "$bootstrap_dir/install.sh" \
  --base-url "$base" \
  --version "$version" \
  --target "$target" \
  --archive-sha256 "$archive_sha256" \
  --manifest-sha256 "$manifest_sha256"
```

The script downloads into `${XDG_CACHE_HOME:-$HOME/.cache}/lyntty/install`, verifies the archive before extraction, checks archive paths, and runs the candidate self-check. It then performs interactive authentication; after App approval, the same installer transaction installs the CLI, `lynttyd` user daemon service, and local Pi extension. Its transaction directory is removed on exit. Do not repeat the repair commands after a successful first install.

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

`lyntty update check` now fetches and verifies the signed Compatibility BOM, applies Stable/Preview trust isolation, persists a monotonic highest accepted sequence/digest per channel, and selects the exact archive URL, archive SHA-256, and internal artifact-manifest SHA-256 for the current platform. A higher signed rollback sequence is authoritative even when the selected CLI SemVer decreases; older replay and same-sequence equivocation fail closed. Formal candidate artifacts embed the reviewed public trust store under `runtime/release/trust-roots.json`; source-mode checks require an explicit trust file or environment value. `update apply` remains the narrow transaction seam used by the hash-pinned installer and still requires the trusted internal manifest digest. On macOS or Windows, users must explicitly accept any Gatekeeper or SmartScreen warning caused by the disclosed lack of platform code signing.
