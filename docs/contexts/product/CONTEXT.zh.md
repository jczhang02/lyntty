# Product Context

状态：当前有效

## 范围

Lyntty 是 Android-first、self-hosted 的本地 `pi` session remote-control surface。手机负责监督和控制工作；paired node 保存 canonical files、credentials、tools、MCP servers 与 Pi JSONL history。

Lyntty 不是 terminal mirror、generic remote desktop、task board、PR manager 或 multi-user SaaS product。

## 核心 domain objects

- **Node** — 运行 `lynttyd` 的 paired computer 或 server。
- **Session** — 由 canonical Pi JSONL 支撑的 durable `pi` conversation/history identity。
- **Runtime** — 当前推进 session 的 process。
- **Active runtime** — 唯一允许推进某个 session 的 runtime。
- **Relay** — 路由 encrypted events/commands，并保存 metadata、cache 和 queue；它不是 canonical history。
- **`lynttyd`** — 负责 discovery、event sequencing、shared-control delivery、SDK runtime ownership、activation lock 与 recovery 的 node-local authority。
- **Pi extension** — ordinary computer-running Pi session 的本机 in-process control inlet，只与本机 `lynttyd` 通信。
- **Operator control client** — `lyntty remote` 可以为显式 operator command 直接连接 relay，但它不是 node runtime 或 phone-to-Pi bridge。

## Product surfaces

- **Sessions Home** — active 与 historical sessions 的日常入口。
- **Session Remote** — 通过 messages、live thinking/tool activity、results、errors、changed-file context 和显式 stop/follow-up actions 控制一个 session。Debug/service/evidence panels 不能替代产品主页面。
- **Node Management** — pairing、trust、machine health 和受支持的 node actions。
- **Settings** — relay configuration、owner/device binding、revocation 和 recovery 入口。

## Runtime path

普通电脑端 Pi session 使用 shared control：

```text
phone -> relay -> lynttyd -> local Pi extension -> pi
```

Lyntty-owned headless session 或显式 resumed session 通过 `lynttyd` 使用 Pi SDK。Pi extension 永远不连接 relay。`lyntty remote` 是独立 operator control-plane client，不改变普通 phone-to-Pi path。

## Invariants

- Real work 留在 paired node。
- Pi JSONL 保持 canonical history。
- 一个 Pi session 只有一个 `active runtime`；takeover 必须 explicit。
- 一个 `machineId + piSessionId` 映射到一个 active relay session。
- Reconnect 使用 deterministic ordering、idempotency 和 progressive canonical replay。
- 无法证明 continuity 时显示 `history_gap`。
- Pi extension 缺失或 stale 时，普通电脑端 send 必须 queue 或以可见 remediation 失败；不能静默丢失，也不能静默启动 duplicate runtime。
- Dirty worktrees 永不自动删除。
- Lyntty 只呈现 Pi/runtime 已支持的 approval，不发明额外 approval gate。

## Preferred vocabulary

精确使用：`pi`、`lynttyd`、`relay`、`Sessions Home`、`Node Management`、`Session Remote`、`active runtime`、`activation lock`、`history_gap`。

除非明确讨论 out-of-scope comparison，不要使用 task board、terminal mirror、remote desktop、agent dashboard 或 project manager 等泛称替代。

## 当前 supporting docs

- `docs/prds/lyntty-product.md`
- `docs/architecture/pi-shared-control.md`
- `docs/release/android-apk.md`
- `docs/quality/ci.md`
