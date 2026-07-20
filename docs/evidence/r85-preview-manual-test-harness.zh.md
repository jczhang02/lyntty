# R85 — 实体手机 Preview 手测框架证据

日期：2026-07-19

分支：`feat/preview-manual-test`

Bead：`lyntty-tof`

## 结论

**本地实现通过；实体手机最终手测待用户执行。**

新增五个根命令：

```bash
bun preview:test
bun preview:status
bun preview:logs
bun preview:stop
bun preview:reset
```

框架使用局域网地址、本地隔离 Relay、当前源码 daemon、worktree-local PGlite/账号/日志，以及新的 managed Pi session。它不要求 Android Studio、模拟器、Metro、Maestro 或 ADB。`stop` 保留配对，`reset` 只在证明进程归属并安全停止后删除当前 worktree 的测试状态。

## 已验证

`preview.test.ts` 覆盖了：

- 私网地址选择与固定端口；
- 五个公开命令；
- 整个进程组的归属证明、安全停止和无关进程 fail closed；
- Gradle/native 中断残留清理；
- 日志中二维码 URL、token、secret 和 bearer 脱敏；
- APK 内容缓存、变化失效、低内存预检查；
- 外部 APK 必须命中已审阅的精确 SHA allowlist；
- 真实手机配对写入的 V2 `encryption.publicKey/machineKey`；
- 真实源码 Relay/PGlite migration/health；
- 真实源码 daemon readiness，且不安装全局 Pi extension；
- managed Pi 保留真实 `HOME`、隔离 `LYNTTY_HOME_DIR` 和 extension 路径；
- 原生构建前删除全部继承的 `EXPO_PUBLIC_*`。

默认 profile 实际导入并验证：

```text
source commit: 4043171d3b6e89ef32a5a7a3c56d5c7b7ab9b40c
package: dev.jczhang.lyntty.preview
version: 1.1.0 (910003)
sha256: d0e0a335fa0db34b882fa2c71a89a65e416ecdd1ed21995719aba6a2be99da06
signer: ebd23c222b690e2be635fe3e52bd70b6fb86c5570ab279bc4e8c1f22ed90ef9c
```

导入必须同时匹配：`scripts/preview-apk-allowlist.json`、`.audit.txt`、当前 App/Wire 输入、APK 内嵌 build commit、Preview package/signer、v2 签名、non-debuggable manifest 和 standalone bundle。

默认 profile 的本地 Relay 实际启动并通过 health；`status` 证明 supervisor owned，`stop` 后无 Relay/daemon/Gradle 残留。运行前后，live `~/.lyntty/settings.json`、`~/.lyntty/access.key` 和 `~/.pi/agent/extensions/lyntty/index.ts` 的文件元数据没有变化。

## Relay 识别兼容性修正

首次实体手机设置暴露了真实契约漂移：当前源码 Relay 的 `GET /health` 正常，但首页返回 `Lyntty Relay API`；已安装的 `910003` Preview App 仍要求旧标记 `Welcome to Lyntty Relay!`，因此显示 `This does not look like a Lyntty relay.`。

最小真实复现：

```text
GET /       -> 200 Lyntty Relay API
GET /health -> 200 {"status":"ok",...,"service":"lyntty-relay"}
App         -> This does not look like a Lyntty relay.
```

本次手测版本选择服务端兼容修复：当前 Relay 在保留规范 `GET /health` 的同时恢复旧首页标记。诊断期间验证过 App `/health` 探测方案，但没有保留，因为这会改变 App 输入；在新的 APK 尚未产生前，已审计的 `910003` 将无法继续满足精确复用要求。

真实源码 Relay lifecycle 测试先在缺少兼容标记时失败，修正路由后通过。当前 App/Wire 输入与 APK source commit `4043171d3b6e89ef32a5a7a3c56d5c7b7ab9b40c` 的精确比较为 clean，普通 APK 选择路径也在修正后直接复用 `910003`，没有进入 Gradle。源码 Relay 重启后，用户于 `2026-07-20T08:43:28Z` 完成实体 Android 交互路径并反馈无问题；随后已停止 backend 并保留测试状态。

## 内存问题与修正

首次原生构建因整机内存压力被停止。第二次在 4 GiB cgroup 中运行，到 arm64 Skia/native 阶段触发 cgroup OOM；systemd 记录峰值约 5.3 GiB 内存加 2 GiB swap。两次均不声明产生有效 APK。

最终策略改为：

1. 优先复用内容匹配缓存；
2. 否则只导入已审阅、精确匹配当前源码的 APK；
3. 没有可用 APK 时才考虑原生构建；
4. Linux 可用内存低于 12 GiB 时，在启动 Gradle 前拒绝；
5. 构建日志直接落盘，单 worker、仅 arm64，并在中断后清理带精确 marker 的进程组。

失败构建缓存已在证明无相关进程后清理。Relay 识别修正后又尝试过一次隔离重建：内存预检查通过，但 Maven Central 在 Kotlin 依赖解析时终止 TLS handshake；单次重试到达 JavaScript bundling 后，Bun 因 `EMFILE: too many open files, watch` 退出。两次均无残留 Gradle/native 进程，也没有声明 APK 产物。`preview:reset` 现在只在取得外置 lifecycle lock 后重新读取 state，并把 APK 准备到首次 backend state 发布放在同一个锁区间；它还会停止带精确 marker 的构建进程组并删除不完整 profile。本次 3.3 GiB 失败目录已通过该路径移除。由于 Relay 已保留向后兼容标记，已安装的 `910003` 手测路径不再需要此次重建。

## 门禁

```bash
bun test scripts/preview.test.ts
bun run ci:dev
bun run ci:cli
bun run ci:fast
bun build scripts/preview.ts --target bun --outfile dist/test-state/preview-build.js
bun pm untrusted
git diff --check
```

已观察到 Wire 33、CLI 585、Relay 119、App 791 tests / 3,183 assertions，以及 dev/Preview lifecycle 34 tests / 193 assertions。早期 requirements verifier 已批准基础框架；最终并发补救复审也返回 `APPROVE`，未发现 P0/P1/P2 或新回归。

## 尚未执行

- 实体手机完成情况来自操作者确认；未保留配对 URL、账号数据、截图或其他敏感交互产物。
- 自动验证没有启动真实 managed Pi TUI，因为这会创建 live Pi session 并依赖 provider 凭据；仅验证了隔离启动环境。
- 本机未完成原生 fallback build；当前 App/Wire 复用精确审阅的 `910003` APK。
- 导入的旧 APK 可能短暂初始化 `relay.jczhang.cc` 默认配置。框架会在配对前暂停，要求先切换到显示的本地 URL；CLI/daemon 始终只连接本地 Relay。
- 局域网防火墙或 AP client isolation 仍可能阻止手机访问，框架不会修改系统或路由器防火墙。
