# 隔离开发流程

英文规范版见 [`development.md`](./development.md)。

## 普通隔离开发环境

```bash
bun install --frozen-lockfile
bun dev:up
bun dev:check
bun dev:verify
bun dev:down
```

`dev:up` 为当前 worktree 启动隔离的源码 Relay 和 daemon。端口、HOME、`LYNTTY_HOME_DIR`、PGlite、日志和进程归属状态都位于 `dist/dev/<worktree-hash>/`。`dev:down` 只有在完整证明进程组归属后才发送信号。

模拟器开发必须显式执行：

```bash
bun dev:up --android
```

该入口使用开发 APK、Metro 和模拟器专用 `10.0.2.2`，不属于下面的实体手机 Preview 手测流程。

## 短期 Expo Dev APK artifact

需要预构建开发 APK 时，在 GitHub Actions 中手动运行 **Android Expo Dev APK**。workflow 只接受受保护 `main` 的精确提交，上传名为 `android-expo-dev-<run-id>` 的 14 天短期 artifact，不创建 tag 或 GitHub Release。同一 GitHub run 的 rerun 会因复用身份而被拒绝；失败后应重新手动 dispatch。

其中的 `lyntty-expo-dev-<source-sha>-<version-code>.apk` 固定为：

- package `dev.jczhang.lyntty.dev`，显示名 **Lyntty (dev)**；
- Android Debug variant，`debuggable=true`；
- 同时包含 `arm64-v8a` 与 `x86_64`；
- 不包含 `assets/index.android.bundle`；
- Metro 端口固定为 `8081`；
- 使用仓库内公开、仅供 Expo Dev 的固定 signer。

从 artifact 所记录的精确源码提交运行：

```bash
bun install --frozen-lockfile
adb install -r lyntty-expo-dev-<source-sha>-<version-code>.apk
adb reverse tcp:8081 tcp:8081
cd packages/lyntty-app
APP_ENV=development bunx expo start --dev-client --port 8081
```

Metro 就绪后再启动或重启 **Lyntty (dev)**。没有 Metro 时，该 APK 无法加载 JavaScript，出现 `Unable to load script` 开发错误属于预期行为。若旧的本地开发 APK 使用了不同 debug signer，只卸载 `dev.jczhang.lyntty.dev` 后重装。

这里的“Expo Dev APK”指已签入 Expo 原生工程的 Debug variant。它不包含可选的 `expo-dev-client` 包或 Expo Dev Launcher；`--dev-client` 只是为该原生 Debug App 选择 Expo CLI 的开发服务器模式。

artifact 同时包含 APK checksum、APK/runtime audit、源码 provenance、严格文件 manifest 和使用 README。它与 standalone Version Preview APK 完全分离，不进入 `compat-preview`、Compatibility BOM promotion、`latest`、App 自更新路径或任何 Preview GitHub Release。

## 实体手机 Preview 快速手测

在实体 Android 手机上测试当前 worktree 的 standalone、release-style Preview APK：

```bash
bun preview:test
```

手机和电脑必须连接同一个可信局域网。测试 CLI/daemon 只连接本地 Relay；流程不要求 Metro、模拟器、Android Studio、Maestro 或 ADB。

首次运行会：

1. 复用内容匹配的缓存 APK；或者从 `~/Downloads` 导入带审计 sidecar、与当前 App/Wire 源码一致的 `lyntty-preview-*.apk`；内存充足时才允许原生重建；
2. 在电脑的局域网地址和固定测试端口启动当前源码 Relay；
3. 显示 APK 路径与 Relay URL；
4. 要求 **Lyntty (preview)** 1.2 或更高版本先验证并保存该 Server URL，之后才允许创建本地测试账号和扫描终端二维码；
5. 直接启动当前源码 daemon，不安装全局 Pi extension；
6. 使用现有 Pi 模型配置启动一条新的 managed Pi session。

如果电脑有多个私网地址，可显式指定：

```bash
LYNTTY_PREVIEW_LAN_IP=192.168.1.20 bun preview:test
```

Preview 1.2 及更高版本会在首次启动时 fail closed：**连接到 Relay** 通过规范 `/health` 验证并保存本地 URL 之前，不读取凭据，也不启动同步。旧 Preview APK 可能仍以 `relay.jczhang.cc` 为默认值，因此框架仍会在配对前要求确认本地 URL。已保存的本地设置会在 Preview 原位升级后保留，后续运行继续复用账号、配对、Relay 数据、APK 和端口。

人工检查只包含：

1. 手机能看到节点和新的 Pi Session；
2. 手机发送的消息能到达 Pi；
3. Pi 回复能显示在手机；
4. 重开 App 后 Session 仍存在。

辅助命令：

```bash
bun preview:status   # Relay、daemon、APK 和进程归属状态
bun preview:logs     # 输出有限长度且脱敏的 Relay/daemon 日志
bun preview:stop     # 只停止已证明归属的进程组，保留账号和配对
bun preview:reset    # 安全停止后删除当前 worktree 的手测状态
```

私有状态位于 ignored `dist/manual-preview/<worktree-hash>/`，目录模式为 `0700`、敏感文件为 `0600`。`preview:stop` 不删除状态；`preview:reset` 会删除本地 Relay 账号和电脑配对，但不会清除手机 App 数据。Preview 设置中的 **清除 Relay** 会删除已保存 URL、清理旧认证状态，并让 App 回到强制设置页。

APK 导入会 fail closed：SHA-256 必须存在于已审阅的 `scripts/preview-apk-allowlist.json`，同时还要匹配 `.audit.txt`、APK 内嵌 build commit、当前 App/Wire 输入、Preview package/signer 和 standalone bundle。未进入 allowlist 的 APK 会被拒绝。可用以下方式指定 APK：

```bash
LYNTTY_PREVIEW_APK=/path/to/lyntty-preview.apk bun preview:test
```

原生构建会先清除继承的全部 `EXPO_PUBLIC_*` 环境变量，并限制为单 worker 和 `arm64-v8a`。可用内存低于 12 GiB 时，命令会在启动 Gradle 前拒绝构建，避免再次造成整机内存压力。

该框架不会修改 live `~/.lyntty`、全局 Pi extension 或当前 Pi session。为了使用现有模型/provider 配置，它会保留真实 `HOME`；唯一正常的 live Pi 副作用是新增一条 session 历史。

macOS 运行普通开发生命周期前需安装一次 `flock`：

```bash
brew install flock
```
