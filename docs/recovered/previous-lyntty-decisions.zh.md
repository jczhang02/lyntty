# 恢复的 Lyntty 决策

来源：`/home/jc/.local/share/Trash/files/lyntty`，恢复时间 2026-06-22。

本文件总结已删除 Lyntty repo 中的旧 product、grill、design、ADR、gate 决策。它不是旧 repo 的完整恢复。

## 产品目的

Lyntty 是单用户、自托管的 pi agent session remote-control surface。

它是监督真实 agent 工作的 control plane，不是 terminal mirror、chat app、task manager、generic dashboard 或 phone IDE。

核心原则：session 是核心；control surfaces 只是入口。

手机负责进入、监督、approval、interrupt、evidence review、follow-up control。真实工作仍运行在 paired node 上的 active pi runtime 中。

## 主要用户

主要用户是 JC，以及在一台或多台可信电脑上运行 pi、想用 Android 手机监督 sessions 的本地开发者。

主要场景：

- 离开电脑时检查哪个 node/session 需要 attention；
- 从手机 continue、steer、approve、abort、inspect running pi session；
- 在 paired node 上启动 bounded remote task；
- review concrete evidence：status、commands、logs、diffs、tests、next-step prompts；
- 从 stale、offline、revoked device states 中恢复，同时不在日常 UI 暴露 relay/token 机制。

## Brand / UX Direction

Brand personality：calm cockpit。

- controlled、reliable、precise；
- quiet confidence，而非 flashy automation theater；
- 技术监督所需密度足够，但不拥挤；
- human-readable states 优先于 protocol jargon；
- evidence-first：重要 claim 必须有 visible status 或 inspectable detail；
- one-hand Android ergonomics：stable primary actions、predictable drilldowns、无隐藏 critical controls。

## Anti-References

不要让 Lyntty 像：

- terminal mirror；
- task manager/backlog board；
- pure chat app；
- permanent setup dashboard；
- flashy dashboard；
- 带 avatars/personas/unsupported claims 的 multi-agent theater。

## Home Hierarchy 决策

旧 grill prep 曾推荐 node-first 和 attention-first inbox。当前产品方向改为 session-first 日常导航：

1. Sessions Home。
2. Session Remote。
3. Review Evidence。
4. Node Management / pairing。
5. Settings / recovery。

已拒绝模型：

- task workbench；
- pure chat + evidence drawer；
- debug console as product UI。

原因：

- Session/runtime 是当前 protocol truth，也是用户每天要恢复或监督的对象。
- Node/computer 仍然重要，但主要用于 pairing、trust、diagnostics 和选择新工作运行位置。
- Attention state 应放在 session rows 上，不做成独立产品对象。
- Task labels 以后可由 session name/goal 派生。
- Chat/composer 是 session action，不是整个产品。
- Connection details 属于 onboarding/settings/recovery。

## Node Management 决策

Node Management 是 paired computers 的稳定页面。

应该展示：

- node name；
- online/offline/stale state；
- last heartbeat；
- default root/workspace；
- trust/revocation state。

不得展示：

- per-session attention；
- active-session previews；
- waiting-input labels；
- diff/test evidence；
- next-step prompts。

Add node flow：

- 显式 desktop pairing mode，例如运行 `lyntty pair`；
- scan QR 或输入 short pairing code；
- relay URL、owner token、device binding 隐藏在 QR/manual recovery 后面，不出现在日常 copy。

Layout constraint：

- Node Management 不得变成把 Add Node 推出屏幕的一长页 scroll。
- Header/context 与 add/recovery actions 保持可触达。
- Paired-node collection 使用 bounded internal scroll。

## Sessions Home 决策

Sessions Home 回答：现在有哪些工作可以恢复、解锁或检查？

优先级：

1. needs-attention sessions；
2. running sessions；
3. recent sessions；
4. completed/error sessions；
5. node filter、new session、node-management actions。

Needs-attention 示例：

- waiting input；
- failed test；
- command rejected；
- history gap；
- relay/node disconnected；
- local confirm needed。

## Session Remote 决策

Session Remote 是一个 active session/runtime 的主 cockpit。

推荐 surface：

- repo + runtime state + relay chip；
- Now strip：current action、elapsed time、last event；
- composer：next instruction primary，steer/follow-up secondary；
- abort/interrupt behind confirm；
- evidence stack：diff、tests、commands、logs、events 默认折叠；
- waiting/failed/history_gap 时 inline recovery/action card。

## Review Evidence 决策

Result state 有独立 review mode。

Review 展示：

- changed files；
- test results；
- risks；
- diff/test/command/log/event detail；
- follow-up action；
- accept locally/open on laptop/export evidence。

除非未来 scope 明确加入，否则没有 merge/push 行为。

## Runtime / Session 决策

- Native pi session 在 `/lyntty` 启用 remote control 后可被控制。
- Android-created/restored session 使用 `lynttyd` 和 pi SDK runtime。
- 同一 session 不允许两个 active runtimes。
- 多个 surfaces 可控制同一个 active runtime。
- 使用 relay lease + runtime heartbeat + stale state + explicit takeover。
- Busy runtime 需要显式 interrupt/stop/wait decision。
- UI 语言使用 “Activate here”、“Release runtime”、“Currently active on node X”；避免 “owner handoff”。

## Input 决策

Pi-compatible composer：

- runtime idle：发送 normal prompt；
- runtime running：默认排队 follow-up；
- `steer` 是显式 interrupt action；
- 支持 runtime 能力范围内的 abort/interrupt；
- event feed 显示 command source。

Slash command strategy：

- 尽量探测 runtime command capabilities；
- 已知 local-only commands 标记为 “requires computer-side pi”；
- unknown slash command 可 raw send 到 pi 作为 fallback；
- remote-safe candidates：`/compact`、`/clear`、`/context`、`/usage`、`/exit`、`/recap`、`/name`。

## Event / History 决策

- Full event stream with collapse/filter UI。
- 保留 raw-ish events，但移动端默认折叠 summary。
- Event categories 包括 lifecycle、user input、assistant deltas、tools、approvals、model/thinking、slash commands、queue/capacity、activation lock、diff/artifact/preview、push、errors、reconnect、history gaps。
- Pi JSONL 是 canonical history。
- Relay 只存 metadata/cache/queue，不存 canonical session history。
- `lynttyd` 分配 monotonic per-session `seq`。
- Reconnect 使用 last seen `seq`；client 处理 duplicates。
- 如果 continuity 无法证明，emit `history_gap`。

## Auth / Security 决策

- Owner token once，之后 persistent device token。
- Device token 存在 encrypted Android storage。
- Android settings 与 CLI 支持 device revocation。
- Nodes 使用 CLI/config 生成的 node tokens。
- Production 需要 TLS。
- Events 离开 node 前做 basic redaction：常见 API keys、secret env values、private key blocks、auth headers。
- 完整 E2E encryption 不属于当前产品范围。
- Phone 是 trusted self-host surface，不是 zero-trust boundary。

## Notifications 决策

Android 使用 FCM。

Triggers：

- agent run finishes；
- runtime waits for input；
- remote-servable approval/request appears；
- native local-only confirmation blocks progress；
- runtime errors/fails；
- node disconnects/reconnects；
- queued session starts or blocks。

Telegram、ntfy、Discord、Web Push 不属于当前产品范围。

## Diff / Artifact / Preview 决策

Android 应展示：

- changed files；
- git diff summary 和 per-file diff；
- generated artifact links/previews；
- static HTML artifact preview；
- minimal live dev-server preview；
- image/text artifact preview；
- worktree cleanup state。

Constraints：

- preview read-only；
- workspace jail + realpath checks；
- short-lived token URLs；
- relay proxies bytes，但不存 files；
- Android WebView 禁用 file/content access；
- prototypes 没有 native bridge。

## Worktree / Capacity 决策

- Android-created session 在 git repo 中默认 worktree-if-git。
- Non-git fallback 是 same directory。
- Worktree path 可预测，例如 `.lyntty/worktrees/<session-slug>`。
- 永不自动删除 dirty worktree。
- Node capacity 可配置，默认 3。
- Capacity full 时 new/restore request 进入 visible queue。

## Old Repo 技术栈决策

Backend/node：

- Bun runtime/package manager。
- Hono relay/API。
- WebSocket realtime。
- SQLite WAL + JSONL。
- prepared/static SQL discipline。
- pi extension 用于 native session control。
- pi SDK `AgentSessionRuntime` 用于 headless sessions。

Android product client：

- Kotlin + Jetpack Compose + Material 3。
- Lean multi-module app。
- OkHttp + Kotlinx Serialization。
- Room/DataStore as needed。
- Firebase Messaging。
- WebView preview。
- Maestro E2E。

恢复的 dogfood exception：

- 在 `apps/client/` 增加 bounded Expo + HeroUI Native Android dogfood client。
- 保留 Kotlin `apps/android/`；不要删除或 rewrite。
- 抽取 UI-free shared TypeScript behavior 到 `packages/client-core/`。
- Web/PWA 不是该 dogfood gate 的 acceptance。

## ADR 0001 摘要

恢复的 ADR decision：

- `apps/client/` 是 bounded dogfood control client，不是 product web/PWA client。
- `packages/client-core/` 不得依赖 React Native、Expo SecureStore、HeroUI Native。
- Expo app 负责 SecureStore、platform URLs、React Native WebSocket behavior。
- Canonical history 留在 node 的 Pi JSONL。
- Native pi extension 保持 local-only：extension -> local `lynttyd`；只有 `lynttyd` 连接 relay。
- 通过 activation lock/relay lease 保持每个 session 一个 active runtime。
- 不加额外 Lyntty risk gate；pi 要求时 native pi confirmations 保持 computer-side。
- Public access 是 preview tunnel，不是 production deployment。
- Tunnel URL alone 不是 auth。
- Final evidence 必须证明 Kotlin app 被保留，并记录 physical phone status。

## 旧 Milestone 状态

旧删除 repo 已有大量实现与 docs：

- real-alpha gate 作为 private technical gate 完成。
- dogfood-local gate 完成。
- HeroUI Native dogfood gate 于 2026-06-09 通过 emulator/public-preview/native-smoke scope。
- Physical phone 未运行，因为没有连接实体 Android device。
- 旧 git state：branch `main` 比旧 `origin/main` ahead 16 commits，且有大量 uncommitted dogfood files。

重要旧 evidence：

- `bun run check` passed。
- Expo debug APK built。
- Maestro emulator smoke 与 dogfood flows passed。
- Native `/lyntty` real-task smoke 编辑 fixture 并运行 Bun test。
- Public tunnel preview smoke passed，要求 auth/binding，debug route blocked。

## 当前产品对齐

产品 PRD 已采用这些恢复决策里的窄方向：

- Android-first product surface，不做 product PWA/web。
- Debug web 只是 developer tooling。
- `pi` runtime 是 primary；Codex/OpenCode adapters 是 future extension points。
- Sessions Home 是日常入口；Node Management 是二级管理界面。
- Product 应避免 multi-agent theater。
