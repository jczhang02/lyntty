# R90 — Relay 多架构 SBOM 恢复

日期：2026-07-21

分支：`fix/stable-relay-multiarch-sbom`

Bead：`lyntty-24v`

实现 commit：`aa8130aa2104de545e3ac475b08e28530d9ceadf`（本地 GPG signature 验证通过）。

## 失败

首次完整 Stable Candidate run `29825007418` 在 `Generate SPDX SBOMs and deterministic provenance subjects` 安全停止。此前已从 protected main `9180546fe8bc2282a62c061873b4cde03b589600` 完成五个平台 CLI、签名 Android APK 和 amd64/arm64 Relay OCI layout；尚未进入 BOM assembly、Candidate sealing 或可 Promotion 的 Candidate bundle upload、tag/Release、GHCR push 或生产部署。Buildx 自动保留了 `.dockerbuild` 诊断记录，但它不是 Candidate artifact，不能 Promotion。

Syft 扫描 multiarch OCI archive 时遇到 nested `application/vnd.oci.image.index.v1+json`，无法把两个 image 当作一个 source。只扫描 host 架构会产生不完整证据，因此不能作为修复。

## 修复

`scripts/relay-oci-sbom.ts`：

1. 验证 top-level OCI index、nested index blob 的 SHA-256 与 size；
2. 强制且只接受一个 `linux/amd64` 和一个 `linux/arm64` image manifest，验证两个 blob；只允许与它们对应的 BuildKit `unknown/unknown` attestation descriptor，并拒绝其他平台或 descriptor；
3. 拒绝 symlink layout parent，为每次 Syft scan 写入临时单平台 OCI index view，失败时也逐字节恢复原 top-level `index.json`；
4. 分别生成 `relay-linux-amd64.spdx.json` 和 `relay-linux-arm64.spdx.json`；
5. 生成确定性 `relay.spdx.json`，以 SPDX 2.3 `externalDocumentRefs` 和 `VARIANT_OF` 关系 hash-reference 两个平台 document，并绑定 multiarch OCI index digest；
6. 要求 SPDX index digest 与实际构建 OCI layout 捕获的 digest 完全一致。

Candidate checksums、签名 Compatibility BOM 和最终 Release checksums 会绑定三个 SPDX document 与 `relay-oci-platforms.json`。Promotion 把 SPDX index attach 到 multiarch image digest，并发布其引用的两个精确平台 document。

`relay-image.yml` 现在会在每个 PR 上走同一条 Buildx → nested OCI → 双平台 Syft → SPDX index 路径，不执行发布。

## 验证

本地已通过：hardening/redaction/Relay-SBOM `30/0`、release/publication/Relay-SBOM/artifact `26/0`、Wire `36/0`、CLI `585/0`、Relay `119/0`、App `812/0`（3276 assertions）；全部 workflow YAML、25 个 Bash block 的 `bash -n`/error-level ShellCheck 及 `git diff --check` 通过。

本机没有 Docker/Buildx/Syft，因此无法运行真实 OCI scan；protected PR 的 `Relay image verification` 是合并前必须通过的 real-path acceptance。

对抗式 review 推动修复了额外平台 coverage、child SBOM/manifest 绑定、symlink layout parent、signed-BOM supplementary evidence、逐字节 index 恢复和 adversarial tests。最终只读复核返回 `PASS`，无 P0/P1/P2。

## 残余状态

失败 run `29825007418` 没有 Candidate artifact，不能 Promotion 或复用。修复合并后必须从新的 protected main 重建 replacement Candidate，并对其精确 APK 重新做实体 Android 验收。
