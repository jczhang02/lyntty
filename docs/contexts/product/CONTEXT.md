# Product Context

## Scope

Lyntty is an Android-first, self-hosted remote-control surface for local `pi` agent sessions. The phone supervises and controls work; the paired node keeps canonical files, credentials, tools, MCP servers, and `pi` session history.

Lyntty is not a terminal mirror, generic remote desktop, task board, PR manager, or multi-user SaaS product.

## Core domain objects

- **Node** — paired computer or server running `lynttyd`.
- **Session** — durable `pi` conversation/history identity, usually backed by canonical `pi` JSONL.
- **Runtime** — process currently advancing a session.
- **Active runtime** — the one runtime allowed to advance a session.
- **Surface** — product control entry, primarily Android app and native pi TUI integration. `debug web console` is development tooling only.
- **Relay** — routes events and commands, authenticates tokens, stores metadata/cache/queue, but is not canonical history.
- **`lynttyd`** — node-local daemon that owns event cache, sequence allocation, root scanning, SDK runtime start/resume, activation lock participation, capacity, worktree management, and preview proxying.
- **Evidence** — diffs, tests, commands, logs, events, artifacts, previews, and recovery context used to judge session work.

## Product surfaces

- **Sessions Home** — daily entry for needs attention, running, recent, failed, and completed sessions.
- **Session Remote** — main control page for one active session/runtime.
  - **Review Evidence** — mode/panel inside `Session Remote` for judging finished or in-progress work from evidence. It is not standalone main navigation and not PR review.
- **Node Management / Pairing** — paired computers, QR/code pairing, health, trust, heartbeat, roots, and diagnostics.
- **Settings / Recovery** — relay URL, owner/device binding, revocation, diagnostics, and recovery entry points.

## Invariants

- Real work stays on the paired node.
- `pi` session JSONL remains canonical history.
- One session can have only one active runtime.
- Multiple authenticated surfaces may control the same active runtime.
- Runtime takeover must be explicit.
- Busy runtime takeover requires stop, wait, or interrupt choice.
- Reconnect uses sequence backfill and dedupes repeated events.
- If continuity cannot be proven, show `history_gap`.
- Android-created git sessions default to temporary worktree when possible.
- Dirty worktrees are never auto-deleted.
- Lyntty surfaces supported `pi`/runtime approvals; it does not invent a separate approval gate.

## Preferred vocabulary

Use these terms exactly: `pi`, `lynttyd`, `relay`, `Sessions Home`, `Node Management`, `Session Remote`, `Review Evidence`, `active runtime`, `activation lock`, `history_gap`.

Avoid replacing them with generic terms like task board, terminal mirror, remote desktop, agent dashboard, or project manager unless explicitly discussing out-of-scope comparisons.

## Source docs

- `docs/prds/lyntty-product.md`
- `docs/roadmap.md`
- `docs/architecture/protocol-v0.md`
- `docs/evidence/m0-m2.md`
- `docs/recovered/previous-lyntty-decisions.md`
