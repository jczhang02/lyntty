# Android APK 发布（中文同步说明）

> 同步状态（2026-07-23）：签名输入、证书 pin、channel 与审计步骤见英文版 [`android-apk.md`](./android-apk.md)，当前以英文版为准。

Production APK 必须使用永久密钥并 fail closed；本地 throwaway/Preview signer 只能用于独立 Preview 包，不能冒充 Stable 签名证据。

## 首次正式 Stable

首次 Compatibility Stable 固定为 App `1.2.0`、`versionCode=6`、package `dev.jczhang.lyntty`，并沿用现有 production certificate SHA-256 `25e3928a7cc228254e8249e684c6ab661f5c87140e23db7406afc64af29f0cf5`。`6` 必须能从现有 production `5` 原位升级。

Android-only workflow 只验证永久签名/build 路径并上传短期 artifact，不能发布。最终 Promotion 只允许发布 Compatibility Candidate 内的精确 APK。Stable 有两条互斥 owner 审批路径：常规路径必须在实体 Android 上测试同一 Candidate 字节，并同时提供 `physical_phone_accepted=true` 与精确 APK SHA-256；owner-operated 自用 waiver 路径必须提供 `physical_phone_accepted=false`、空 accepted hash 和精确短语 `I accept publishing this exact Stable Candidate without physical Android validation`。waiver 绝不冒充实体机验收，会发布 `android-validation.json` 审计资产，并在 immutable Release body 顶部加入中英文未验收警告。

## 短期 Expo Dev debug artifact

`.github/workflows/android-expo-dev.yml` 是独立开发分发入口，不是 Release channel。它只能手动触发，只接受受保护 `main` 的精确提交，没有 `contents: write`，仅上传 14 天 Actions artifact，不创建 tag、Draft、prerelease 或 Release。

固定契约如下：

| 属性 | Expo Dev artifact |
| --- | --- |
| Package | `dev.jczhang.lyntty.dev` |
| Gradle variant | `Debug` |
| App 环境 | `development` |
| Debuggable | `true` |
| JavaScript | 不内置 `assets/index.android.bundle`，必须连接 Metro |
| Metro 端口 | `8081` |
| ABI | `arm64-v8a`、`x86_64` |
| Signer | 仓库内公开的开发 signer |
| 分发 | 仅短期 Actions artifact |

workflow 从 App package 读取 `versionName`，用 `930000 + GITHUB_RUN_NUMBER` 生成只属于开发包的单调 `versionCode`，并把源码 SHA 与 version code 写入 APK 文件名。`GITHUB_RUN_ATTEMPT > 1` 会被拒绝；失败后必须重新手动 dispatch，避免复用 version、APK、artifact 或 provenance 身份。上传前会验证 package、版本、debuggable、唯一 v2 signer、签名证书、ABI、standalone bundle 缺失、Metro 端口，以及 Gradle 执行期间没有 Node-family 进程。artifact 还包含 SHA-256、APK/runtime audit、provenance、严格 manifest、使用说明和 GitHub attestation。

固定 signer 是有意公开的，只用于 `.dev` 包连续安装，不是 production 信任凭据。使用者必须校验绑定源码的 checksum 与 GitHub attestation，不能把该证书当作发布者认证。

这里的“Expo Dev APK”指已签入 Expo 原生工程的 Debug variant，不安装可选 `expo-dev-client` 依赖或 Dev Launcher。App 通过普通 React Native Debug host 连接 Expo CLI Metro，具体命令见 [`docs/development.zh.md`](../development.zh.md)。

该入口不能发布或更新 Version Preview、Stable、`compat-preview`、Compatibility BOM、Relay、CLI、Google Play、EAS Update 或 App 自更新 feed；现有 Preview candidate/promotion workflow 保持不变。

## 独立 Preview APK prerelease

本轮只发布 `dev.jczhang.lyntty.preview`：

- 版本 `1.2.0`、versionCode `920001`；
- GitHub Pre-release，不替换 Latest；
- 不发布 Stable APK、CLI、Relay OCI、Compatibility BOM、Preview Relay 或 Play 版本；
- 测试者在电脑运行 `bun preview:test` 启动隔离本地 Relay；
- Preview App 必须先设置并验证本地 Relay，之后才能读取凭据或启动同步；Stable 行为不变。

`.github/workflows/android-preview-candidate.yml` 只构建、审计、attest APK 与严格 Candidate manifest，并上传候选产物，不发布。常规 Candidate 到 Promotion 的 protected `main` 只允许改动 allowlist、`docs/evidence/r86-preview-apk-candidate*.md` 和对应五个审阅 sidecar。

常规发布必须完成同一 Candidate 的实体 Android 原位升级与全新启动测试。若该矩阵无法执行，只能先通过单独的受保护策略审阅，并同时满足：所有者明确授权、`physical_phone_accepted=false`、dispatch 输入精确短语 `I accept publishing this exact Candidate without physical Android validation`。workflow 会拒绝空 waiver、同时勾选实体机通过与 waiver，或任何其他短语。

纯 waiver 策略 PR 只允许修改 Promotion workflow、对应 hardening test、本中英文 runbook 和既有 R86 叙述。如果旧 Candidate 在发布前被撤销，组合的 replacement-evidence + waiver PR 还可以用新 protected-main Candidate 的逐字节产物与精确身份替换 tracked Candidate manifest/sidecar，并恢复一条 allowlist 绑定。该 replacement 会合法更换外部 APK 以及 checksum、APK audit、provenance 三项资产；runtime audit 可以保持相同。waiver 逻辑本身不得重建字节、扩大五项资产集合，也不得改变 tag、标题、版本、signer 或发布范围。

Promotion 前仍必须启用仓库 immutable releases，并用无 bypass 的 active tag ruleset 禁止更新/删除 `android-preview-v*`；通过 admin API 核实后设置仓库变量 `LYNTTY_IMMUTABLE_RELEASES_ENABLED=true` 和 `LYNTTY_PREVIEW_TAG_RULESET_ID=<数字 id>`。`.github/workflows/android-preview-promote.yml` 会复核两种授权模式只能命中其一，并继续验证受保护 ref、精确 delta、allowlist、双 attestation、完整 provenance/audit、发布前后精确资产和 `isImmutable=true`。waiver 模式会在公开 Release Notes 顶部确定性追加中英文“本 Candidate 未完成实体 Android 验证”警告，再把完全相同的 APK 字节及 SHA-256、APK/runtime audit、provenance 发布为非 Latest prerelease。精确 Draft 恢复会硬绑定已审阅 Release ID 及既有 asset ID，且不会重建或重新上传资产。本次恢复只允许 target 为已记录的 prior protected main 或 final protected workflow commit。完成精确 ID/digest/字节、正文、tag 状态和 main 新鲜度核验后，一个完整 Release-ID 请求会钉死 final target 并发布同一 Draft。未发布 Draft 要求 tag 不存在，发布请求会从已验证的 `target_commitish` 创建 tag。只有已发布 immutable retry 才可接受既有 tag，且该 tag 必须直接指向 final commit。

```text
Tag: android-preview-v1.2.0-920001
Title: V1.2.0 Local First 📡
APK: lyntty-preview-v1.2.0-920001.apk
```

若声称实体手机验收通过，必须覆盖：`910003 → 920001` 原位升级、已有有效 Relay 保留、清除 App 数据后账号操作前强制设置 Relay、设置页按 Android 返回键退出、Clear Relay 后重新进入门禁、本地配对和 managed Pi 消息往返，以及重开 App 恢复。专用自动化 seam 为独立命令 `bun run e2e:maestro:preview-first-run`（`e2e/maestro/standalone/preview_first_run.yml`），不能替代实体手机验收。所有者 waiver 也不能把 CI、静态审计、旧 APK 测试或隔离 Relay 预检表述成实体机通过；公开警告与 workflow summary 必须持续保留这一边界。
