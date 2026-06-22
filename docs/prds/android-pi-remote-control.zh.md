# PRD：Android-first 的 pi Session Remote Control

Issue title：Build Android-first remote control for local pi sessions
Triage label：ready-for-agent

## 问题陈述

JC 想在离开电脑时，用 Android 手机继续监督真实的 `pi` coding session。现在 terminal-first 的 agent 工作流要求人在电脑旁边处理 prompt、steer、approval、abort、diff、test 和 recovery。通用 SSH、远程桌面、terminal mirror、chat wrapper、task-board 产品要么暴露太多机器能力，要么隐藏 session/runtime 这些真正重要的状态。

Lyntty 应让 native 和 headless `pi` session 可从 Android 控制，但不把手机变成小型 IDE。手机优先回答：哪个 paired node 需要注意、session 正在做什么、有什么 evidence、下一步最安全的 control action 是什么。

## 方案

构建 Lyntty：单用户、自托管、Android-first 的 `pi` agent session remote-control surface。

手机是 calm cockpit：进入、监督、批准、中断、review evidence、发送 follow-up control。真实工作留在 paired node 上。local files、repositories、tools、MCP servers、credentials、canonical `pi` session JSONL 都留在运行 `lynttyd` 的电脑或服务器。

主要 surface：

1. Node Management — 管理 paired computers，执行显式 QR/code pairing。
2. Global Inbox — 跨 node/session 的 attention-first overview。
3. Session Remote — 单个 active session/runtime 的主 cockpit。
4. Review Evidence — diffs、tests、commands、logs、events、recovery context。
5. Settings / Recovery — relay URL、owner/device binding、revocation、diagnostics。

第一版实现应证明一个可靠 vertical slice：Android 与 local node pair；continue 或 create `pi` session；stream structured events；支持 steer/follow-up/abort；展示 evidence；reconnect；确保每个 session 只有一个 active runtime。

## User Stories

1. 作为 JC，我想用 QR 或短码把 Android 手机与开发电脑配对，以便快速且显式地完成 setup。
2. 作为 JC，我想 paired node 使用 ThinkPad、Mac Studio 这类名字，以便知道正在控制哪台电脑。
3. 作为 JC，我想 Node Management 展示 node health、last heartbeat、root/workspace、trust state，以便理解电脑状态。
4. 作为 JC，我想 Add Node 和 recovery actions 始终可触达，以免长 node list 隐藏 setup controls。
5. 作为 JC，我想 setup 后隐藏 relay URL 和 owner token，以免日常 UI 看起来像 debug form。
6. 作为 JC，我想 Global Inbox 按 attention 排序，以便 waiting 或 failed sessions 先出现。
7. 作为 JC，我想 waiting-input sessions 优先于 idle recent sessions，以便快速 unblock agents。
8. 作为 JC，我想 needs-attention cards 后显示 running sessions，以便不费力检查 progress。
9. 作为 JC，我想 offline、stale、revoked、blocked、history-gap states 有明确说明，以便知道 recovery path。
10. 作为 JC，我想在启用 `/lyntty` 后从 Android 打开 native `pi` session，以便手机输入进入同一个 runtime。
11. 作为 JC，我想从 Android 创建新的 headless `pi` session，以便离开电脑也能启动 bounded work。
12. 作为 JC，我想从 Android resume recent `pi` session，以免重新解释 context。
13. 作为 JC，我想 native TUI、Android、debug tooling 控制同一个 active runtime，以便 surfaces 保持同步。
14. 作为 JC，我想 Lyntty 防止两个 active runtimes 推进同一个 session，以免重复工作或损坏 workspace。
15. 作为 JC，我想 runtime switch 使用显式 takeover/release 语言，以便切换是 deliberate。
16. 作为 JC，我想 busy runtime takeover 必须选择 stop/wait/interrupt，以免误杀有效工作。
17. 作为 JC，我想 Session Remote header 显示 repo、node、runtime state、model、connection state，以便一眼理解 context。
18. 作为 JC，我想 Now strip 显示 current action、elapsed time、last event，以便知道 agent 在做什么。
19. 作为 JC，我想看到 token-by-token 或 event-by-event structured updates，以便长任务有 live 感。
20. 作为 JC，我想 tool calls 渲染成 cards，以便 command、read、write、edit、result 在手机上可读。
21. 作为 JC，我想低层 streaming updates 默认折叠，以便 event feed 可用。
22. 作为 JC，我想按 events、commands、logs、diffs、tests、errors 过滤，以便快速 inspect evidence。
23. 作为 JC，我想 raw logs 只在 drill-down 中出现，以免 debug detail 占据日常 UI。
24. 作为 JC，我想 composer 位于键盘上方，以便单手发送 next instruction。
25. 作为 JC，我想 idle runtime input 发送 normal prompt，以便 Android 行为像 native pi。
26. 作为 JC，我想 running runtime input 默认发送 steer，以便安全重定向 active work。
27. 作为 JC，我想有显式 follow-up input，以便排队 next-turn context，不打断当前工作。
28. 作为 JC，我想 abort/interrupt controls 需要 confirm，以免误触停止。
29. 作为 JC，我想 common slash commands 通过 command palette 暴露，以免移动端依赖记忆命令。
30. 作为 JC，我想 local-only slash commands 被清楚标记，以便知道何时必须回电脑操作。
31. 作为 JC，我想无法远程回答的 native pi confirmations 显示 “needs computer-side confirmation”，以免 Lyntty 伪装支持 unsupported approvals。
32. 作为 JC，我想 remote-safe approvals 或 extension UI requests 作为 cards 靠近 composer，以便快速回答。
33. 作为 JC，我想 run 后总结 changed files，以便从手机 review impact。
34. 作为 JC，我想 per-file diffs 在 Android 上可读，以便决定 follow-up 还是回 laptop review。
35. 作为 JC，我想 test results 以 summary + expandable detail 展示，以便 pass/fail evidence 清楚。
36. 作为 JC，我想 command output 先摘要、再展开，以便不用 terminal mirror 也能查 failure。
37. 作为 JC，我想有 Review Evidence mode，以便 finished work 与 live progress 分开判断。
38. 作为 JC，我想 review actions 包括 send follow-up、accept locally、open on laptop、export evidence，以便 mobile review 能导向 action。
39. 作为 JC，我想 v0 不提供 merge/push action，以免 Lyntty 假装自己是 PR manager。
40. 作为 JC，我想 session finished、waits、fails、needs local confirmation、node disconnects 时收到 Android notifications，以便离开 app。
41. 作为 JC，我想 reconnect 按 sequence number backfill，以便 app sleep 或网络丢失不丢 context。
42. 作为 JC，我想 reconnect 后 duplicate events 被忽略，以免 feed 重复。
43. 作为 JC，我想无法证明 continuity 时显示 `history_gap`，以便明确缺失 context。
44. 作为 JC，我想 owner-token login 一次后存储 device token，以便日常启动直接打开 sessions。
45. 作为 JC，我想能 revoke device，以便丢手机后移除权限。
46. 作为 JC，我想 events 离开 node 前做基础 secret redaction，以免明显 token 出现在 relay/phone 上。
47. 作为 JC，我想 project/cwd roots 和 recent session cwd values 可用，以便 session creation 指向真实 workspace。
48. 作为 JC，我想 Android-created git sessions 默认使用 temporary worktree，以免实验意外弄脏 main checkout。
49. 作为 JC，我想 dirty worktrees 永不自动删除，以免 agent changes 丢失。
50. 作为 JC，我想 node capacity 和 queue state 可见，以便理解 blocked starts。
51. 作为 JC，我想在安全时预览 static HTML artifact，以便手机检查小型 demo。
52. 作为 JC，我想通过受限 proxy 预览 live dev-server，以便不用远程桌面也能检查简单 app 输出。
53. 作为 JC，我想 Android WebView previews 被 jail 和 tokenized，以免 preview 变成 arbitrary filesystem access。
54. 作为 JC，我想 debug web console 只作为 development tooling，以便 product scope 保持 Android-first。
55. 作为 JC，我想未来保留 Codex/OpenCode adapter seams，以便 Lyntty 能扩展但不破坏 pi-first v0。
56. 作为 JC，我想使用 human-readable labels 而不是 raw IDs，以便 phone supervision 保持 calm。
57. 作为 JC，我想 reduced-motion 和大 touch targets，以便 Android UI 可单手使用。
58. 作为 JC，我想未来支持 dark/light，但 state clarity 优先，以便 design 服务 control 而非 decoration。
59. 作为 JC，我想 stable test IDs，以便 mobile E2E 验证真实 flows。
60. 作为 JC，我想 final acceptance evidence 记录在 repo docs，以便 agent work 跨 session 可 inspect。

## Implementation Decisions

- Lyntty v0 是 Android-first。product PWA/web client 不在 v0 scope；debug web 仅开发工具。
- Lyntty v0 是 pi-first。native pi extension 和 pi SDK runtime 是 first-class；Codex/OpenCode/其他 adapter 是 future seams。
- 产品模型是 node/session/runtime/evidence，不是 task/backlog/project-board。
- Session 是 primary domain object，映射 durable pi conversation/history identity，通常是 pi JSONL。
- Node 是运行 `lynttyd` 的 paired computer/server。
- Surface 是任何 control entry：native pi TUI、Android app、debug web console。
- Active runtime 是当前推进 session 的进程。一个 session 只能有一个 active runtime。
- 使用 relay lease + runtime heartbeat + stale state + explicit takeover 实现 activation lock。
- 多个 authenticated surfaces 可控制同一个 active runtime。
- Native pi extension 只连接本机 `lynttyd`；只有 `lynttyd` 连接 relay。
- Relay 与 `lynttyd` 是逻辑上独立的 deployables；local development 可一起启动。
- Relay 路由 events/commands，验证 owner/device/node tokens，保存 metadata/cache/queue，不成为 canonical history。
- Pi session JSONL 保持 canonical history。
- `lynttyd` 负责 node-local event cache、per-session sequence allocation、root scanning、path completion、SDK runtime start/resume、activation lock participation、capacity、worktree management、preview proxying。
- Android 主导航概念：Node Management、Global Inbox、Session Remote、Review Evidence、Settings/Recovery。
- Node Management 不得展示 per-session attention、evidence、waiting states、next-step prompts。
- Global Inbox 是 attention-first：needs attention、running、node status、secondary actions。
- Session Remote 使用 structured event feed，不是 terminal mirror。
- Composer 遵循 pi semantics：idle 发送 prompt，running 默认 steer，follow-up 显式，abort 需确认。
- Slash command support 尽量探测 runtime capability；local-only commands 标记，unknown commands 可 raw fallback。
- Lyntty 不发明额外 approval/risk gate。只 surface pi/runtime approvals；不支持时报告 computer-side confirmation。
- Full event stream 保留；移动端用 collapse/filter/search/pin 保持可用。
- Events 包含 `eventId`、`sessionId`、`runtimeId`、`nodeId`、`seq`、timestamp、type、source、redacted payload、optional local-only payload reference。
- Reconnect 使用 last seen sequence；relay/node 可 redeliver；clients 按 sequence/event identity dedupe。
- 若 recovery 无法证明 continuity，继续前必须 emit visible `history_gap`。
- Auth flow 是 owner token 一次，之后 encrypted Android storage 中保存可 revoke device token。
- Events 离开 node 前做 basic redaction。这是 self-host trusted-surface security，不是 zero-trust E2E。
- Notifications v0 使用 Android FCM；Telegram/ntfy/Discord/Web Push 不在 v0 product scope。
- Diff、artifact、static HTML preview、minimal live dev-server preview、worktree cleanup state 是 v0 evidence surfaces。
- Static/live previews 必须 jailed、read-only、tokenized、WebView-safe 且无 native bridge。
- Android-created git sessions 默认 worktree-if-git；dirty worktrees 永不自动删除。
- Node capacity 默认 3；capacity full 产生 visible queue state。
- Preferred backend stack：Bun、Hono、WebSocket、SQLite WAL、JSONL、static/prepared SQL。
- Preferred Android stack：Kotlin + Jetpack Compose + Material 3、lean multi-module、OkHttp、Kotlinx Serialization、Room/DataStore、FCM、WebView preview、Maestro E2E。
- 来自恢复 ADR 的 v0.3 dogfood exception：可在 `apps/client/` 放 bounded Expo + HeroUI Native Android client，但必须保留 Kotlin app，并把 UI-free behavior 放在 `packages/client-core/`。

## Testing Decisions

- 最高价值 seam：通过 public relay/node/client protocol 做 end-to-end session control，断言 observable behavior，不测 implementation details。
- 核心 acceptance test 驱动 Android -> relay -> `lynttyd` -> pi runtime -> event/evidence replay。
- Tests 应证明 activation lock、lease heartbeat、stale state、explicit takeover 确保每个 session 一个 active runtime。
- Native pi continuation 应测试启用 `/lyntty` 后 Android input 进入同一个 native runtime，且 native/Android surfaces 观察到同样 events。
- Headless session path 应测试 pi SDK start/resume、prompt、steer、follow-up、abort、persisted pi JSONL history。
- Reconnect tests 覆盖 REST backfill、WebSocket live stream、dedupe、history gap、command idempotency、node reconnect。
- Event reducer tests 将 raw events 映射到 attention state、session state、evidence summaries、collapsed feed groups、detail drilldowns。
- Android UI tests 使用 stable test IDs 覆盖 Node Management、Global Inbox、Session Remote、composer、next steps、events/logs/commands/diff/test details、recovery states、settings。
- Maestro emulator flows 证明 login/pairing、stored-device restore、continue latest、new session、send prompt、steer、abort、evidence anchors。
- Physical Android 应支持并记录。如不可用，final evidence 必须明确 emulator pass + physical-phone not-run reason。
- Security tests 覆盖 owner token exchange、device token refresh、device binding、revocation、node token auth、unauthenticated rejection、expired token rejection、path traversal rejection、redaction。
- Preview tests 覆盖 jail realpath checks、token expiry、no native bridge、WebView-safe settings、no durable relay artifact storage。
- Worktree tests 覆盖 git worktree creation、non-git fallback、dirty cleanup refusal、clean manual cleanup、visible cleanup state。
- 好测试断言外部行为：messages、events、state transitions、security boundaries、UI-visible evidence、recovery instructions。
- Testing/acceptance prior art 来自恢复的 v0.1/v0.2/v0.3 gate docs：Bun checks、protocol/client-core tests、Android build、Maestro emulator、tunnel smoke、native `/lyntty` real-task smoke、`git diff --check`、issue graph checks。

## Out of Scope

- v0 product PWA/web client。
- v0 iOS app。
- Multi-user SaaS。
- Full cloud-hosted agent execution。
- v0 end-to-end encryption。
- Full terminal protocol 或 xterm mirror。
- Generic remote desktop。
- 以 task/backlog/issue/PR manager 作为 primary product model。
- 第一 implementation slice 做 merge/push/app-store/release publishing。
- v0 broad multi-agent support。
- Discord/Telegram/ntfy bot flows。
- Arbitrary Android file editing。
- Unrestricted dev-server tunneling。
- Litter-style saved-app/widget runtime。
- Lyntty 自己发明额外 approval gate。
- 两个 active runtimes 并发推进同一 session。

## Further Notes

- 本 PRD 取代早先 broad “web + APK multi-agent” framing。恢复的旧决策将 v0 有意收窄为 Android-first、pi-first remote control。
- 参考产品仍有价值，但只选择性借鉴：
  - Claude Code Remote Control：local execution、phone as control surface、reconnect、QR-style pairing。
  - MindFS：structured tool/event cards、agent gateway ideas。
  - Litter：native mobile control、pairing patterns。
- Lyntty 应借鉴 remote-control 与 mobile supervision patterns，不做 terminal mirror、generic web client、multi-agent theater。
- 恢复来源摘要见 `docs/recovered/previous-lyntty-decisions.md`。
- 建议第一 milestone：scaffold relay + `lynttyd` + pi extension stub + Android shell；证明 pair/login、native `/lyntty` session registration、Android prompt/steer、structured event feed、activation lock、reconnect、evidence summary。
