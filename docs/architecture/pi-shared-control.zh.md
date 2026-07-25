# Pi shared-control 架构

状态：当前实现的中文同步摘要

> 完整 normative contract 见英文版 [`pi-shared-control.md`](./pi-shared-control.md)。本文件同步现行 topology、ownership 和 recovery 边界，不替代英文版中的协议字段与逐事件规则。

## 目标

普通电脑端 `pi` session 继续在原来的 Pi process、cwd、model/provider、tool 和 MCP 环境中运行。Android App 只通过 Lyntty 控制同一个 session，不启动第二个 runtime，也不把 Pi JSONL 复制成新的 canonical history。

## 普通控制路径

```text
phone -> relay -> lynttyd -> local Pi extension -> pi
```

- Pi extension 只连接本机 `lynttyd`，不直接连接公共网络或 `relay`。
- 只有 `lynttyd` 负责 node-side session bridge、event ordering、shared-control delivery、activation lock 和 recovery。
- `lyntty remote` 是显式 operator control-plane client，可以直接连接 `relay`，但不能成为 node runtime 或 phone-to-Pi bridge。

## Active runtime

一个 Pi session 同时只能有一个 `active runtime`。Takeover 必须显式执行。手机发送消息时，如果普通电脑端 Pi extension 缺失或 stale，系统需要排队或返回 `Waiting for Pi extension` 等可见 remediation。输入不能静默丢失，也不能启动 duplicate runtime。

Lyntty 管理的 headless session 可以由 `lynttyd` 通过 Pi SDK 运行。普通电脑端 Pi session 仍由本地 Pi extension 接收 shared-control 命令。这两个入口共享 session identity 和 display semantics，但 runtime ownership 不得重叠。

## History 与 ordering

Pi JSONL 保持 canonical。`relay` 保存加密 sync state、metadata、queue、cache，以及认证、ordering、presence 和 push routing 所需的 operational data。`relay` 还会持久化 command intent 与 sequence，但不是 canonical Pi history store。

Event envelope 需要保持 stable id、visible agent event 的 turn id、deterministic ordering 和 relay `localId` idempotency。Reconnect 使用 progressive replay，不应等待完整 JSONL import 才打开 `Session Remote`。无法证明 history 连续性时显示 `history_gap`。

Live Pi SDK event 与 Pi JSONL replay 使用相同的 display semantics，包括 thinking、tool call/result、final text 和 error。

## 控制动作

- 普通 user message 通过 Pi extension 调用 `pi.sendUserMessage()`。
- Steering、follow-up、interrupt 和 stop 必须作用于当前 `active runtime`。
- `invoke_pi_command` 只允许受支持的 Pi command，并保留 command intent 与结果。
- 不允许 unknown-command raw fallback。
- Lyntty 不创建 Pi/runtime 本身不支持的额外 approval gate。

## Recovery

`relay` message layer 持久化 durable command intent 与 sequence。`lynttyd` 负责本地交付 policy、per-session queue、session mapping、extension state，并把 delivery state 更新回 `relay`。Reconnect 后需要合并 live event 与 canonical replay，并根据 stable id、turn id 和 `localId` 去重。

Dirty worktree 不得自动删除。缺失节点、extension 或 runtime 时，App 显示可操作的用户状态，不使用 debug/evidence 页面替代 `Sessions Home`、`Node Management` 或 `Session Remote`。

## 实现证据

当前 shared-control 基线记录在：

- `docs/evidence/r50-pi-shared-control.md`
- `docs/evidence/r57-current-pi-live-sync.md`
- `docs/evidence/r57-mobile-send-echo-merge.md`

这些文件证明对应 revision 的观测结果。当前 policy 仍以根/嵌套 `AGENTS.md`、product context、英文 architecture、代码与测试为准。
