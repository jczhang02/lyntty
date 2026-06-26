# Lyntty：Android 上的 `pi` coding agent 控制层

产品定位：Android 上的 `pi` coding agent 控制层，类似 Claude Code Remote 之于 Claude Code。

运行链路：Android app 通过 `relay` 连接到运行 `lynttyd` 的本地电脑 / node，由该 node 上的 `active runtime` 推进 `pi` session。repositories、tools、MCP servers、credentials 和 canonical `pi` session JSONL 都留在 node 上；Android 不持有 workspace、不执行代码。

## 问题陈述

用户离开电脑后，仍需要从 Android 继续控制本地电脑 / node 上的 `pi` session：补充需求、查看进展、确认敏感操作、叫停跑偏任务、检查改动和运行结果，并在 app sleep、网络断开或 node 重连后恢复上下文。

现在这些动作通常要求用户回到电脑前，或退而求其次使用 SSH、远程桌面、terminal mirror 或另一个 chat wrapper。SSH 和远程桌面暴露太多机器能力；terminal mirror 在小屏上不可读；普通 chat wrapper 看不到真实 session/runtime 状态、activation lock、changed files、test/check results、errors、artifacts/previews 和 `history_gap`。

## 方案

Lyntty 是单用户、自托管、Android-first 的 `pi` coding agent 控制层。它不是远程桌面、手机 IDE、terminal mirror、task board 或 PR manager。手机只负责控制：发需求、看回复、确认操作、继续追问、打断或停止任务。实际操作都发生在 node 上。

核心使用路径：

1. `Sessions Home`：日常入口，展示 needs attention、running、recent、failed、completed sessions。
2. `Session Remote`：主控制页，界面像手机 chat。用户在这里给 `pi` 发需求、看回复、确认操作、继续追问、打断或停止任务，并看到改动、运行结果、错误、预览和下一步。
   - `Review Evidence`：`Session Remote` 内的复盘模式，不是独立页面，也不是 PR 审查。它在 session 结束、失败、等待确认或用户主动打开时出现，用来集中查看 changed files、diff summary、test/check results、command summary、errors、event timeline、artifacts/previews、recovery state 和 next actions。用户可以继续追问、要求 `pi` 补测或修正、在电脑打开 workspace，或导出 evidence；当前范围不提供 merge、push 或 PR approve。
3. `Node Management`：管理 paired computers、pairing、trust、heartbeat、roots、diagnostics。
4. `Settings / Recovery`：管理 `relay` URL、owner/device binding、revocation、diagnostics 和恢复入口。

当前开发先证明一条最小可用链路：Android 与 local node 配对；继续或创建 `pi` session；实时看到进展；能发新需求、追加说明、打断改方向、停止任务；看到改动和运行结果；断线后接回；确保每个 session 只有一个 active runtime。

## User Stories

### 1. 配对 Android 与 node

用户首次打开 app，使用 QR 或短码将 Android 设备和运行 `lynttyd` 的 node 配对。

Acceptance:

- `Node Management` 显示 node 名称、health、last heartbeat、roots/workspace 和 trust state。
- Add Node 和 recovery actions 始终可触达。
- setup 后隐藏 relay URL 和 owner token；日常入口不长得像 debug form。
- owner token 只用于首次登录，之后使用可 revoke 的 device token。

### 2. 从手机继续或创建 `pi` session

用户从 `Sessions Home` 找到 waiting、running、failed、recent sessions，继续现有 session 或创建 headless `pi` session。

Acceptance:

- waiting sessions 排在普通 recent sessions 前面；running sessions 靠前。
- native `/lyntty` session、Android-created headless session、recent session resume 都进入同一套 session/runtime model。
- Android-created git sessions 默认使用 temporary worktree；dirty worktrees 永不自动删除。
- 当前产品范围不提供 merge、push 或 PR approve。

### 3. 监督 active session

用户进入 `Session Remote` 后，看到 repo、node、runtime state、model、connection state、current action、elapsed time 和 last event。

Acceptance:

- Android app、native pi TUI、debug tooling（development only）观察同一个 active runtime。
- 一个 session 只能有一个 active runtime；runtime switch 使用 explicit takeover/release。
- busy runtime takeover 必须选择 stop/wait/interrupt。
- token-by-token 或 event-by-event updates 可见；低层事件默认折叠，可按进展、命令、日志、改动、检查和错误过滤。

### 4. 输入、补充、打断和停止

用户在手机输入新需求；运行中可追加下一轮补充说明；需要时显式打断改方向或停止任务。

Acceptance:

- input box 在键盘上方，适合单手操作。
- idle 时输入发送新需求；running 时默认排队为 next-turn context。
- 打断改方向和停止必须是显式动作，并需要确认。
- common slash commands 通过命令面板暴露；local-only slash commands 明确标记。

### 5. 处理确认和受限操作

用户在手机上处理可远程回答的确认；不能远程回答的 native `pi` confirmation 要明确回电脑处理。

Acceptance:

- Lyntty 不发明额外 confirmation/risk gate。
- 只展示 pi/runtime 已支持的确认请求。
- 不支持远程回答时显示 “needs computer-side confirmation”。
- phone-answerable confirmations 或 extension UI requests 显示在 input box 附近。

### 6. 复盘 `pi` 的结果

用户在 `Review Evidence` 看本次 session 的 changed files、diff summary、test/check results、command summary、errors、event timeline、artifacts/previews、recovery state 和 next actions。

Acceptance:

- command output 先摘要、再展开。
- per-file changes 在 Android 上可读。
- test/check results 显示 summary + expandable detail。
- next actions 包括继续追问、要求补测/修正、在电脑打开 workspace、导出 evidence；不包括 merge、push 或 PR approve。

### 7. 断线和恢复

用户离开 app、网络中断或 node reconnect 后，回到 app 仍能恢复 session 上下文。

Acceptance:

- reconnect 按 sequence number backfill。
- duplicate events 被忽略。
- 如果无法证明 continuity，必须显示 `history_gap`。
- offline、stale、revoked、blocked states 有明确恢复路径。

### 8. 安全预览和通知

用户收到 session 状态变化通知，并在安全边界内预览小型结果。

Acceptance:

- session finished、waits、fails、needs local confirmation、node disconnects 时发送 Android notifications。
- events 离开 node 前做 basic secret redaction。
- static HTML artifact 和受限 live dev-server preview 必须 jailed、read-only、tokenized、WebView-safe 且无 native bridge。
- debug web console 只用于 development tooling，不作为 product web client。

## Implementation Decisions

- Lyntty 是 Android-first。Product PWA/web client 不属于当前产品方向；debug web 只作 development tooling。
- Lyntty 是 pi-first。native pi extension 和 pi SDK runtime 是 first-class；当前 scope 只支持 `pi` runtime。
- 产品模型是 node/session/runtime/evidence，不是 task/backlog/project-board。
- Session 是主要 domain object，映射 durable pi conversation/history identity，通常是 `pi` JSONL。
- node 是运行 `lynttyd` 的 paired computer/server。
- Product surfaces 是 Android app 和 native pi TUI integration。`debug web console` 是 development surface，只用于协议调试和 E2E 辅助验证，不作为 product web client。
- active runtime 是当前推进 session 的进程。一个 session 只能有一个 active runtime。
- 用 `relay` lease、runtime heartbeat、stale state 和 explicit takeover 实现 activation lock。
- 多个 authenticated surfaces 可以控制同一个 active runtime。
- Native pi extension 只连接本机 `lynttyd`；只有 `lynttyd` 连接 `relay`。
- `relay` 与 `lynttyd` 是逻辑上独立的 deployables；local development 可一起启动。
- `relay` 路由 events/commands，验证 owner/device/node tokens，保存 metadata/cache/queue，不成为 canonical history。
- `pi` session JSONL 保持 canonical history。
- `lynttyd` 负责 node-local event cache、per-session sequence allocation、root scanning、path completion、SDK runtime start/resume、activation lock participation、capacity、worktree management、preview proxying。
- Android 主导航只包含 `Sessions Home`、`Session Remote`、`Node Management` 和 `Settings / Recovery`。`Review Evidence` 是 `Session Remote` 内的 mode/panel，不是独立主导航项。
- `Sessions Home` 是日常入口，按有用状态展示 sessions：needs attention、running、recent、completed/error。
- `Node Management` 用于 paired computers、pairing、trust、heartbeat、roots、diagnostics，不做日常 session inbox。
- `Session Remote` 使用 structured event feed，不是 terminal mirror；界面可以像 chat，但必须暴露 runtime state 和 evidence anchors。
- input box 遵循 pi semantics：空闲时发送新需求；运行中默认排队为下一轮补充说明；打断改方向必须显式；停止需确认。
- Slash command support 尽量探测 runtime capability；local-only commands 标记，unknown commands 可 raw fallback。
- Lyntty 不发明额外确认/风险门槛。只展示 pi/runtime 已支持的确认请求；不支持时报告 computer-side confirmation。
- 完整 event stream 保留；移动端用 collapse/filter/search/pin 保持可用。
- Events 包含 `eventId`、`sessionId`、`runtimeId`、`nodeId`、`seq`、timestamp、type、source、redacted payload、optional local-only payload reference。
- Reconnect 使用 last seen sequence；`relay`/node 可 redeliver；clients 按 sequence/event identity dedupe。
- 若 recovery 无法证明 continuity，继续前必须 emit visible `history_gap`。
- Auth flow 是 owner token 一次，之后 encrypted Android storage 中保存可 revoke device token。
- Events 离开 node 前做 basic redaction。这是 self-host trusted-surface security，不是 zero-trust E2E。
- Notifications 使用 Android FCM；Telegram、ntfy、Discord、Web Push 不属于当前产品范围。
- `Review Evidence` 必须至少包含 changed files、diff summary、test/check results、command summary、errors、event timeline、artifacts/previews、recovery state 和 next actions。
- 文件改动、artifact、static HTML preview、minimal live dev-server preview、worktree cleanup state 是必须做的 evidence surfaces。
- Static/live previews 必须 jailed、read-only、tokenized、WebView-safe 且无 native bridge。
- Android-created git sessions 默认 worktree-if-git；dirty worktrees 永不自动删除。
- Node capacity 默认 3；capacity full 产生 visible queue state。
- Preferred backend stack：Bun、Hono、WebSocket、SQLite WAL、JSONL、static/prepared SQL。
- Preferred Android stack：React Native + Expo + TypeScript、HeroUI Native、Expo Router、TanStack Query、Expo SecureStore、Expo SQLite/AsyncStorage、Expo Notifications/FCM、WebView preview、Maestro E2E。
- `apps/client/` 是主要 Android app 工作区，采用 Expo/React Native + HeroUI Native。
- `packages/client-core/` 保存 UI-free behavior：session reducer、event grouping、reconnect/dedupe、Review Evidence summary、recovery state mapping 和 command state machine。React Native UI 只消费这些状态，不直接实现协议语义。

## Testing Decisions

- 最高价值 seam：通过 public relay/node/client protocol 做 end-to-end session control，断言 observable behavior，不测 implementation details。
- 核心 acceptance test 驱动 Android -> relay -> `lynttyd` -> pi runtime -> event/evidence replay。
- 测试要证明 activation lock、lease heartbeat、stale state、explicit takeover 确保每个 session 一个 active runtime。
- Native pi continuation 要测试启用 `/lyntty` 后 Android input 进入同一个 native runtime，且 native/Android surfaces 观察到同样 events。
- Headless session path 要测试 pi SDK start/resume、发送新需求、打断改方向、追加说明、停止任务、persisted pi JSONL history。
- Reconnect tests 覆盖 REST backfill、WebSocket live stream、dedupe、`history_gap`、command idempotency、node reconnect。
- Event reducer tests 将 raw events 映射到 session state、evidence summaries、collapsed feed groups、detail drilldowns。
- Android UI tests 使用 stable test IDs 覆盖 Sessions Home、Node Management、Session Remote、输入框、next steps、events/logs/commands/改动/测试详情、recovery states、settings。
- Maestro emulator flows 证明 login/pairing、stored-device restore、continue latest、new session、发送新需求、打断改方向、停止任务、evidence anchors。
- Physical Android 应支持并记录。如不可用，final evidence 必须明确 emulator pass + physical-phone not-run reason。
- Security tests 覆盖 owner token exchange、device token refresh、device binding、revocation、node token auth、unauthenticated rejection、expired token rejection、path traversal rejection、redaction。
- Preview tests 覆盖 jail realpath checks、token expiry、no native bridge、WebView-safe settings、no durable relay artifact storage。
- Worktree tests 覆盖 git worktree creation、non-git fallback、dirty cleanup refusal、clean manual cleanup、visible cleanup state。
- 好测试断言外部行为：messages、events、state transitions、security boundaries、UI-visible evidence、recovery instructions。
- Testing/acceptance prior art 来自恢复的 gate docs：Bun checks、protocol/client-core tests、Android build、Maestro emulator、tunnel smoke、native `/lyntty` real-task smoke、`git diff --check`、issue graph checks。

## Out of Scope

- Product PWA/web client。
- iOS app。
- Multi-user SaaS。
- Full cloud-hosted agent execution。
- 完整 end-to-end encryption。
- Full terminal protocol 或 xterm mirror。
- Generic remote desktop。
- 以 task/backlog/issue/PR manager 作为 primary product model。
- 当前产品范围不做 merge、push 或 app-store publishing。
- Broad multi-agent support。
- Discord/Telegram/ntfy bot flows。
- Arbitrary Android file editing。
- Unrestricted dev-server tunneling。
- Litter-style saved-app/widget runtime。
- Lyntty 自己发明额外确认门槛。
- 两个 active runtime 并发推进同一 session。

## Further Notes

- 本 PRD 取代早先 broad “web + APK multi-agent” framing。恢复的旧决策将产品方向收窄为 Android-first、pi-first remote control。
- 参考产品仍有价值，但只选择性借鉴：
  - Claude Code Remote：local execution、phone as control surface、reconnect、QR-style pairing。
  - MindFS：structured tool/event cards、agent gateway ideas。
  - Litter：native mobile control、pairing patterns。
- Lyntty 可以借鉴移动端监督和远程控制模式，但不做 terminal mirror、generic web client 或 broad multi-agent support。
- Future compatibility：protocol 和 `packages/client-core/` 不应把实现写死到单一 runtime class，但当前产品只支持 `pi`。Codex/OpenCode adapter seams 只保留为未来扩展边界，不进入当前 scope、UI 或 acceptance。
- 恢复来源摘要见 `docs/recovered/previous-lyntty-decisions.md`。
- 建议 initial engineering milestone：scaffold `relay` + `lynttyd` + pi extension stub + Expo/React Native Android shell；证明 pair/login、native `/lyntty` session registration、Android 发送新需求/追加说明/打断改方向、structured event feed、activation lock、reconnect、evidence summary。
