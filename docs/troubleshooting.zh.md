# 故障排查

状态：当前用户与 operator 指南

[English](./troubleshooting.md)

先在配对电脑上运行：

```bash
lyntty daemon status
lyntty doctor
lyntty update status --json
```

再单独检查自托管 endpoint：

```bash
curl -fsS https://<your-relay-host>/health
```

预期 health 结构是 `{"status":"ok","service":"lyntty-relay"}`。普通 healthy 响应不能证明签名 Compatibility BOM、App update、节点认证或 session path 正确。

## App 无法连接 relay

检查精确 HTTPS URL、证书、DNS、防火墙和 `/health` 响应。App 与节点必须使用同一个自托管 `relay`。项目不为新安装提供默认托管 endpoint。

这台电脑从未配对时，运行 `lyntty auth login`。已有凭据被撤销、reset 或属于另一个 `relay` 时，使用 `lyntty auth login --force`。Force 路径会先停止 `lynttyd`，清除旧凭据和 machine id，再重新配对。不要把完整配对 URL 粘贴到 issue、聊天、截图或命令记录中。

## Node Management 看不到电脑

运行：

```bash
lyntty daemon status
lyntty doctor
```

服务未安装时，运行 `lyntty daemon install`。认证被撤销或 `relay` 发生变化时，先重新配对：

```bash
lyntty auth login --force
lyntty daemon install
```

Linux 使用 systemd user service，macOS 使用 per-user LaunchAgent。服务必须以登录用户运行，不能使用 root。服务路径和命令见 [CLI 与 daemon Release artifact](./release/cli.zh.md)。

## Session Remote 显示 `Waiting for Pi extension`

安装或修复本地 extension：

```bash
lyntty remote install
```

然后新建 Pi session，或由你自己在既有 session 中运行 `/reload`。Installer 不会强制 reload。不要为了绕过 stale extension，给同一份 Pi history 启动另一个 session process。

普通手机发送路径必须保持：

```text
phone -> relay -> lynttyd -> Pi extension -> pi
```

## 消息处于排队或被拒绝

排队或显式失败比丢失输入安全。确认 `lynttyd` 可以连接，并且 Pi extension 已附着到目标 session。等待可见 remediation 状态消失后再重试。不要通过连续点击制造并行工作。

## Session history 显示 `history_gap`

`history_gap` 表示 Lyntty 无法证明该范围内的 history 连续且有序。配对节点上的 Pi JSONL 仍是 canonical。

保持节点和 `lynttyd` 在线，重新连接并等待 progressive replay。不要修改 Relay storage 来伪造缺失 history，也不要删除本地 Pi JSONL。问题持续时，只收集已经脱敏的 daemon/App 时间戳和受影响 session id，不要复制私有对话内容。

## Android 阻止 APK 安装

Stable 和 Preview APK 使用 Android Package Installer。Android 可能要求为打开 APK 的浏览器或文件管理器授予未知来源权限。

打开该 App 的未知来源设置，允许所选安装来源后重试。Lyntty 不能静默安装，也不能绕过 Android 确认。Checksum 不匹配时，流程必须在 Package Installer 打开前停止。

## App 与节点提示版本不匹配

App、CLI/`lynttyd`、`relay` 和 Wire 必须由同一个签名 Compatibility BOM 选定。SemVer 字符串相同不能单独证明兼容。

检查：

```bash
lyntty update check
lyntty update status --json
```

Stable 使用签名 Compatibility BOM 选择 App、CLI、Wire 和 `relay` artifact。当前 APK-only Preview 只发布独立 APK 与 audit sidecar，没有 Preview BOM、CLI archive、托管 `relay` 或 Preview `relay` image。不要把 Preview APK 当作完整 compatibility channel。CLI rollback 使用 `lyntty update rollback`；Android 不能降低单调递增的 `versionCode`。

## Expo Dev 出现 Metro 错误

Expo Dev APK 是 development artifact，没有内嵌 JavaScript bundle，需要兼容源码 checkout 在 `8081` 端口运行 Metro。打开 `dev.jczhang.lyntty.dev` 前，先用开发文档中的命令启动 Metro。

Stable 和 Preview APK 是 standalone release-style build。如果所谓 Stable 或 Preview package 出现 Metro `8081` 错误，说明安装了错误 package 或 artifact。

## Preview 停在 relay 设置

Preview 不提供托管 `relay`。Account 或 session action 加载前，必须配置明确的本地 endpoint。Preview package 是 `dev.jczhang.lyntty.preview`，与 production 和 development package 的数据分开。

## Update 或 rollback 未完成

运行：

```bash
lyntty update status --json
lyntty doctor
```

Updater 会记录 intent，并在下一次 install 前恢复中断 transaction。不要手工删除 journal、Release 目录或 quarantined candidate。`relay` rollback 是受保护的 operator workflow，会创建新的更高签名 BOM sequence；不要直接部署旧 mutable tag。

## 收集安全的报告

记录精确 package id、版本、Release tag、source commit 和时间戳。附加证据前，删除凭据、完整配对 URL、认证请求头、加密密钥、签名材料、私有代码、hostname、address 和私有命令输出。

非敏感缺陷使用 bug form。漏洞按照 [`SECURITY.md`](../SECURITY.zh.md)处理。仓库设置启用前，private-reporting 页面可能不可用；安全政策提供一个不含详情的联系 fallback。
