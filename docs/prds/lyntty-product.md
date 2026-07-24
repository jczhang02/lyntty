# Lyntty: Android control layer for the `pi` coding agent

Status: current product requirements

Product frame: Lyntty is the Android control layer for the `pi` coding agent, similar to what Claude Code Remote is for Claude Code.

Runtime path: the Android app connects through `relay` to the local computer/node running `lynttyd`; that node's `active runtime` advances the `pi` session. Repositories, tools, MCP servers, credentials, and canonical `pi` session JSONL stay on the node. Android does not hold the workspace or execute code.

## Problem Statement

When the user leaves the computer, they still need to control the local computer/node `pi` session from Android: add requirements, check progress, confirm sensitive actions, stop wrong runs, inspect changes and run results, and recover context after app sleep, network loss, or node reconnect.

Today those actions usually pull the user back to the desk or force a fallback to SSH, remote desktop, a terminal mirror, or another chat wrapper. SSH and remote desktop expose too much machine surface area; terminal mirrors are unreadable on a phone; ordinary chat wrappers cannot show the real session/runtime state, activation lock, changed files, test/check results, errors, artifacts/previews, or `history_gap`.

## Solution

Lyntty is a single-user, self-hosted, Android-first control layer for the `pi` coding agent. It is not remote desktop, a phone IDE, terminal mirror, task board, or PR manager. The phone only controls work: send requests, read replies, confirm actions, ask follow-ups, interrupt, or stop a task. Real operations happen on the node.

Core use path:

1. `Sessions Home`: daily entry for needs attention, running, recent, failed, and completed sessions.
2. `Session Remote`: main control page, shaped like a phone chat. The user sends requests to `pi`, reads replies, confirms actions, asks follow-ups, interrupts or stops tasks, and sees messages, tool activity, changed-file context, run results, errors, and next steps in one timeline. It does not introduce a separate evidence/debug replacement page. Current scope does not include merge, push, or PR approval.
3. `Node Management`: manage paired computers, pairing, trust, heartbeat, roots, and diagnostics.
4. `Settings / Recovery`: manage `relay` URL, owner/device binding, revocation, diagnostics, and recovery entry points.

The established minimum acceptance path pairs Android with a local node, continues or creates a `pi` session, shows live progress, sends new requests and follow-up context, redirects or stops active work, presents results, reconnects, and preserves one active runtime per session. Future product changes must keep this vertical slice working.

## User Stories

### 1. Pair Android with a node

The user opens the app for the first time and pairs the Android device with a node running `lynttyd` by QR or short code.

Acceptance:

- `Node Management` shows node name, health, last heartbeat, roots/workspace, and trust state.
- Add Node and recovery actions always stay reachable.
- relay URL and owner token are hidden after setup; daily UI does not look like a debug form.
- owner token is used only for first login; later launches use a revocable device token.

### 2. Continue or create a `pi` session from phone

The user finds waiting, running, failed, and recent sessions in `Sessions Home`, then continues an existing session or creates a headless `pi` session.

Acceptance:

- waiting sessions outrank ordinary recent sessions; running sessions stay near the top.
- ordinary computer-running `pi` sessions, Android-created headless sessions, and recent session resumes all use the same session/runtime model.
- Android-created sessions use the selected working directory by default; creating a temporary git worktree is an explicit user choice. Dirty worktrees are never auto-deleted.
- Current product scope does not provide merge, push, or PR approval.

### 3. Supervise an active session

The user enters `Session Remote` and sees repo, node, runtime state, model, connection state, current action, elapsed time, and last event.

Acceptance:

- Android app, native pi TUI, and debug tooling (development only) observe the same active runtime.
- A session can have only one active runtime; runtime switch uses explicit takeover/release.
- busy runtime takeover requires stop/wait/interrupt choice.
- token-by-token or event-by-event updates are visible; low-level events are collapsed by default and can be filtered by progress, commands, logs, changes, checks, and errors.

### 4. Send input, add context, interrupt, and stop

The user sends a new request from the phone; during a run they can queue next-turn context, explicitly redirect active work, or stop the task.

Acceptance:

- input box stays above the keyboard and works one-handed.
- idle input sends a new request; running input defaults to queued next-turn context.
- redirecting active work and stopping a task are explicit actions and require confirmation.
- common slash commands are exposed through a command palette; local-only slash commands are clearly marked.

### 5. Handle confirmations and constrained actions

The user answers confirmations that can be handled from phone; native `pi` confirmations that cannot be answered remotely clearly send the user back to the computer.

Acceptance:

- Lyntty does not invent an extra confirmation/risk gate.
- It only surfaces confirmation requests already supported by pi/runtime.
- Unsupported remote confirmations show “needs computer-side confirmation”.
- phone-answerable confirmations or extension UI requests appear near the input box.

### 6. Inspect what `pi` did

The user inspects changed-file context, test/check results, command summaries, errors, artifacts, recovery state, and next actions directly in the `Session Remote` timeline.

Acceptance:

- command output is summarized first, with details expandable.
- per-file changes are readable on Android.
- test/check results show summary plus expandable detail.
- next actions include ask follow-up, ask `pi` to add tests or fix issues, open workspace on computer, and export evidence; they do not include merge, push, or PR approval.

### 7. Reconnect and recover

After app sleep, network loss, or node reconnect, the user returns to the app and recovers session context.

Acceptance:

- reconnect backfills by sequence number.
- duplicate events are ignored.
- if continuity cannot be proven, `history_gap` is shown.
- offline, stale, revoked, and blocked states have clear recovery paths.

### 8. Preview safely and receive notifications

The user receives session state notifications and previews small results inside safety boundaries.

Acceptance:

- Android notifications are sent when a session finishes, waits, fails, needs local confirmation, or node disconnects.
- basic secret redaction happens before events leave the node.
- static HTML artifact and constrained live dev-server preview are jailed, read-only, tokenized, WebView-safe, and have no native bridge.
- debug web console is development tooling only, not a product web client.

## Implementation Decisions

- Lyntty is Android-first. A product PWA/web client is not part of the current product direction; debug web remains development tooling only.
- Lyntty is pi-first. Native pi extension and pi SDK runtime are first-class; current scope supports only `pi` runtime.
- The product model is node/session/runtime/evidence, not task/backlog/project-board.
- Session is the main domain object. A session maps to durable pi conversation/history identity, usually `pi` JSONL.
- node is a paired computer or server running `lynttyd`.
- Product surfaces are Android app and native pi TUI integration. `debug web console` is a development surface for protocol debugging and E2E assistance, not a product web client.
- active runtime is the process currently advancing a session. One session can have only one active runtime.
- Use `relay` lease, runtime heartbeat, stale state, and explicit takeover to enforce activation lock.
- Multiple authenticated surfaces can control the same active runtime.
- Native Pi extension connects only to local `lynttyd`. `lynttyd` is the only node-side session bridge to `relay`; the separate operator-facing `lyntty remote` control-plane client may connect directly for explicit CLI commands.
- `relay` and `lynttyd` are logically separate deployables. Local development may start both together.
- `relay` routes events and commands, authenticates owner/device/node tokens, stores metadata/cache/queue, and does not become canonical history.
- `pi` session JSONL remains canonical history.
- `lynttyd` owns node-local event cache, per-session sequence allocation, root scanning, path completion, SDK runtime start/resume, activation lock participation, capacity, worktree management, and preview proxying.
- Android product navigation is centered on `Sessions Home`, `Session Remote`, `Node Management`, and Settings/recovery entry points. Debug, service, diagnostics, and evidence pages do not replace these product surfaces.
- `Sessions Home` is the daily entry. It shows sessions by useful state: needs attention, running, recent, completed/error.
- `Node Management` is for paired computers, pairing, trust, heartbeat, roots, and diagnostics. It must not become the daily session inbox.
- `Session Remote` uses a structured event feed, not a terminal mirror; it can look like chat, but must expose runtime state and evidence anchors.
- input box follows pi semantics: idle sends a new request; running defaults to queued next-turn context; redirecting active work is explicit; stop is confirmed.
- Remote commands use the strict supported Pi-command contract. Local-only commands stay computer-side, and unknown or unsupported commands are rejected rather than sent raw.
- Lyntty does not invent extra confirmation/risk gates. It surfaces pi/runtime confirmation requests where supported and reports computer-side confirmations where not supported.
- The full event stream is preserved with collapse/filter/search/pin behavior for mobile usability.
- Events carry `eventId`, `sessionId`, `runtimeId`, `nodeId`, `seq`, timestamp, type, source, redacted payload, and optional local-only payload reference.
- Reconnect uses last seen sequence; `relay`/node may redeliver; clients dedupe by sequence/event identity.
- If recovery cannot prove continuity, emit visible `history_gap` before continuing.
- Auth flow is owner token once, then persistent revocable device token in encrypted Android storage.
- Basic redaction happens before events leave node. This is self-host trusted-surface security, not zero-trust E2E.
- Notifications use FCM for Android. Telegram, ntfy, Discord, and Web Push are not part of current product scope.
- `Session Remote` must present messages, tool activity, changed-file context, test/check results, command summaries, errors, recovery state, and next actions without becoming a PR manager or debug console.
- File changes and supported artifact/preview metadata remain session content; service diagnostics and durable acceptance evidence stay in logs, developer tooling, or `docs/evidence/`.
- Static/live previews must be jailed, read-only, tokenized, and WebView-safe with no native bridge.
- Android-created sessions default to the selected working directory; temporary git worktrees are explicit opt-in, and dirty worktrees are never auto-deleted.
- Node capacity defaults to 3 and full capacity creates visible queue state.
- Current backend stack: Bun, Fastify, Socket.IO, Prisma, PGlite by default with explicit PostgreSQL support, and canonical Pi JSONL on the node.
- Current Android stack: React Native + Expo + TypeScript, Expo Router, Zustand, MMKV, Expo SecureStore, Expo Notifications/FCM, WebView preview, and Maestro E2E.
- `packages/lyntty-app/` is the Android app workspace and owns mobile presentation, sync reducers, local storage, and Maestro selectors.
- `packages/lyntty-wire/` owns shared session-protocol schemas and capabilities. App and CLI state transitions must consume those contracts rather than invent incompatible wire semantics.

## Testing Decisions

- Highest-value seam: end-to-end session control through public relay/node/client protocol, asserting observable behavior rather than implementation details.
- The core acceptance test should drive Android -> relay -> `lynttyd` -> pi runtime -> event/evidence replay.
- Tests should prove one active runtime per session through activation lock, lease heartbeat, stale state, and explicit takeover behavior.
- Native pi continuation should be tested with the Lyntty Pi extension active, routing Android input to the same native runtime, and verifying both native and Android surfaces observe the same events.
- Headless session path should be tested through pi SDK start/resume, sending new requests, redirecting active work, adding follow-up context, stopping runs, and persisted pi JSONL history.
- Reconnect tests should cover REST backfill, WebSocket live stream, dedupe, `history_gap`, command idempotency, and node reconnect.
- Event reducer tests should map raw events into session state, collapsed timeline groups, result details, and recovery state.
- Android UI tests should use stable test IDs for Sessions Home, Node Management, Session Remote, input box, next steps, events/logs/commands/change/test details, recovery states, and settings.
- Maestro emulator flows should prove login/pairing, stored-device restore, continue latest, new session, send new request, redirect active work, stop run, and evidence anchors.
- Physical Android should be supported and documented. If unavailable, final evidence must explicitly record emulator pass plus physical-phone not-run reason.
- Security tests should cover owner token exchange, device token refresh, device binding, revocation, node token auth, unauthenticated rejection, expired token rejection, path traversal rejection, and redaction.
- Preview tests should cover jail realpath checks, token expiry, no native bridge, WebView-safe settings, and no durable relay artifact storage.
- Worktree tests should cover git worktree creation, non-git fallback, dirty cleanup refusal, clean manual cleanup, and visible cleanup state.
- Good tests assert external behavior: messages, events, state transitions, security boundaries, UI-visible evidence, and recovery instructions.
- Prior art for testing and acceptance comes from recovered gate docs: Bun checks, protocol/client-core tests, Android build, Maestro emulator, tunnel smoke, the legacy native `/lyntty` real-task smoke, `git diff --check`, and issue graph checks.

## Out of Scope

- Product PWA/web client.
- iOS app.
- Multi-user SaaS.
- Full cloud-hosted agent execution.
- Full end-to-end encryption.
- Full terminal protocol or xterm mirror.
- Generic remote desktop.
- Task/backlog/issue/PR manager as primary product model.
- Merge, push, or app-store publishing in current product scope.
- Broad multi-agent support.
- Discord/Telegram/ntfy bot flows.
- Arbitrary Android file editing.
- Unrestricted dev-server tunneling.
- Litter-style saved-app/widget runtime.
- Extra Lyntty-invented confirmation gate beyond pi/runtime semantics.
- Two active runtime processes concurrently advancing the same session.

## Further Notes

- This PRD supersedes the earlier broad “web + APK multi-agent” framing. Recovered decisions from the deleted repo intentionally narrow the product to Android-first, pi-first remote control.
- Reference products remain useful, but only selectively:
  - Claude Code Remote: local execution, phone as control surface, reconnect, QR-style pairing.
  - MindFS: structured tool/event cards and agent gateway ideas.
  - Litter: native mobile control and pairing patterns.
- Lyntty may borrow mobile supervision and remote-control patterns, but it does not become a terminal mirror, generic web client, or broad multi-agent product.
- `packages/lyntty-wire/` may preserve protocol extensibility, but current product, UI, release, and acceptance support only `pi`; Codex/OpenCode adapters are not a current product seam.
- Recovered source summary lives in `docs/recovered/previous-lyntty-decisions.md`.
- Current implementation and acceptance status live in the accepted architecture, package tests, release runbooks, and latest matching evidence rather than in the completed scaffold milestones.
