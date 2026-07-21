# CLI 发布（中文同步说明）

> 同步状态（2026-07-21）：artifact、安装、服务、更新、回滚与原生签名契约见英文版 [`cli.md`](./cli.md)，当前以英文版为准。

最终用户运行 compiled `lyntty`/`lynttyd`，不得被要求安装 Bun 或 Node-family runtime。

Stable Release 同时发布 `install.sh`、其 SHA sidecar、`stable-release-trust-roots.json`、签名 BOM 和五个平台 archive。首次安装必须先通过受保护 source 或独立审核渠道确认 installer/root hash，不能把未经验证的网络内容直接 pipe 给 shell。archive SHA-256 与内部 manifest SHA-256 必须来自已验证的签名 BOM。

macOS/Windows 字节必须先经过 [`native-signing.zh.md`](./native-signing.zh.md) 的生产签名和独立 verifier：两个 macOS target 都要 Developer ID、notarization、Gatekeeper 与 timestamp；Windows 要 Authenticode、RFC3161 timestamp 和固定 certificate thumbprint。任一 target 缺失都会阻止整个 Stable Candidate。
