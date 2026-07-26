# CLI 发布（中文同步说明）

> 同步状态（2026-07-26）：本页与英文版 [`cli.md`](./cli.md) 同步；artifact、安装、服务、更新、回滚与原生签名契约必须成对维护。

最终用户运行 compiled `lyntty`/`lynttyd`，不得被要求安装 Bun 或 Node-family runtime。

## 当前 Stable 的完整 bootstrap

Stable Release 同时发布 `install.sh`、其 SHA sidecar、`stable-release-trust-roots.json`、签名 BOM 和五个平台 archive。首次安装必须先通过受保护 source 或独立审核渠道确认 installer/root hash，不能把未经验证的网络内容直接 pipe 给 shell。archive SHA-256 与内部 manifest SHA-256 必须来自已验证的签名 BOM，不能从独立 `latest` 文件推断。

下面是 immutable Stable `compat-v1.2.0_1.2.0_1.2.0_0.2.0-s1` 的 release-specific bootstrap。所有值都固定在受保护仓库 source 中，而不是在执行时信任同一次网络响应。使用前应检查包含这张表的仓库 revision 已通过签名验证；如果要安装其他 Release，请停止并取得该 Release 单独审核过的值。

这段 shell 会 hash-pin installer、trust roots、BOM 和 signature envelope，但不会自行执行 BOM 的 Ed25519 验证。Archive 与内部 manifest digest 是从该签名 BOM 审核后抄录的值；安装后的 candidate 内嵌同一 Stable trust roots，用于后续 update 验证。

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

Installer 会先在 candidate CLI process 中执行交互认证；在 App 中批准配对后，同一个 transaction 会安装 CLI、`lynttyd` user daemon service 和本地 Pi extension，并运行 candidate verification。不要在首次安装成功后重复执行这些 repair commands。

首次 owner-operated 自用 Stable 会发布全部五个平台 archive，但 macOS/Windows executable 明确不做 Apple notarization 或 Authenticode。其完整性由精确 source commit、archive/manifest SHA-256、runtime-free self-check、GitHub attestations 和签名 Compatibility BOM 绑定；这不等于平台代码签名。macOS Gatekeeper 或 Windows SmartScreen 因此可能要求用户手动确认。未来若需要平台签名，再使用可选的 [`native-signing.zh.md`](./native-signing.zh.md) 流程。
