# Product Context

## 范围

Lyntty 是 Android-first、self-hosted 的本地 `pi` agent session remote-control surface。手机负责监督和控制工作；paired node 保留 canonical files、credentials、tools、MCP servers 和 `pi` session history。

Lyntty 不是 terminal mirror、generic remote desktop、task board、PR manager 或 multi-user SaaS product。

## 核心 domain objects

- **Node** — 运行 `lynttyd` 的 paired computer 或 server。
- **Session** — durable `pi` conversation/history identity，通常由 canonical `pi` JSONL 支撑。
- **Runtime** — 当前推进 session 的 process。
- **Active runtime** — 唯一允许推进某个 session 的 runtime。
- **Surface** — product control entry，主要是 Android app 和 native pi TUI integration。`debug web console` 只作 development tooling。
- **Relay** — 路由 events 和 commands，认证 tokens，存 metadata/cache/queue，但不是 canonical history。
- **`lynttyd`** — node-local daemon，负责 event cache、sequence allocation、root scanning、SDK runtime start/resume、activation lock participation、capacity、worktree management 和 preview proxying。
- **Evidence** — 用来判断 session 工作的 diffs、tests、commands、logs、events、artifacts、previews 和 recovery context。

## Product surfaces

- **Sessions Home** — needs attention、running、recent、failed、completed sessions 的 daily entry。
- **Session Remote** — 单个 active session/runtime 的 main control page。
  - **Review Evidence** — `Session Remote` 内的 mode/panel，用 evidence 判断已完成或进行中工作。它不是独立主导航，也不是 PR review。
- **Node Management / Pairing** — paired computers、QR/code pairing、health、trust、heartbeat、roots 和 diagnostics。
- **Settings / Recovery** — relay URL、owner/device binding、revocation、diagnostics 和 recovery entry points。

## Invariants

- Real work 留在 paired node。
- `pi` session JSONL 保持 canonical history。
- 一个 session 只能有一个 active runtime。
- 多个 authenticated surfaces 可以控制同一个 active runtime。
- Runtime takeover 必须 explicit。
- Busy runtime takeover 需要 stop、wait 或 interrupt choice。
- Reconnect 使用 sequence backfill，并 dedupe repeated events。
- 如果无法证明 continuity，显示 `history_gap`。
- Android-created git sessions 默认尽可能使用 temporary worktree。
- Dirty worktrees 绝不自动删除。
- Lyntty surfaces supported `pi`/runtime approvals；不发明额外 approval gate。

## Preferred vocabulary

精确使用这些术语：`pi`、`lynttyd`、`relay`、`Sessions Home`、`Node Management`、`Session Remote`、`Review Evidence`、`active runtime`、`activation lock`、`history_gap`。

除非明确讨论 out-of-scope comparison，不要替换成 task board、terminal mirror、remote desktop、agent dashboard 或 project manager 这类泛称。

## Source docs

- `docs/prds/lyntty-product.md`
- `docs/roadmap.md`
- `docs/architecture/protocol-v0.md`
- `docs/evidence/m0-m2.md`
- `docs/recovered/previous-lyntty-decisions.md`
