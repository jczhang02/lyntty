# 常见问题

状态：当前产品与支持边界

[English](./faq.md)

## Lyntty 提供托管服务吗？

不提供。你需要在自己控制的基础设施上运行 `relay`。项目没有公共托管 `relay`、默认云账号或 Play Store 页面。安装时从[开始使用](./getting-started.zh.md)和 [`relay` 部署 runbook](./deploy/relay-vps.zh.md)开始。

## 手机会启动另一个 `pi` process 吗？

普通手机输入进入电脑上同一个 `pi` session：

```text
phone -> relay -> lynttyd -> local Pi extension -> pi
```

一个 session 只有一个 `active runtime`。Extension 缺失或 stale 时，Lyntty 必须排队或拒绝消息，并显示 `Waiting for Pi extension` 等补救提示，不能静默启动重复 runtime。

## Session history 和凭据保存在哪里？

配对节点上的 Pi JSONL 是 canonical history。Workspace、tool、MCP 配置和 provider 凭据也留在该节点，除非其他工具主动移动它们。Release signing credential 与用户节点数据分开，只能放在受保护的发布环境中。

`relay` 保存路由所需的加密同步状态、metadata、队列和缓存，但不是 Pi history backup。Lyntty 会在事件离开节点前执行基础脱敏，但不宣称零信任或完整端到端加密架构。详情见[隐私政策](../PRIVACY.zh.md)和 [shared-control 架构](./architecture/pi-shared-control.zh.md)。

## 应该安装哪个 Android build？

普通使用应选择[当前 Stable Release](https://github.com/jczhang02/lyntty/releases/latest)中签名 Compatibility BOM 指定的 APK，并使用同一组 Release 里的 App、CLI/`lynttyd`、`relay` 和 Wire artifact。

当前 Android APK-only Preview 与签名 Compatibility Preview 是两条不同通道。当前 APK-only Preview 发布 APK、checksum、audit 和 provenance，但没有 Preview BOM 或匹配的 CLI/`relay` set。Expo Dev 是短期开发 artifact，没有内嵌 JavaScript bundle，需要兼容源码 checkout 在 `8081` 端口运行 Metro。Development、Preview 和 production package 使用不同 Android identity 和独立数据。

## 截图能证明 Android Release 验收吗？

不能。模拟器画面和文档截图只是视觉参考，不是实体 Android 验收，也不是 Stable artifact 验证。Stable 的实体机验收是可选项；`android-validation.json` 会记录精确 APK 是否在实体手机上通过验收，而 Release 正文没有警告并不代表已经验收。当前 APK-only Preview 应查阅 prerelease 正文、checksum、audit 和 provenance；它的独立 waiver 策略保持不变。

## 哪些桌面平台受支持？

Linux 和 macOS 有受支持的 CLI 与 `lynttyd` user-service 路径。Windows artifact 只有 smoke coverage，不支持 Windows service 安装。iOS 仍是 best-effort，不属于发布验收目标。

## Update 和 rollback 如何工作？

Stable update 通过签名 Compatibility BOM 选择精确 artifact 和 digest。CLI updater 保留前一个 known-good Release，并提供明确的状态与回滚命令：

```bash
lyntty update check
lyntty update status --json
lyntty update rollback
```

Android 仍要求用户确认，也不能静默降低 `versionCode`。`relay` rollback 会发布新的更高签名 BOM sequence，不会复用 mutable tag。完整规则见[兼容与 rollback 政策](./release/compatibility-bom.zh.md)。

## App 显示 `Waiting for Pi extension` 时怎么办？

运行 `lyntty remote install` 修复本地 extension，然后新建 Pi session，或由你自己运行 `/reload`。Installer 不会 reload 正在运行的 session。更多按症状组织的步骤见[故障排查](./troubleshooting.zh.md)。

## 如何报告问题？

可复现且不敏感的缺陷使用 bug form。不要公开凭据、完整 pairing URL、auth header、密钥、私有代码或私有命令输出。漏洞按照 [`SECURITY.zh.md`](../SECURITY.zh.md)处理；private vulnerability reporting 不可用时，只能使用其中不含技术详情的联系 fallback。
