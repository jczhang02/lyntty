# R86 — Android Preview APK Candidate（中文）

日期：2026-07-21

状态：Candidate run `29762476280` 已在发布前被 R87 依赖安全升级取代。其历史证据继续保留，但 allowlist 授权已撤销，等待新的替代 Candidate。

## Candidate 身份

```text
Candidate run: 29762476280
Candidate URL: https://github.com/jczhang02/lyntty/actions/runs/29762476280
Artifact: android-preview-candidate-29762476280
Artifact ID: 8470552908
Artifact archive digest: sha256:3e9ebcb5b0f401831cc5e2181cd294bf338222b149de8562e68273aea8089973
APK: lyntty-preview-v1.2.0-920001.apk
APK size: 126797863 bytes
APK SHA-256: 9025d83a142ded5a618ef15c56c9bdd5486fed8336a53f1b9f0c7336b325aae9
Source commit: 33d7a99c57cce0783d069e95ba6d4abc59a53c1d
Source tree: 6c6ba760d68d0f68e85d1af839efb90a0ab9c252
applicationId: dev.jczhang.lyntty.preview
versionName: 1.2.0
versionCode: 920001
ABIs: arm64-v8a, x86_64
Signer SHA-256: ebd23c222b690e2be635fe3e52bd70b6fb86c5570ab279bc4e8c1f22ed90ef9c
```

## 发布前被取代

受保护 PR #20 为 GHSA-395f-4hp3-45gv 将审计依赖图升级到 `shell-quote@1.9.0`，并以 `08b56175a8f22bc6f4b7d014de4767232fc930e7` 合入。根 `package.json` 与 `bun.lock` 均是 Android Candidate 构建输入，因此即使上述字节、sidecar 和 attestation 仍是有效历史证据，该 source identity 也不能再用于 Promotion。

公共 tag 与 Release 从未存在。本准备变更只从 `scripts/preview-apk-allowlist.json` 删除旧 `920001` 条目，不删除或改写历史证据。保留的 `910003` 条目继续支持手动升级 fixture，同时 Candidate 策略可对新的 protected-main 构建继续强制 `920001 > maxAllowlistedVersionCode`。

Focused JSON 验证确认只保留一个 artifact、allowlist 最大 `versionCode` 为 `910003`，且 `920001` replacement 重新满足门禁。`bun audit` 报告零漏洞；`bun run ci:fast` 通过 hardening/redaction 20、Wire 33/76、CLI 585/1272、Relay 119/332、App 90 个文件 812/3276 加 bundle smoke，以及 lifecycle 35/194。tag 与 Release 不存在检查也通过。

## Candidate 验证

workflow 从受保护 `main` 运行，全部步骤成功：精确源码验证、依赖安装、未审阅配置拒绝检查、Bun-only 双 ABI 构建审计、APK staging/audit、APK attestation、manifest attestation 和 Candidate 上传。最终只保留一个 artifact，没有创建 tag 或 Release。

下载后的 Candidate 精确包含 APK、SHA-256 sidecar、APK audit、runtime audit、provenance、Release Notes、标题和 Candidate manifest。manifest 以名称、大小和 SHA-256 精确绑定七项发行输入。独立复核确认：

- APK sidecar 与 manifest 均绑定 SHA-256 `9025d83a142ded5a618ef15c56c9bdd5486fed8336a53f1b9f0c7336b325aae9` 和大小 `126797863`；
- provenance 绑定 run `29762476280`、source commit/tree、package、版本、signer、ABI、tag、标题、APK hash 和大小；
- App 内嵌 source commit 为 `33d7a99c57cce0783d069e95ba6d4abc59a53c1d`；
- 真实 build-tools 37 审计确认唯一 signer、APK Signature Scheme v2、非 debuggable package、standalone bundle，以及精确 `arm64-v8a,x86_64`；
- runtime audit 显示 Node-family `execve` 命中为 0，sentinel 调用为 0；
- APK 与 manifest 的严格 GitHub attestation verification 均绑定 Candidate workflow、受保护 `main`，以及 signer/source digest `33d7a99c57cce0783d069e95ba6d4abc59a53c1d`；
- Release 标题与 Notes 已完整解析，不含模板占位符；
- 公共 tag `android-preview-v1.2.0-920001` 和 GitHub Release 仍不存在。

`docs/evidence/artifacts/r86-preview-apk-candidate/` 下五个文件继续作为 Candidate 对应 sidecar 的逐字节历史副本保留。APK 本身按设计不提交。原 evidence PR 曾为这些字节新增一条 allowlist 绑定；本撤销变更删除该绑定，但不改写历史 sidecar。

## 未执行实体 Android 验收

这份历史 Candidate 原计划的实体机矩阵如下：

1. 将已安装的 `1.1.0` / `910003` Preview APK 原位升级至 `1.2.0` / `920001`，确认既有有效 Relay 配置仍可使用；
2. 清除 App 数据或全新安装，确认 Relay 设置完成前不能启动认证或同步；
3. 确认非法 Relay 被拒绝、本地 Relay `/health` 契约可通过，且 Android 返回键能退出强制设置页；
4. 配对节点，打开 managed Pi session，从手机发送独特消息，收到独特 assistant 回复，并在重开 App 后确认连续性；
5. 清除 Relay，确认 App 回到设置门禁，且不复用旧身份。

该矩阵没有针对这份已取代 APK 执行。后续任何 Promotion 必须使用替代 Candidate 及其新审阅 hash，而不能使用上方记录的 APK identity。所有者随后授权如实标注“设备未验证”后发布，但单独的受保护 waiver 策略必须应用于替代 Candidate，并保持 `physical_phone_accepted=false`；本证据不声称任一 Candidate 已完成实体机验收。

## 发布边界

本撤销 PR 不创建公开 Release、Stable APK、CLI archive、Relay image、Compatibility BOM、托管 Preview Relay、Google Play artifact 或 OTA update。只有新的 protected-main Candidate 完成构建、审计、attest 并绑定新审阅的精确 SHA-256 后，Promotion 才能继续；truthful waiver 策略与公开警告还必须通过独立受保护检查。
