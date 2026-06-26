# Lyntty Roadmap

状态：PRD 已确认。本文把 PRD 转成实现顺序，不是日历计划。

## Roadmap 原则

- 先打通 vertical slice，再扩展页面和边缘能力。
- 每个 milestone 必须留下可验证证据：protocol tests、Android build/UI test、manual smoke 或明确 not-run reason。
- Android-first、pi-first。Product web client、iOS、multi-user SaaS、PR manager、terminal mirror 都不进入当前路线。
- `Review Evidence` 是 `Session Remote` 内的 mode/panel，不是独立主导航。
- 真实工作留在 node；Android app 只控制 `relay` -> `lynttyd` -> `active runtime` 上的 `pi` session。

## Milestones

### M0 — Repo scaffold + protocol contracts

目标：建立最小代码结构和跨端协议，后续工作都围绕同一 contract 实现。

范围：

- scaffold `relay`、`lynttyd`、pi extension stub、Expo/React Native Android shell。
- 定义 shared protocol：session、node、runtime、event、command、confirmation、evidence、error、auth token、sequence envelope。
- 建立 `packages/client-core/`，承载 session reducer、event grouping、reconnect/dedupe、Review Evidence summary、recovery state mapping、command state machine。
- 建立最小 test harness：public relay/node/client protocol tests + `git diff --check`。

完成标准：

- repo 能安装、构建基础包，并运行最小协议测试。
- mock node 能通过 `relay` 发送 ordered events，client-core 能生成 session state。
- 文档列出 contract 版本、breaking-change 规则和 test command。

非目标：真实 `pi` runtime、完整 Android UI、notifications、previews。

依赖：无。

### M1 — Pairing, auth, and node presence

目标：Android 能安全绑定到一个运行 `lynttyd` 的 node，并看见 node 可用状态。

范围：

- owner token -> device token flow，device token encrypted storage，revocation path。
- node token auth、node heartbeat、stale/offline/revoked states。
- QR/short-code pairing flow。
- `Node Management` 最小页面：node name、health、last heartbeat、roots/workspace、trust state、diagnostics。

完成标准：

- Android app 能配对 local node，重启后使用 stored device token 恢复。
- revoked device 不能继续访问。
- node offline/stale 在 UI 和 protocol state 中可见。
- security tests 覆盖 unauthenticated、expired token、revoked token。

非目标：session control、`pi` execution、Review Evidence。

依赖：M0。

### M2 — Session registry + activation lock

目标：建立 session/runtime model，并保证一个 session 只有一个 `active runtime`。

范围：

- session registry：native `/lyntty` session registration、recent session resume、headless session creation metadata。
- runtime adapter contract：覆盖 native `/lyntty` 和 headless `pi` SDK paths；mocks 可以支撑测试，但边界必须明确。
- `active runtime` heartbeat、lease、stale state、explicit takeover/release。
- busy takeover UX contract：stop/wait/interrupt。
- node capacity 和 queue state。
- Android-created git sessions 默认 temporary worktree；dirty worktrees 永不自动删除。

完成标准：

- native pi TUI、Android app、debug tooling（development only）能观察同一个 session/runtime state。
- tests 证明 activation lock 防止两个 active runtime 推进同一 session。
- busy runtime takeover 必须显式选择 stop/wait/interrupt。
- capacity full 产生 visible queue state。

非目标：完整 live event feed、Review Evidence、previews。

依赖：M0、M1。

### M3 — Session Remote live control

目标：`Session Remote` 成为手机上的主控制页，能实时监督和控制一个 `pi` session。

范围：

- structured event feed：progress、commands、logs、file changes、checks、errors。
- header/state strip：repo、node、runtime state、model、connection state、current action、elapsed time、last event。
- input semantics：idle 发送新需求；running 默认排队为 next-turn context；redirect active work 必须显式；stop 需确认。
- confirmation handling：只展示 pi/runtime 支持的 confirmation；不支持时显示 “needs computer-side confirmation”。
- 最小 slash command support：known safe local commands pass-through、local-only marking、raw fallback。完整 command discovery/palette polish 可放到 M6。

完成标准：

- Android 可以对同一 active runtime 发送新需求、追加说明、打断改方向、停止任务。
- 至少一次 smoke 证明 Android input 到达真实 native `/lyntty` session 或 headless `pi` SDK runtime，且 resulting events/evidence 通过 `relay` -> `lynttyd` -> `client-core` 返回。Mock runtime 可以支撑测试，但不能满足 M3 completion。
- event feed 不像 terminal mirror；默认折叠低层事件，可过滤、展开、搜索。
- confirmations 出现在 input box 附近，unsupported confirmations 不伪装支持。
- Maestro 覆盖 pairing -> session -> live control 基本流。

非目标：完整 reconnect hardening、Review Evidence 完整复盘、notifications、previews。

依赖：M2。

### M4 — Reconnect, ordering, and `history_gap`

目标：app sleep、网络断开或 node reconnect 后，用户能恢复上下文；无法证明连续性时明确显示 `history_gap`。

范围：

- per-session sequence allocation。
- REST backfill + WebSocket live stream。
- client dedupe by sequence/event identity。
- command idempotency。
- node reconnect、relay/node redelivery。
- visible recovery states：offline、stale、revoked、blocked、`history_gap`。

完成标准：

- tests 覆盖 app sleep、WebSocket reconnect、node reconnect、duplicate redelivery、out-of-order protection。
- 无法证明 continuity 时，继续前必须 emit visible `history_gap`。
- UI 给出恢复路径，不把断点伪装成连续 session。

非目标：new product surfaces、cloud canonical history、zero-trust E2E。

依赖：M3。

### M5 — Review Evidence

目标：在 `Session Remote` 内提供复盘模式，让用户判断 `pi` 做了什么、结果有没有证据、下一步该怎么做。

范围：

- changed files、diff summary、test/check results、command summary、errors、event timeline、artifact metadata、preview anchors、recovery state、next actions。
- command output summary + expandable detail。
- per-file changes readable on Android。
- next actions：继续追问、要求 `pi` 补测/修正、在电脑打开 workspace、导出 evidence。
- evidence summary reducer 放在 `packages/client-core/`，UI 不直接实现协议语义。

完成标准：

- session finished、failed、waiting confirmation 或用户主动打开时，`Review Evidence` 可用。
- 不提供 merge、push 或 PR approve。
- tests 覆盖 evidence reducer、UI anchors、error/test/detail drilldown。
- final acceptance evidence 记录命令、结果、not-run reason。

非目标：独立 Review Evidence 主导航、PR manager、mobile code editor、hardened jailed/WebView preview implementation。

依赖：M3、M4。

### M6 — Notifications, previews, and Android hardening

目标：把核心链路收成可日常使用的 Android 体验，并补齐安全预览和通知。

范围：

- Android notifications：session finished、waits、fails、needs local confirmation、node disconnects。
- static HTML artifact preview。
- constrained live dev-server preview via jailed/read-only/tokenized proxy。
- WebView-safe settings，无 native bridge。
- mobile polish：large touch targets、reduced motion、clear state labels、stable test IDs。
- physical Android smoke，如不可用记录 emulator pass + physical-phone not-run reason。

完成标准：

- preview security tests 覆盖 jail realpath、token expiry、path traversal rejection、no native bridge。
- notifications 在 Android emulator 或 physical device 上有可审证据。
- Maestro 覆盖 happy path、failure path、recovery path、evidence anchors。
- final docs 更新 issue evidence 和 known limitations。

非目标：iOS、Product PWA/web client、unrestricted dev-server tunneling、app-store publishing。

依赖：M5。

## Cross-milestone gates

每个 milestone 完成前必须回答：

- 是否仍保持 Android-first、pi-first？
- 是否把 real work、credentials、canonical `pi` JSONL 留在 node？
- 是否没有新增 terminal mirror、remote desktop、task board、PR manager 或 product web client？
- 是否通过 public protocol 或用户可见行为测试，而不是只测 implementation details？
- 是否记录可复查 evidence：commands、test results、screenshots/logs、not-run reasons？

## Suggested issue slicing

Roadmap 确认后，再拆 implementation issues。建议每个 milestone 拆成 2–5 个 issue：

- contract/schema issue：定义协议和 state model。
- backend/node issue：`relay`、`lynttyd`、pi integration。
- Android/client-core issue：state reducer、UI、storage、navigation。
- tests/evidence issue：protocol tests、Maestro、security tests、manual smoke。

不要创建“实现 M3 全部”这类大 issue；每个 issue 必须有 files likely touched、acceptance、test command、done evidence 和 out-of-scope boundary。
