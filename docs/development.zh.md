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
4. 提示在 **Lyntty (preview)** 中确认该 Server URL、创建本地测试账号并扫描终端二维码；
5. 直接启动当前源码 daemon，不安装全局 Pi extension；
6. 使用现有 Pi 模型配置启动一条新的 managed Pi session。

如果电脑有多个私网地址，可显式指定：

```bash
LYNTTY_PREVIEW_LAN_IP=192.168.1.20 bun preview:test
```

导入的普通 Preview APK 可能仍以 `relay.jczhang.cc` 为初始默认值。框架会在配对前暂停；必须先在 **设置 → Server** 中设置或确认命令显示的本地 URL，确认生效后再创建测试账号。打开旧 APK 到完成切换之间，App 可能短暂初始化原默认配置；正式手测只从本地 URL 确认后开始。App 会持久保存这个设置，后续运行会复用账号、配对、Relay 数据、APK 和端口，不需要再次扫码。

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

私有状态位于 ignored `dist/manual-preview/<worktree-hash>/`，目录模式为 `0700`、敏感文件为 `0600`。`preview:stop` 不删除状态；`preview:reset` 会删除本地 Relay 账号和电脑配对，但不会清除手机 App 数据。

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
