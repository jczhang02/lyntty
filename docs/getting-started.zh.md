# 开始使用

状态：当前 owner-operated 安装路径

[English](./getting-started.md)

Lyntty 用 Android App 控制你自己电脑上的 `pi` session。项目不提供托管 `relay`，也不通过 Google Play 分发。完整安装由同一组签名 Stable Compatibility Release、自托管 `relay` 和已配对节点组成。

## 开始之前

需要准备：

- 用于运行 App 的 Android 设备或模拟器；
- 用于运行 `lynttyd` 和 [pi](https://github.com/earendil-works/pi) 的 Linux 或 macOS 电脑；
- 一台能够提供 HTTPS 的 Linux 主机，用于自托管 `relay`；
- [当前 Stable Release](https://github.com/jczhang02/lyntty/releases/latest) 的访问权限。

Windows CLI artifact 只经过 smoke coverage，不支持 Windows service 安装。iOS 是 best-effort，不属于发布验收目标。

普通 shared-control 路径是：

```text
phone -> relay -> lynttyd -> local Pi extension -> pi
```

配对节点上的 Pi JSONL 保持 canonical。`relay` 保存加密同步状态、metadata、队列和缓存，但不是 history backup。

## 1. 选择同一组 Stable Release

打开[当前 Stable Release](https://github.com/jczhang02/lyntty/releases/latest)，先阅读正文开头的验证和平台签名披露。签名 Compatibility BOM 会选定相互匹配的 App、CLI/`lynttyd`、`relay` 和 Wire artifact。

不要混用不同 Release 的 APK、CLI archive 或 `relay` 镜像。版本号相同、unsigned mirror、mutable image tag 或脱离 Stable BOM 契约的 `/latest/` asset URL 都不能单独证明可信。完整规则见[兼容性发布与支持政策](./release/compatibility-bom.zh.md)。

首个 owner-operated Stable 使用了明确 waiver，没有完成实体 Android 验收。该状态以 Release Notes 和 `android-validation.json` 为准。文档截图或模拟器画面不能把该 Release 变成实体设备验证。

## 2. 部署 relay

按照 [`relay` VPS 部署 runbook](./deploy/relay-vps.zh.md)操作。参考拓扑使用 DNS-only 记录、Caddy TLS、签名 Stable BOM 选定的 digest-pinned OCI 镜像，以及持久化 PGlite 数据。

配对节点前，确认 endpoint 返回预期 health 文档：

```bash
curl -fsS https://<your-relay-host>/health
```

预期结构：

```json
{"status":"ok","service":"lyntty-relay"}
```

`LYNTTY_MASTER_SECRET`、SSH 材料、备份和部署凭据不得进入 Git 或 issue。

## 3. 安装并配置 Android App

下载同一 Stable Release 选定的 production APK，其 package id 是 `dev.jczhang.lyntty`。打开 APK 前，验证 Release checksum 和签名 BOM 绑定。

Android 始终要求用户确认安装。如果系统阻止 APK，请为下载 APK 所用的浏览器或文件管理器允许未知来源安装，然后重试。Lyntty 不会静默安装。

打开 App，输入自托管 `relay` 的精确 URL，并完成 owner account setup。等到 App 可以显示节点配对流程后，再安装节点。Node installer 会通过该 App 完成认证，因此 App 与 `relay` 必须先准备好。

Development package `dev.jczhang.lyntty.dev` 和 Preview package `dev.jczhang.lyntty.preview` 使用独立数据，不能替代 production package。

## 4. 持久化节点 relay URL

安装后的 user service 从 `${LYNTTY_HOME_DIR:-$HOME/.lyntty}/settings.json` 读取 `serverUrl`。首次安装前创建该文件，并把示例 URL 替换成 App 中配置的同一 origin：

```bash
state_dir="${LYNTTY_HOME_DIR:-$HOME/.lyntty}"
test ! -e "$state_dir/settings.json" || {
  echo "Refusing to overwrite existing Lyntty settings" >&2
  exit 1
}
umask 077
mkdir -p "$state_dir"
cat > "$state_dir/settings.json" <<'JSON'
{
  "serverUrl": "https://your-relay.example.com"
}
JSON
```

`LYNTTY_SERVER_URL` 只覆盖当前 process，不会持久化到安装后的 user service。Daemon endpoint 不能只依赖临时 shell variable。

## 5. 安装 CLI、daemon 和 Pi extension

按照 [CLI 与 daemon Release artifact](./release/cli.zh.md)中的 hash-pinned installer 流程操作。Installer、archive 和内部 manifest digest 必须来自经过审核的 Stable Release 及其签名 Compatibility BOM。不要把未经验证的网络响应直接 pipe 给 shell。

Installer 会在安装前执行交互认证。请在已经配置好的 App 中接受配对请求。认证完成后，同一个 transaction 会安装 `lyntty` 与 `lynttyd`、安装本地 Pi extension、创建或启动 user daemon service，并验证 candidate。

安装后的 executable 是 standalone。最终用户不需要 Bun、Node、npm、pnpm、npx 或 tsx。

首次安装成功时不要重复运行下面的命令。它们只用于修复既有安装：

```bash
lyntty auth login --force  # 凭据 stale、被撤销或指向错误 relay
lyntty daemon install      # user service 缺失或损坏
lyntty remote install      # 本地 Pi extension 缺失或损坏
```

Installer 不会 reload 正在运行的 Pi session。Extension 变化后，请新建 Pi session，或由你自己运行 `/reload`。

## 6. 验证安装

检查节点：

```bash
lyntty daemon status
lyntty doctor
lyntty update status --json
```

然后验证真实用户路径：

1. `Node Management` 显示已配对电脑可以连接。
2. `Sessions Home` 显示本地 Pi session。
3. 打开 `Session Remote` 后能看到既有 history，且不会替代 canonical Pi JSONL。
4. 手机发送的消息进入同一个电脑端 Pi session。
5. Follow-up 或 stop 作用于同一个 `active runtime`。

Pi extension 缺失或 stale 时，App 必须显示 `Waiting for Pi extension` 等补救提示。输入不能消失，也不能创建另一个 runtime。

## 更新和回滚

检查 CLI 选定的 Stable update：

```bash
lyntty update check
lyntty update status --json
```

签名 BOM 决定当前平台的精确 archive 和 manifest digest。Transactional installer 或 update 路径会停止服务、原子切换 Release 与 extension、验证重启后的 daemon，并在失败时恢复前一个 known-good Release。

CLI rollback 需要显式执行：

```bash
lyntty update rollback
```

Android update 始终由用户确认，也不能静默降低 `versionCode`。`relay` rollback 使用新的更高签名 BOM sequence 和受保护的 release/deploy workflow；不要手工把运行镜像替换成 mutable tag。

## 安装未完成时

[故障排查](./troubleshooting.zh.md)覆盖配对、daemon、extension、history、APK、Metro 和版本不匹配。可复现且不敏感的缺陷使用仓库 bug form。漏洞按照 [`SECURITY.md`](../SECURITY.zh.md)处理。
