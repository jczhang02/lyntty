# Product Context

Status: current

## Scope

Lyntty is an Android-first, self-hosted remote-control surface for local `pi` sessions. The phone supervises and controls work; the paired node keeps canonical files, credentials, tools, MCP servers, and Pi JSONL history.

Lyntty is not a terminal mirror, generic remote desktop, task board, PR manager, or multi-user SaaS product.

## Core domain objects

- **Node** — paired computer or server running `lynttyd`.
- **Session** — durable `pi` conversation/history identity backed by canonical Pi JSONL.
- **Runtime** — process currently advancing a session.
- **Active runtime** — the one runtime allowed to advance a session.
- **Relay** — routes encrypted events and commands and stores metadata, caches, and queues; it is not canonical history.
- **`lynttyd`** — node-local authority for discovery, event sequencing, shared-control delivery, SDK runtime ownership, activation locks, and recovery.
- **Pi extension** — local in-process control inlet for an ordinary computer-running Pi session. It communicates only with local `lynttyd`.
- **Operator control client** — `lyntty remote`, which may connect directly to the relay for explicit operator commands but is not a node runtime or phone-to-Pi bridge.

## Product surfaces

- **Sessions Home** — daily entry for active and historical sessions.
- **Session Remote** — control one session through messages, live thinking/tool activity, results, errors, changed-file context, and explicit stop or follow-up actions. Debug/service/evidence panels are not replacement product pages.
- **Node Management** — pairing, trust, machine health, and supported node actions.
- **Settings** — relay configuration, owner/device binding, revocation, and recovery entry points.

## Runtime path

Ordinary computer-running Pi sessions use shared control:

```text
phone -> relay -> lynttyd -> local Pi extension -> pi
```

Lyntty-owned headless or explicitly resumed sessions use the Pi SDK through `lynttyd`. The Pi extension never connects to the relay. `lyntty remote` is a separate operator control-plane client and does not change the ordinary phone-to-Pi path.

## Invariants

- Real work stays on the paired node.
- Pi JSONL remains canonical history.
- One Pi session has only one `active runtime`; takeover is explicit.
- One `machineId + piSessionId` maps to one active relay session.
- Reconnect uses deterministic ordering, idempotency, and progressive canonical replay.
- If continuity cannot be proven, show `history_gap`.
- Ordinary computer-side sends queue or fail with visible remediation when the Pi extension is missing or stale; they never disappear or silently start a duplicate runtime.
- Dirty worktrees are never auto-deleted.
- Lyntty surfaces only approvals supported by Pi/runtime; it does not invent a separate approval gate.

## Preferred vocabulary

Use these terms exactly: `pi`, `lynttyd`, `relay`, `Sessions Home`, `Node Management`, `Session Remote`, `active runtime`, `activation lock`, and `history_gap`.

Avoid generic replacements such as task board, terminal mirror, remote desktop, agent dashboard, or project manager except in explicit out-of-scope comparisons.

## Current supporting docs

- `docs/prds/lyntty-product.md`
- `docs/architecture/pi-shared-control.md`
- `docs/release/android-apk.md`
- `docs/quality/ci.md`
