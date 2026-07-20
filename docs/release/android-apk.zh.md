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

`.github/workflows/android-preview-candidate.yml` 只构建、审计、attest 并上传候选产物，不发布。候选 SHA-256 经 allowlist PR 审阅并完成实体 Android 原位升级与全新启动测试后，用户另行明确授权，`.github/workflows/android-preview-promote.yml` 才会发布完全相同的 APK 字节及 SHA-256、APK/runtime audit、provenance。

```text
Tag: android-preview-v1.2.0-920001
Title: V1.2.0 Local First 📡
APK: lyntty-preview-v1.2.0-920001.apk
```

实体手机验收必须覆盖：`910003 → 920001` 原位升级、已有有效 Relay 保留、清除 App 数据后账号操作前强制设置 Relay、设置页按 Android 返回键退出、Clear Relay 后重新进入门禁、本地配对和 managed Pi 消息往返，以及重开 App 恢复。专用自动化 seam 为 `e2e/maestro/01_preview_relay_gate.yml`，不能替代实体手机验收。
