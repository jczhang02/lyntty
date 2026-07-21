# Compatibility BOM（中文同步说明）

> 同步状态（2026-07-21）：canonical bytes、签名、sequence、兼容窗口和 channel 隔离见英文版 [`compatibility-bom.md`](./compatibility-bom.md)，当前以英文版为准。

BOM、签名与 predecessor digest 都绑定带末尾 LF 的精确 canonical 文件字节；Stable/Preview 的 key、public key、URL、package、image 与 replay state 必须隔离。

首次正式 Stable 身份固定为：

- App/CLI/Relay/Wire：`1.2.0` / `1.2.0` / `1.2.0` / `0.2.0`；
- sequence `1`，tag `compat-v1.2.0_1.2.0_1.2.0_0.2.0-s1`；
- Android package `dev.jczhang.lyntty`、`versionCode=6`，沿用证书 SHA-256 `25e3928a7cc228254e8249e684c6ab661f5c87140e23db7406afc64af29f0cf5`；
- Stable BOM key id `stable-2026-01`，从 sequence `1` 生效；
- Relay repository `ghcr.io/jczhang02/lyntty-relay`。

公开 Stable root 位于 `config/release-trust-roots/stable.json`。Candidate 与 Promotion 要求受保护 environment 的 `LYNTTY_RELEASE_TRUST_ROOTS` 与它逐字段一致；私钥只存在于受保护 secret 和仓库外加密备份。

Stable 原生 CLI 先由 `native-signing-producer.yml` 在对应 macOS/Windows runner 上签名、重建 manifest、notarize/timestamp，并发布不可变 `native-signing-*` staging prerelease；再由独立 `native-signing.yml` 验证并 attest。缺少任一生产证书或验证结果都必须停止。

Promotion 与 rollback 统一调用 `scripts/github-release.ts`：绑定单一 Release ID 和 asset ID，逐项验证 API digest 与下载字节，不删除、不替换资产；发布边界再次检查 GitHub `main`，用 non-force Git push 原子创建精确 direct tag（中断重试只接受同一 tag/commit），再通过一个完整 Release-ID `PATCH` 发布。Stable 还必须提供精确 Candidate APK 的实体 Android 验收及其 SHA-256；没有 waiver。

生产 Relay 部署必须安装精确 Stable trust roots 和 minimum sequence，要求旧镜像已按 digest 固定，核验备份与 sidecar、运行容器镜像，并通过本地和公网 `/v1/version` 证明 BOM、sequence、APK URL/hash 全部一致；仅 `/health` 成功不算验收。
