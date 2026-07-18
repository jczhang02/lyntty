# R77 — Bun App 产品边界证据

日期：2026-07-16

分支/工作树：`refactor/bun-migration`，`worktrees/bun-migration`

范围：签名基线 `806c197fb63350de9fc5417e8cc5637553a09bc0` 之后的 Android-native、Pi-only App 边界

## 结果

当前 App 源码仅面向移动端（`android`、`ios`）。Android release-style 构建在 `PATH` 中用退出码 97 的哨兵替换 `node`、`npm`、`pnpm`、`npx`、`tsx` 后，仍能由 Bun 完成。干净构建得到的通用 APK：

- 使用独立 `Lyntty Preview` 证书和 APK Signature Scheme v2 签名；
- 包名为 `dev.jczhang.lyntty.dev`，版本为 `1.0.0`（`1`）；
- 包含 `arm64-v8a`、`armeabi-v7a`、`x86`、`x86_64`；
- 不包含 Expo Updates、Expo dev client/launcher/menu 或 Node/Bun 项目 runtime 可执行文件（Hermes 仍是允许的 React Native engine）；
- 已移除依赖传入的录音、定位、日历、电话状态、悬浮窗、支付和生物识别权限；
- 在全新临时 API 35 AVD 上通过 release APK 首次启动/创建账户 Maestro 流程。

源码同时删除 Web/Tauri/EAS/OTA、非 Pi 当前 runtime 选择、voice/social/artifact/subscription/telemetry 产品面、隐藏 diagnostics 和 developer mode 入口。旧 provider 字段和 Codex tool renderer 只保留在加密历史读取/显示边界。显式旧 provider 会话已 fail closed 为仅历史可读；model/effort 假控件已移除；发现的 Pi 会话先绑定 canonical relay identity，之后才允许用户明确选择 `wait|stop|interrupt` activation。图片 file envelope 会与下一条用户命令配对，由 `lynttyd` 解密，并以 Pi image content 送入 managed Pi SDK runtime 或普通 Pi extension 会话。

## 隔离 Android 构建

门禁开始前删除 `android/app/build` 和 `android/build`，避免旧 APK 冒充当前产物。第一次干净构建发现临时 `ccache` 权限问题；将 cache 明确指向临时目录后恢复，不改变仓库策略。Maven Central Java TLS EOF 通过仅存在于 `/tmp` 的 Gradle init script 绕过。

```bash
cd packages/lyntty-app/android
HOME=/tmp/lyntty-bun-app-release-gate/home \
GRADLE_USER_HOME=/tmp/lyntty-bun-app-release-gate/gradle \
CCACHE_DIR=/tmp/lyntty-bun-app-release-gate/ccache \
CCACHE_TEMPDIR=/tmp/lyntty-bun-app-release-gate/ccache-tmp \
BUN_EXECUTABLE=/usr/bin/bun \
APP_ENV=development \
PATH=/tmp/lyntty-bun-app-release-gate/bin:$PATH \
./gradlew :app:assembleRelease --no-daemon --stacktrace \
  --init-script /tmp/lyntty-bun-app-release-gate/mirror.init.gradle
```

结果：`BUILD SUCCESSFUL`；1,005 个 actionable task。增加源码和配置级音频/生物识别权限移除指令后再次生成最终 APK。

```text
SHA-256 6cf796c1715650cf2d02cb1222af9ad8c3562f52c727ab8fa1daae9fbd563eee
大小      198,343,201 bytes
```

临时 `PATH` 中的 `node`、`npm`、`pnpm`、`npx`、`tsx` 哨兵均会输出错误并退出 97；构建成功说明常规路径解析没有执行它们。迁移定义允许由 Bun 实现的 `node:*` import。

另行运行 `APP_ENV=production :app:validateSigningRelease`，并取消全部 Android 签名变量；Gradle 在配置阶段以状态 1 和 `Production release builds require Lyntty release signing properties` 失败，证明 production 不会回退到 preview signer。

## 产物审计

命令：

```bash
apksigner verify --verbose --print-certs app-release.apk
apkanalyzer manifest application-id app-release.apk
apkanalyzer manifest version-name app-release.apk
apkanalyzer manifest version-code app-release.apk
apkanalyzer manifest permissions app-release.apk
apkanalyzer manifest print app-release.apk
apkanalyzer files list app-release.apk
unzip -Z1 app-release.apk | grep '^lib/' | cut -d/ -f2 | sort -u
```

对 manifest 和文件表的禁止项扫描未发现 Expo Updates/dev runtime、`RECORD_AUDIO`、定位、日历、电话状态、悬浮窗、支付、生物识别/指纹或项目 runtime 可执行文件。App 声明的能力权限只有网络状态、通知、签名 APK 安装和配对相机；Android/通知依赖另行带入 Internet、唤醒/震动/开机、FCM、install-referrer 和 launcher badge 权限。

## Maestro release APK smoke

在 `/tmp/lyntty-bun-app-release-gate` 下新建 AVD `lyntty_bun_gate`，未复用用户 AVD 或 App 状态。直接安装 release APK，未运行 Metro/dev launcher。

```bash
LYNTTY_MAESTRO_APP_ID=dev.jczhang.lyntty.dev \
LYNTTY_MAESTRO_DEVICE=emulator-5570 \
LYNTTY_MAESTRO_PRELAUNCH=0 \
LYNTTY_MAESTRO_ARTIFACT_DIR=/tmp/lyntty-bun-app-release-gate/maestro/01_first_run \
scripts/e2e/run-maestro.sh e2e/maestro/01_first_run.yml
```

结果：重建 APK 上 `1/1 Flow Passed in 14s`。终止前通过 PID、命令、AVD 名、环境和端口验证了隔离 emulator 进程。

## 仓库门禁

```bash
bun --version                                  # 1.3.14
bun install --frozen-lockfile                  # no changes
bun pm untrusted                               # 0
bun audit                                      # No vulnerabilities found
bun run ci:fast
```

`ci:fast` 通过：

- repository hardening：6 tests；
- Wire：19 tests；
- CLI：58 files / 525 tests；
- Relay：18 files / 105 tests；
- App：79 files / 759 tests；
- App typecheck、i18n lint、Expo config introspection 和 `git diff --check`。

默认配置和 `APP_ENV=production` Expo introspection 都只报告 Android/iOS，不含 `updates` 或 `runtimeVersion`，并明确阻止 audio/biometric/media 权限。production 包名/bundle id 为 `dev.jczhang.lyntty`，且禁止 cleartext traffic。

## 证据文件

- `docs/evidence/artifacts/r77-bun-app-boundary/apk-build-summary.txt`
- `docs/evidence/artifacts/r77-bun-app-boundary/apk-inspection.txt`
- `docs/evidence/artifacts/r77-bun-app-boundary/maestro-first-run-junit.xml`
- `docs/evidence/artifacts/r77-bun-app-boundary/production-signing-fail-closed.txt`

190 MiB APK、临时 Maven mirror、Gradle cache、AVD 和签名材料均不提交。

## 未运行与残余风险

- 最新 APK 尚未重跑配对 Relay/`lynttyd`/Pi history-send/reconnect/reload/`history_gap` 全套流程；R75 已覆盖此前 hardened App 的 shared-control 路径，本轮只证明边界删除后的首次启动行为。
- 未运行实体手机或 iOS 构建。Android 是验收目标，iOS 为 best effort。
- 当前是使用 preview 证书的 development release-style 包，不是 production-signed stable APK。
- 全量 `bun:test`、Relay API-only 清理、Compatibility BOM、installer 和正式发布签名仍属于后续 Bun 迁移任务。

## 独立审查

两路独立定向复审确认了 RPC 错误契约、首条提示词保留、图片命令序列化、附件顺序归属、旧 provider 会话权限 fail-closed、worktree 重置和 Expo project ID 校验。产品复审随后发现一处 raw Pi ID 显示回退；`resolvePiSessionDisplayName()` 已同时替换外部 mirror 与 managed runtime 的 ID 回退并补充回归测试。最终验证未在本轮 App 边界范围发现 P0/P1。
