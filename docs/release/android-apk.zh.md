# Android APK 发布（中文同步说明）

> 同步状态（2026-07-19）：签名输入、证书 pin、channel 与审计步骤见英文版 [`android-apk.md`](./android-apk.md)，当前以英文版为准。

Production APK 必须使用永久密钥并 fail closed；本地 throwaway/Preview signer 只能用于独立 Preview 包，不能冒充 Stable 签名证据。

## 独立 Preview APK prerelease

本轮只发布 `dev.jczhang.lyntty.preview`：

- 版本 `1.2.0`、versionCode `920001`；
- GitHub Pre-release，不替换 Latest；
- 不发布 Stable APK、CLI、Relay OCI、Compatibility BOM、Preview Relay 或 Play 版本；
- 测试者在电脑运行 `bun preview:test` 启动隔离本地 Relay；
- Preview App 必须先设置并验证本地 Relay，之后才能读取凭据或启动同步；Stable 行为不变。

`.github/workflows/android-preview-candidate.yml` 只构建、审计、attest APK 与严格 Candidate manifest，并上传候选产物，不发布。常规 Candidate 到 Promotion 的 protected `main` 只允许改动 allowlist、`docs/evidence/r86-preview-apk-candidate*.md` 和对应五个审阅 sidecar。

常规发布必须完成同一 Candidate 的实体 Android 原位升级与全新启动测试。若该矩阵无法执行，只能先通过单独的受保护策略 PR，并同时满足：所有者明确授权、`physical_phone_accepted=false`、dispatch 输入精确短语 `I accept publishing this exact Candidate without physical Android validation`。workflow 会拒绝空 waiver、同时勾选实体机通过与 waiver，或任何其他短语。该策略 PR 也纳入 Candidate 到 Promotion 的精确路径清单，只允许修改 Promotion workflow、对应 hardening test、本中英文 runbook 和既有 R86 evidence；不得修改或重建 APK、Candidate manifest、五项 Release 资产、provenance、attestation、allowlist 绑定、tag、标题或版本。

Promotion 前仍必须启用仓库 immutable releases，并用无 bypass 的 active tag ruleset 禁止更新/删除 `android-preview-v*`；通过 admin API 核实后设置仓库变量 `LYNTTY_IMMUTABLE_RELEASES_ENABLED=true` 和 `LYNTTY_PREVIEW_TAG_RULESET_ID=<数字 id>`。`.github/workflows/android-preview-promote.yml` 会复核两种授权模式只能命中其一，并继续验证受保护 ref、精确 delta、allowlist、双 attestation、完整 provenance/audit、发布前后精确资产和 `isImmutable=true`。waiver 模式会在公开 Release Notes 顶部确定性追加中英文“本 Candidate 未完成实体 Android 验证”警告，再把完全相同的 APK 字节及 SHA-256、APK/runtime audit、provenance 发布为非 Latest prerelease。

```text
Tag: android-preview-v1.2.0-920001
Title: V1.2.0 Local First 📡
APK: lyntty-preview-v1.2.0-920001.apk
```

若声称实体手机验收通过，必须覆盖：`910003 → 920001` 原位升级、已有有效 Relay 保留、清除 App 数据后账号操作前强制设置 Relay、设置页按 Android 返回键退出、Clear Relay 后重新进入门禁、本地配对和 managed Pi 消息往返，以及重开 App 恢复。专用自动化 seam 为独立命令 `bun run e2e:maestro:preview-first-run`（`e2e/maestro/standalone/preview_first_run.yml`），不能替代实体手机验收。所有者 waiver 也不能把 CI、静态审计、旧 APK 测试或隔离 Relay 预检表述成实体机通过；公开警告与 workflow summary 必须持续保留这一边界。
