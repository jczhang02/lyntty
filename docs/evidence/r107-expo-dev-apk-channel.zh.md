# R107 — 独立 Expo Dev APK 通道

日期：2026-07-23

状态：实现与隔离的本地 APK/模拟器路径已经验证。新 workflow 尚未进入受保护 `main`，因此没有触发 GitHub Actions，也没有创建外部 artifact、tag、Draft、prerelease 或 Release。

## 范围与边界

`.github/workflows/android-expo-dev.yml` 是只供开发使用的手动入口：

```text
触发：仅 workflow_dispatch
源码：受保护 main 的精确提交
applicationId：dev.jczhang.lyntty.dev
variant：Debug
debuggable：true
运行时：必须连接 8081 端口的 Metro
standalone bundle：不存在
ABI：arm64-v8a、x86_64
分发：14 天 GitHub Actions artifact
```

workflow 只有 `contents: read`，没有 `contents: write`，无法创建 Git tag 或 GitHub Release，也不连接 Version Preview、`compat-preview` 或 Compatibility BOM 的 candidate/promotion。原有 `android-preview-candidate.yml` 与 `android-preview-promote.yml` 未改动。

这里的“Expo Dev APK”指仓库内 Expo 原生工程的 Debug variant。可选 `expo-dev-client` 包与 Dev Launcher 仍不存在；原生 React Native Debug host 会连接通过 `expo start --dev-client` 启动的 Expo CLI Metro。该 flag 选择开发服务器模式，不表示 APK 内嵌 Dev Launcher。

## 实现

- `versionName` 来自 App package；只属于开发包的 `versionCode` 为 `930000 + GITHUB_RUN_NUMBER`；APK 名称包含源码 SHA 与 version code。workflow 会拒绝 rerun（`GITHUB_RUN_ATTEMPT > 1`），要求新 dispatch，避免复用 APK/artifact/provenance 身份。
- workflow 固定 `APP_ENV=development`、`NODE_ENV=development`、`RCT_METRO_PORT=8081`、`:app:assembleDebug` 和 `arm64-v8a,x86_64`。
- 仓库加入有意公开、仅供 `.dev` 包连续安装的固定 signer，证书 SHA-256 为 `374ea213bdd5667f7e274aa70b89cfa21ea8ba1222a948169904e9664ec69d16`。
- `apk-audit.sh` 默认行为仍是 standalone release 审计；新的可选 `metro` 模式要求 `debuggable=true`、`assets/index.android.bundle` 数量为零，并核对 Android Metro 资源端口。
- artifact 包含 APK、checksum、APK audit、Gradle runtime audit、源码 provenance、严格文件 manifest 和使用 README；上传前对 APK 与 manifest 生成 GitHub build attestation。
- hardening test 会锁定精确 trigger/permission block，并拒绝 rerun、非 development 配置、Release build、写权限、Release 发布命令、package/build/runtime 混淆、缺失审计断言，以及与 Preview/Compatibility promotion 的耦合。

## 隔离真实 APK 构建

本地验证使用 Bun `1.3.14`、OpenJDK `21.0.11`、`/opt/android-sdk`、临时 `HOME`、临时 `GRADLE_USER_HOME`、临时 Android 用户目录、临时 `LYNTTY_HOME_DIR` 和任务 worktree，未读写 live `~/.pi` 或 `~/.lyntty`。

核心命令为：

```bash
VALIDATION_ROOT="$(mktemp -d /tmp/lyntty-expo-dev-validation.XXXXXX)"
cd packages/lyntty-app/android
HOME="$VALIDATION_ROOT/home" \
GRADLE_USER_HOME="$VALIDATION_ROOT/gradle" \
ANDROID_USER_HOME="$VALIDATION_ROOT/android" \
TMPDIR="$VALIDATION_ROOT/tmp" \
LYNTTY_HOME_DIR="$VALIDATION_ROOT/lyntty" \
ANDROID_HOME=/opt/android-sdk \
APP_ENV=development NODE_ENV=development EXPO_NO_DOTENV=1 \
BUN_EXECUTABLE="$(command -v bun)" RCT_METRO_PORT=8081 CI=true \
../scripts/gradle-runtime-audit.sh "$VALIDATION_ROOT/android-expo-dev-runtime-audit.txt" -- \
  ./gradlew :app:assembleDebug --no-daemon --stacktrace --max-workers=2 \
    -PreactNativeArchitectures=x86_64,arm64-v8a \
    -PlynttyVersionName=1.2.0 \
    -PlynttyVersionCode=930001 \
    -PreactNativeDevServerPort=8081
```

Gradle 执行 606 个 actionable task 后 `BUILD SUCCESSFUL`。依赖输出既有 deprecated/unchecked-operation warning，`LynttyFileHashPackage.kt` 也有既有 deprecated-member warning，但没有编译错误。runtime audit 记录 Node-family `execve` 与 sentinel 调用均为零。

本地验证 APK 不是 Release asset，也未提交：

```text
versionName：1.2.0
versionCode：930001
大小：205436990 bytes
SHA-256：33c5d2317aaf771733b2044e017c832a26fd9ae340022e3d7d445f9d13715f60
```

`validation-inputs.json` 用路径、字节大小和 SHA-256 把该身份绑定到 984 个非测试 App 输入，并记录 base commit `47749a15e6c533afebd369afdb9bfab08571e8c5`。test、E2E、workflow 和文档文件因不是 APK/Metro runtime 输入而明确排除；所有纳入文件在本地 build/smoke 后均未变化。因此无需提交 196 MiB 验证 APK，也不声称 APK 可重复构建，仍可按内容审计本地结果。

真实 `apk-audit.sh ... metro 8081` 证明：package 为 `dev.jczhang.lyntty.dev`、`debuggable=true`、唯一 signer、v2 signature、证书 pin 正确、standalone Android JS bundle 不存在、Metro 端口为 `8081`，并且 ABI 精确为 `arm64-v8a,x86_64`。

## 隔离模拟器与 Metro

测试在验证目录内新建 API 35 Google APIs x86_64 AVD，使用 emulator `5584/5585` 与独立 ADB server `5041`。安装或发送设备命令前，已核对 AVD 路径、启动 cwd、Android 状态目录和唯一 serial `emulator-5584`。

同一 APK 安装成功。主机 `8081` 没有监听进程时，首次启动明确记录：

```text
Failed to connect to /10.0.2.2:8081
Unable to load script.
The device must ... connect to Metro.
```

随后从任务 worktree 启动隔离 Metro：

```bash
APP_ENV=development NODE_ENV=development EXPO_NO_DOTENV=1 CI=1 \
  bunx expo start --dev-client --port 8081 --clear
adb -P 5041 -s emulator-5584 reverse tcp:8081 tcp:8081
```

`/status` 返回 `packager-status:running`。Metro 完成 `packages/lyntty-app/index.ts` 的 3,371 模块 bundle，重启后的 APK 显示 **Lyntty mobile control for pi**、**Create account** 和 **Link or restore account**，最终 UI 没有 Metro 连接错误或 fatal crash。界面的 development warning 是测试把模拟器动画缩放设为零后产生的 Reanimated reduced-motion 提示。Metro、模拟器和独立 ADB server 均已停止，`8081`、`5041`、`5584`、`5585` 端口全部释放。

没有创建账号、配对 URL 或凭据，也没有接触 Relay 或 Pi session。

## 自动化验证

当前已完成：

```text
bun install --frozen-lockfile
  PASS；lockfile 未变
bun pm untrusted
  PASS；0 个带脚本的未信任依赖
bun test packages/lyntty-app/sources/scripts/apkAudit.test.ts
  PASS；10 tests / 27 assertions
bun run test:repo-hardening
  PASS；37 tests
workflow YAML parse
  PASS
7 个 workflow run block 的 bash -n 与 ShellCheck error level
  PASS
git diff --check
  PASS
bun run ci:fast
  PASS；repo hardening 37、Wire 36、CLI 585、Relay 119、App 819 / 3,295 assertions（90 files）、
  13,068,103-byte 真实 Preview bundle smoke、lifecycle 36 / 193 assertions
```

APK audit test 按 red-first 编写：实现前，Metro acceptance 会撞上旧的 `debuggable=false` 要求；含 bundle 的拒绝用例也只得到旧 mismatch。加入 mode-aware audit 后两者通过。review follow-up 又加入 package identity、非 debuggable Metro、错误或不可读端口、ABI 不完整等 fail-closed 负例。

## 独立复核

只读 reviewer 没有发现 blocking issue，但指出一项中风险身份问题：GitHub rerun 会复用 `GITHUB_RUN_ID` 与 `GITHUB_RUN_NUMBER`；另外有两项低风险测试缺口。当前实现已经拒绝 `GITHUB_RUN_ATTEMPT > 1`、在 provenance 中记录 `runAttempt`、锁定精确 trigger/permission block，并补齐 APK audit 负例。针对性复查确认三项均 resolved，且没有新 blocker。

另一名 acceptance verifier 在提交前检查点正确指出 signer、workflow 和 evidence 当时仍未 tracked/signed。这属于交付状态而非实现缺陷；关闭任务前必须证明这些文件已跟踪、commit 已签名、worktree 已 clean。后续 verifier 复算了 `validation-inputs.json` 的全部 984 项，未发现剩余内容问题，并确认其边界：这是按内容绑定的本地验证记录，不是对有意不保留的 APK 原始字节的独立证明。

仓库内证据：

- `docs/evidence/artifacts/r107-expo-dev-apk/apk-audit.txt`
- `docs/evidence/artifacts/r107-expo-dev-apk/runtime-audit.txt`
- `docs/evidence/artifacts/r107-expo-dev-apk/apk.sha256`
- `docs/evidence/artifacts/r107-expo-dev-apk/emulator-smoke.txt`
- `docs/evidence/artifacts/r107-expo-dev-apk/validation-inputs.json`

196 MiB APK、完整 Gradle/strace 日志、模拟器数据、logcat、UI XML 与截图只保留为临时本地验证数据，不是仓库交付物，也不被表述为发布字节。

## 验收审计

| 要求 | 证据 | 状态 |
| --- | --- | --- |
| 仅手动触发、精确受保护 `main` | 精确 `on`/permission hardening，以及 event/ref/protection/HEAD/origin 检查 | 静态契约通过；GitHub run 尚未执行 |
| Development Debug 身份 | workflow 常量、Gradle mapping、真实 APK audit | 通过 |
| Debuggable、必须 Metro、无 standalone bundle | mode-aware audit tests、真实 APK audit、无 Metro 失败与有 Metro 成功 | 通过 |
| 固定端口、双 ABI、稳定开发 signer | 真实 APK resource/ABI/signature audit 与证书 pin | 通过 |
| 与 Version Preview/Compatibility 隔离 | Preview workflow 无 delta、无写权限/Release 路径、hardening assertions | 通过 |
| Artifact 身份与可审阅性 | 只允许首次 attempt、SHA/provenance/manifest/README、attestation steps | 静态契约通过；GitHub attestation/upload 尚未执行 |
| 自动化门禁 | focused tests、`ci:fast`、YAML/Bash/ShellCheck、独立复查 | 通过 |
| 文档与持久本地证据 | 中英文 runbook、R107 sidecars、984-input content manifest | 内容通过；commit 后验证 tracked |
| 签名 Conventional Commits | 仓库策略要求使用现有 OpenPGP identity | 等待 GPG agent 解锁 |
| Bead 与 Goal 关闭 | 签名提交及 clean worktree 后执行 completion audit | 等待 |

## 未执行项与剩余风险

- 尚未触发新 GitHub workflow。受保护 main 校验、GitHub-hosted Java 17、attestation 与 Actions artifact 上传只能在审阅合并后执行，目前不声称通过。
- 未使用实体手机。API 35 隔离模拟器已经证明 Metro 依赖与 App 正常渲染，但不覆盖 USB driver 或实体设备差异；此短期开发 artifact 不以实体机验收为发布门禁。
- 公开开发证书不提供身份认证；拥有仓库的人都能签名 `.dev` 包。信任边界是源码 SHA、checksum、provenance 与 GitHub attestation。
- artifact 14 天后过期，且离开兼容源码 checkout 与 `8081` Metro 无法运行。
- `bun run ci:fast` 已完成；独立复核与最终签名提交会在完成后补记。本文不是发布或合并记录。
