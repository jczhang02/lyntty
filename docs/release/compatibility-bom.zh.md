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

本次 owner-operated 自用 Stable 仍发布五个平台 CLI/`lynttyd` archive，但 macOS/Windows executable 明确不做 Apple notarization 或 Windows Authenticode。Candidate 直接从同一 protected source 构建五个平台，并在 provenance 中记录 `platformCodeSigning.policy=not-required-self-use`。archive SHA-256、内部 manifest SHA-256、source commit、runtime-free self-check、签名 BOM 与 GitHub attestations 仍是强制门禁。

Relay Candidate 对同一 multiarch OCI layout 的 amd64/arm64 manifest 分别运行 Syft，并生成 hash-reference 两个平台 SPDX document 的 SPDX 2.3 index；不能把只扫描 host 架构的 SBOM 冒充 multiarch coverage。

Promotion 与 rollback 统一调用 `scripts/github-release.ts`：绑定单一 Release ID 和 asset ID，逐项验证 API digest 与下载字节，不删除、不替换资产；发布边界再次检查 GitHub `main`，用 non-force Git push 原子创建精确 direct tag（中断重试只接受同一 tag/commit），再通过一个完整 Release-ID `PATCH` 发布。Stable 常规路径仍要求精确 Candidate APK 的实体 Android 验收及其 SHA-256。owner-operated 自用发布可改用互斥的 `owner-waiver-unverified`：实体验收保持 false、accepted hash 必须为空、dispatch 必须包含精确确认短语；immutable Release 顶部会披露未做实体机验收，并发布经 checksums/attestation 绑定的 `android-validation.json`。

Stable 由 owner 显式审批；无需独立 reviewer，也不要求 Apple/Windows 生产证书。Release body 必须披露 macOS/Windows archive 未做平台代码签名，不能把 BOM 签名或 GitHub attestation 描述成平台签名。

生产 Relay 部署必须安装精确 Stable trust roots 和 minimum sequence，要求旧镜像已按 digest 固定，核验备份与 sidecar、运行容器镜像，并通过本地和公网 `/v1/version` 证明 BOM、sequence、APK URL/hash 全部一致；仅 `/health` 成功不算验收。
