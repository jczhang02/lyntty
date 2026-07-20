# R86 — Android Preview APK prerelease（中文）

日期：2026-07-20

状态：实现已准备进入受保护 PR；尚未构建或发布 Candidate

## 范围

本发布路径只处理 Android 开发测试包：

```text
applicationId: dev.jczhang.lyntty.preview
versionName: 1.2.0
versionCode: 920001
ABIs: arm64-v8a, x86_64
Tag: android-preview-v1.2.0-920001
Title: V1.2.0 Local First 📡
```

不发布或部署 Stable Android、CLI/daemon archive、Relay OCI、Compatibility BOM、托管 Preview Relay、Google Play 或 OTA。

## Preview 首启契约

Preview 必须先持久化并验证 Relay，之后才能初始化认证或同步：

- 未配置或不符合策略的 Relay 时，直接清理旧凭据，不读取、不恢复同步；
- 凭据删除失败会在写入新 URL 前阻止启动或 Relay 更换；
- 深链页面不会在门禁期间挂载，设置成功前始终停留在 **连接到 Relay**；
- 通过规范 `GET /health` 验证精确 `status: ok` 与 `service: lyntty-relay`；
- Preview HTTP 仅允许 localhost、loopback、RFC1918/CGNAT 私有 IPv4 或本地 IPv6；HTTPS 仍可使用；
- 已有有效自定义 Relay 的 Preview 原位升级会保留设置；
- 更换或清除 Relay 会清理旧认证与同步状态；
- Stable 继续使用 production HTTPS 和公网默认行为。

## Candidate 与 Promotion 边界

`.github/workflows/android-preview-candidate.yml` 只从精确受保护 `main` 构建一次，审计 APK 与 Bun-only 执行边界，生成 SHA-256、provenance 和 Mole 风格中英文说明，对 APK 做 attestation，并上传保留 30 天的 Candidate artifact。它没有 contents-write 权限，不能创建 Release。

Candidate SHA-256 经 `scripts/preview-apk-allowlist.json` 审阅后，必须用同一 APK完成实体 Android 原位升级和全新数据测试。`.github/workflows/android-preview-promote.yml` 只接受该 run id 和已测试 SHA-256；它重新验证 Candidate workflow、源码祖先关系、未变化的 App/Wire 输入、attestation、APK 身份与最终受保护 `main`，随后创建或恢复精确 draft 并发布为 prerelease。Promotion 不执行构建。

## Candidate 前已完成

- URL/health policy 聚焦测试先红后绿；
- bootstrap policy 聚焦测试先红后绿，覆盖凭据删除失败和深链路由阻断；
- 两个 workflow 缺失时 hardening 测试为红，实现后转绿；
- 当前 App TypeScript 和 i18n 门禁通过。

最终评审加固 head 的本地 `bun run ci:fast` 已通过：repo hardening 18、Wire 33、CLI 585、Relay 119 / 332 assertions、App 806 / 3,252 assertions（89 个隔离文件）、dev/Preview lifecycle 35 / 194 assertions。两个 workflow 还通过 YAML parse、提取 Bash ShellCheck 和 `git diff --check`。受保护 PR CI 仍待执行。

## 尚未执行

- GitHub Candidate workflow；
- `920001` Candidate APK audit；
- 实体手机 `910003 → 920001` 原位升级；
- 清除数据后的强制 Relay 设置、Android 返回键、Clear Relay 重新门禁、配对、Pi 消息往返和重开；
- 公开 Promotion workflow。

当前没有由本工作创建的公开 Release。
