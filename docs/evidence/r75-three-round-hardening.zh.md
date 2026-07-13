# R75 三轮加固

日期：2026-07-13

目标：`19c76cd7-efde-436f-97f0-392563151751`

Beads Epic：`lyntty-8z4`

## 第一轮——安全边界

状态：完成实现、独立阻塞审查、阻塞修正和复审；复审无 P0/P1 阻塞。

### 变更

- 在 `onRequest` 阶段用 daemon control token 保护 `lynttyd` 全部本地 HTTP 端点。
- 更新 control client 和保留的 agent integration helper，使其发送 token。
- 不区分大小写地拒绝进程加载器和命令解析相关环境变量，包括 `NODE_OPTIONS`、`PATH`、`PATHEXT`、`COMSPEC` 和保留的 `LYNTTY_*`。
- 在支持 POSIX 权限的平台上，将 Lyntty 状态/日志目录限制为 `0700`，凭据、daemon state/lock、session encryption ledger 限制为 `0600`。
- doctor 输出不再显示 daemon control token。
- Android release 与 relay deploy 仅允许 `main == origin/main`；生产任务绑定命名 GitHub Environment；relay PR 镜像构建与 main 发布分离。
- 将 pnpm overrides/build allowlist 迁入 `pnpm-workspace.yaml`，升级有漏洞的 runtime 依赖，并增加 production high/critical audit 门禁。
- 脱敏 6 个已跟踪 pairing URL，删除 18 张可能暴露认证材料的 auth/pairing 截图；新增逐字节 evidence 扫描、欺骗后缀测试和敏感截图规则。
- Docker 构建上下文排除 `.env*`，仅允许明确的 `.env.example`。

### 验证

```text
HOME=<temporary> LYNTTY_HOME_DIR=<temporary> pnpm ci:fast
```

结果：

- repository hardening：6/6；
- production audit：critical 0、high 0；仍有 moderate 27、low 6；
- wire：19 tests；
- CLI：typecheck 通过，798 tests；
- relay：typecheck/build 通过，101 tests；
- app：typecheck/i18n/config 通过，795 tests；
- agent：typecheck 通过，227 tests；
- `git diff --check`：通过。

独立复审：第一轮无剩余 P0/P1 阻塞。

### 未运行与残余风险

- 未执行生产 Android release、relay image publish、SSH deploy、npm publish 或 push。
- GitHub 当前尚未配置 `production-android` / `production-relay` Environment 保护规则。workflow 已在代码中强制 `main == origin/main`，但 required reviewers 和 deployment branch rules 仍需仓库所有者配置。
- 剩余 moderate/low advisory 未被视为已证实可达的 runtime 漏洞，仍可通过 `pnpm audit` 查看。
- 旧的 relay 短 SHA 镜像 tag 不再被 deploy workflow 接受；下一次部署或回滚演练前需要生成 full-SHA 镜像。

## 第二轮——运行时可靠性

状态：完成多轮实现、对抗性审查、阻塞修复、全量测试与独立终审。

### 变更与验证

- Pi 命令队列加入 epoch、紧急命令排序、有限重试、终态失败、queue-full 反馈、独立 relay receive cursor 和按 session fsync 的 outcome ledger。
- 以 Pi 真正接受 prompt 作为 durable success；隔离 stale ACK、并发 extension instance 与旧 RPC owner。
- 增加 keyed activation lease、wait/stop/interrupt takeover、进程退出等待、stale mirror 清理和 managed runtime bridge 硬锁。
- mirror teardown 会永久关闭 session client，旧 reconnect timer 不会复活。
- relay tag 使用真实 Pi session id；`history_gap` 贯穿 daemon RPC、持久 metadata、Sessions Home 与 Session Remote。
- 增加 fsync canonical JSONL watermark、确认式 replay、relay envelope inventory 和向后兼容的确定性 protocol local id；重启只补发未确认 entry，extension sequence gap 补齐后才推进 watermark。
- CLI 最终：101 files / 834 tests，typecheck/build 通过。
- 隔离实测：手机命令在 `lynttyd` 停止时先进入 relay，重启后仅由 Pi 执行一次并返回 APK；extension `/reload` 后仅新 instance 消费命令。
- 第二轮独立终审修复永久 close 问题后，无剩余 P0/P1。

## 第三轮——移动端可靠性与 Maestro E2E

状态：完成实现、release-style APK、真实多维 Maestro 和独立终审。

### 变更

- MMKV 持久化加密 relay outbox 与 synthetic-session send；按真实 `pi-local:` identity 迁移 v1 数据，每次 session snapshot 后重试 canonical reconciliation，并在网络发送前完成 synthetic-to-normal 密文持久化切换。
- 消息 durable queue 成功前不清 composer；阻止重复点击并显式报告 session/encryption 失败。
- discovered computer-side Pi mirror 失败时不再降级启动重复 managed runtime。
- backward relay page 先按 seq 升序再进入有状态 reducer，live update 串行处理；waiting-extension/history-gap remediation 保持可见。
- 恢复非生产 release-style APK 路径 `dev.jczhang.lyntty.dev`，使用固定 preview-only signer；生产 release 仍强制独立生产签名与 Firebase 文件。
- `react-native-worklets` 升至与 Reanimated 兼容的 0.10 系列。

### APK 与 Maestro 证据

全程使用临时 `HOME`、临时 `LYNTTY_HOME_DIR`、独立 tmux Pi session、本地 3005 relay 和 Android API 35 AVD `lyntty_v03_api35`；未修改真实 `~/.pi`、`~/.lyntty` 或生产环境。

APK：package `dev.jczhang.lyntty.dev`，version `1.0.0` / code 1，target SDK 36；SHA-256、signer fingerprint、大小、package metadata 与完整构建日志记录于 `docs/evidence/artifacts/r75-maestro-final2/`。preview cleartext resource 为 true，production 保持 false。

Maestro 通过维度：

1. 首次创建账户；
2. 加密 deep-link 配对 node；
3. 历史 Pi session 打开与手机实时回复；
4. App stop/relaunch 后恢复 session 与回复；
5. daemon 停止期间手机命令先持久化到目标 session message endpoint，重启后只执行一次；fragmented prompt 不含完整 assistant token，因此 pane 中 `pane_occurrences=1`；
6. 在已核验隔离 pane 中交互执行 Pi `/reload`，日志出现 `eventReason: reload`、新 owner claim，随后远程命令只执行一次；
7. unknown cursor 触发并显示明确 `history_gap`。

本地 artifacts：`docs/evidence/artifacts/r75-maestro-final2/`，包括七个维度 JUnit、编排 checkpoint、reload ownership window、APK build/signer metadata 与 cleanup 记录；临时 pairing 材料已删除。

### 最终门禁与残余风险

- App：87 files / 808 tests，typecheck 通过；
- CLI：101 files / 834 tests，typecheck/build 通过；
- Wire：19 tests，build 通过；Relay：101 tests，typecheck 通过；production audit high/critical 为 0（moderate 27、low 6）；
- workflow hardening 3/3、release APK assembly、`git diff --check` 均通过；
- 独立最终发布阻塞审查结论：**APPROVE**，无剩余 P0/P1。
- 未做真机或 iOS；Android API 35 release-style emulator 是本轮设备证据。
- 未执行生产签名、publish、deploy、npm publish、push 或 PR；GitHub Environment reviewer/branch policy 仍需仓库所有者配置。
