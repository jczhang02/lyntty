# CLI 发布（中文同步说明）

> 同步状态（2026-07-21）：artifact、安装、服务、更新、回滚与原生签名契约见英文版 [`cli.md`](./cli.md)，当前以英文版为准。

最终用户运行 compiled `lyntty`/`lynttyd`，不得被要求安装 Bun 或 Node-family runtime。

Stable Release 同时发布 `install.sh`、其 SHA sidecar、`stable-release-trust-roots.json`、签名 BOM 和五个平台 archive。首次安装必须先通过受保护 source 或独立审核渠道确认 installer/root hash，不能把未经验证的网络内容直接 pipe 给 shell。archive SHA-256 与内部 manifest SHA-256 必须来自已验证的签名 BOM。

校验 `install.sh` 时，Linux 可以使用 `sha256sum`，原生 macOS 使用 `shasum -a 256`。两种路径都必须把实际 digest 与经过审核的 Release hash 逐字节比较，不要把 sidecar 或网络响应直接当作独立信任来源。

首次 owner-operated 自用 Stable 会发布全部五个平台 archive，但 macOS/Windows executable 明确不做 Apple notarization 或 Authenticode。其完整性由精确 source commit、archive/manifest SHA-256、runtime-free self-check、GitHub attestations 和签名 Compatibility BOM 绑定；这不等于平台代码签名。macOS Gatekeeper 或 Windows SmartScreen 因此可能要求用户手动确认。未来若需要平台签名，再使用可选的 [`native-signing.zh.md`](./native-signing.zh.md) 流程。
