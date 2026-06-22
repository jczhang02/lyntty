# PRD: Android-First Pi Session Remote Control

Issue title: Build Android-first remote control for local pi sessions
Triage label: ready-for-agent

## Problem Statement

JC wants to keep supervising real `pi` coding sessions from an Android phone while away from the desk. Today, terminal-first agent work requires the computer to be nearby for prompts, steering, approvals, aborts, diffs, tests, and recovery. Generic SSH, remote desktop, terminal mirrors, chat wrappers, and task-board products either expose too much machine surface area or hide the session/runtime truth that matters during agent work.

Lyntty should make native and headless `pi` sessions controllable from Android without turning the phone into a tiny IDE. The phone should answer: which paired node needs attention, what is the session doing, what evidence exists, and what is the safest next control action.

## Solution

Build Lyntty as a single-user, self-hosted, Android-first remote-control surface for `pi` agent sessions.

The phone is a calm cockpit: entry, supervision, approval, interruption, evidence review, and follow-up control. Real work stays on the paired node. Local files, repositories, tools, MCP servers, credentials, and canonical `pi` session JSONL remain on the computer or server running `lynttyd`.

Primary surfaces:

1. Node Management — manage paired computers and explicit QR/code pairing.
2. Global Inbox — attention-first overview across paired nodes and sessions.
3. Session Remote — main cockpit for one active session/runtime.
4. Review Evidence — diffs, tests, commands, logs, events, recovery context.
5. Settings / Recovery — relay URL, owner/device binding, revocation, diagnostics.

The first implementation should prove one robust vertical slice: pair Android with local node, continue or create a `pi` session, stream structured events, steer/follow-up/abort, show evidence, reconnect, and preserve one active runtime per session.

## User Stories

1. As JC, I want to pair my Android phone with my development computer by QR or short code, so that setup is fast and explicit.
2. As JC, I want paired nodes named like ThinkPad or Mac Studio, so that I know which computer I am controlling.
3. As JC, I want Node Management to show node health, last heartbeat, root/workspace, and trust state, so that computer status is clear.
4. As JC, I want Add Node and recovery actions always reachable, so that a long node list does not hide setup controls.
5. As JC, I want relay URL and owner token hidden after setup, so that daily UI does not feel like a debug form.
6. As JC, I want a Global Inbox sorted by attention, so that waiting or failed sessions are visible first.
7. As JC, I want waiting-input sessions to outrank idle recent sessions, so that I unblock agents quickly.
8. As JC, I want running sessions visible after needs-attention cards, so that I can check progress without hunting.
9. As JC, I want offline, stale, revoked, blocked, and history-gap states spelled out, so that recovery path is obvious.
10. As JC, I want to open a native `pi` session from Android after `/lyntty` is enabled, so that phone input reaches the same runtime as desktop input.
11. As JC, I want to create a new headless `pi` session from Android, so that I can start bounded work away from my desk.
12. As JC, I want to resume a recent `pi` session from Android, so that I do not re-explain context.
13. As JC, I want native TUI, Android, and debug tooling to control the same active runtime, so that surfaces stay in sync.
14. As JC, I want Lyntty to prevent two active runtimes from advancing one session, so that work is not duplicated or corrupted.
15. As JC, I want explicit takeover/release language, so that runtime switches are deliberate.
16. As JC, I want busy runtime takeover to require stop/wait/interrupt choice, so that I do not accidentally kill useful work.
17. As JC, I want the Session Remote header to show repo, node, runtime state, model, and connection state, so that I understand context at a glance.
18. As JC, I want a Now strip with current action, elapsed time, and last event, so that I know what the agent is doing.
19. As JC, I want token-by-token or event-by-event structured updates, so that long work feels alive.
20. As JC, I want tool calls rendered as cards, so that commands, reads, writes, edits, and results are readable on a phone.
21. As JC, I want low-level streaming updates collapsed by default, so that the event feed remains usable.
22. As JC, I want filters for events, commands, logs, diffs, tests, and errors, so that evidence inspection is quick.
23. As JC, I want raw logs available only on drill-down, so that debug detail does not dominate the daily UI.
24. As JC, I want the composer above the keyboard, so that next instructions are easy to send one-handed.
25. As JC, I want idle runtime input to send a normal prompt, so that Android behaves like native pi.
26. As JC, I want running runtime input to default to steer, so that I can redirect active work safely.
27. As JC, I want explicit follow-up input, so that I can queue next-turn context without interrupting current work.
28. As JC, I want abort/interrupt controls behind confirmation, so that I can stop bad runs without accidental taps.
29. As JC, I want common slash commands exposed through a command palette, so that mobile actions do not require memorizing commands.
30. As JC, I want local-only slash commands marked clearly, so that I know when laptop-side action is required.
31. As JC, I want native pi confirmations that cannot be answered remotely to show “needs computer-side confirmation”, so that Lyntty does not fake unsupported approvals.
32. As JC, I want remote-safe approvals or extension UI requests surfaced as cards near the composer, so that I can answer them quickly.
33. As JC, I want changed files summarized after a run, so that I can review impact from phone.
34. As JC, I want per-file diffs readable on Android, so that I can decide follow-up versus laptop review.
35. As JC, I want test results shown as summary plus expandable detail, so that pass/fail evidence is clear.
36. As JC, I want command output summarized with detail available, so that I can inspect failures without terminal mirroring.
37. As JC, I want a Review Evidence mode, so that finished work can be judged separately from live progress.
38. As JC, I want review actions like send follow-up, accept locally, open on laptop, or export evidence, so that mobile review leads to action.
39. As JC, I want no merge/push action in v0, so that Lyntty does not pretend to be a PR manager.
40. As JC, I want Android notifications when a session finishes, waits, fails, needs local confirmation, or node disconnects, so that I can leave the app.
41. As JC, I want reconnect to backfill by sequence number, so that app sleep or network loss does not drop context.
42. As JC, I want duplicate events ignored after reconnect, so that the feed does not show repeated actions.
43. As JC, I want `history_gap` shown when continuity cannot be proven, so that missing context is explicit.
44. As JC, I want owner-token login once and stored device token afterward, so that daily launch opens directly to sessions.
45. As JC, I want device revocation, so that a lost phone can be removed.
46. As JC, I want basic secret redaction before events leave the node, so that obvious tokens do not appear on relay/phone.
47. As JC, I want project/cwd roots and recent session cwd values, so that session creation targets real workspaces.
48. As JC, I want Android-created git sessions to use a temporary worktree by default, so that experiments do not dirty the main checkout unexpectedly.
49. As JC, I want dirty worktrees never auto-deleted, so that agent changes are not lost.
50. As JC, I want node capacity and queue state visible, so that blocked starts are understandable.
51. As JC, I want static HTML artifact preview when safe, so that small generated demos can be inspected on phone.
52. As JC, I want live dev-server preview through a constrained proxy, so that simple app output can be checked without remote desktop.
53. As JC, I want Android WebView previews jailed and tokenized, so that preview does not become arbitrary filesystem access.
54. As JC, I want debug web console only as development tooling, so that product scope stays Android-first.
55. As JC, I want future adapter seams for Codex/OpenCode, so that Lyntty can grow without compromising pi-first v0.
56. As JC, I want human-readable labels instead of raw IDs, so that phone supervision stays calm.
57. As JC, I want reduced-motion and large touch targets, so that the Android UI is usable one-handed.
58. As JC, I want dark/light support eventually, but state clarity first, so that design serves control not decoration.
59. As JC, I want stable test IDs, so that mobile E2E can validate real flows.
60. As JC, I want final acceptance evidence recorded in repo docs, so that agent work remains inspectable across sessions.

## Implementation Decisions

- Lyntty is Android-first for v0. A product PWA/web client is out of scope for v0; debug web remains development tooling only.
- Lyntty is pi-first for v0. Native pi extension and pi SDK runtime are first-class; Codex/OpenCode/other adapters are future seams.
- The product model is node/session/runtime/evidence, not task/backlog/project-board.
- Session is the primary domain object. A session maps to durable pi conversation/history identity, usually pi JSONL.
- Node is a paired computer or server running `lynttyd`.
- Surface is any control entry: native pi TUI, Android app, or debug web console.
- Active runtime is the process currently advancing a session. One session can have only one active runtime.
- Use relay lease + runtime heartbeat + stale state + explicit takeover to enforce activation lock.
- Multiple authenticated surfaces can control the same active runtime.
- Native pi extension connects only to local `lynttyd`; only `lynttyd` connects to relay.
- Relay and `lynttyd` are logically separate deployables. Local development may start both together.
- Relay routes events and commands, authenticates owner/device/node tokens, stores metadata/cache/queue, and does not become canonical history.
- Pi session JSONL remains canonical history.
- `lynttyd` owns node-local event cache, per-session sequence allocation, root scanning, path completion, SDK runtime start/resume, activation lock participation, capacity, worktree management, and preview proxying.
- Android uses Node Management, Global Inbox, Session Remote, Review Evidence, and Settings/Recovery as primary navigation concepts.
- Node Management must not show per-session attention, evidence, waiting states, or next-step prompts.
- Global Inbox is attention-first: needs attention, running, node status, then secondary actions.
- Session Remote uses a structured event feed, not a terminal mirror.
- Composer follows pi semantics: idle sends prompt, running sends steer by default, follow-up explicit, abort confirmed.
- Slash command support probes runtime capability; local-only commands are marked, unknown commands may be sent raw as fallback.
- Lyntty does not invent an extra approval/risk gate. It surfaces pi/runtime approvals where supported and reports computer-side confirmations where not supported.
- Full event stream is preserved with collapse/filter/search/pin behavior for mobile usability.
- Events carry `eventId`, `sessionId`, `runtimeId`, `nodeId`, `seq`, timestamp, type, source, redacted payload, and optional local-only payload reference.
- Reconnect uses last seen sequence; relay/node may redeliver; clients dedupe by sequence/event identity.
- If recovery cannot prove continuity, emit visible `history_gap` before continuing.
- Auth flow is owner token once, then persistent revocable device token in encrypted Android storage.
- Basic redaction happens before events leave node. This is self-host trusted-surface security, not zero-trust E2E.
- Notifications use FCM for Android v0; Telegram/ntfy/Discord/Web Push are out of v0 product scope.
- Diff, artifact, static HTML preview, minimal live dev-server preview, and worktree cleanup state are v0 evidence surfaces.
- Static/live previews must be jailed, read-only, tokenized, and WebView-safe with no native bridge.
- New Android-created git sessions default to worktree-if-git; dirty worktrees are never auto-deleted.
- Node capacity defaults to 3 and full capacity creates visible queue state.
- Preferred backend stack: Bun, Hono, WebSocket, SQLite WAL, JSONL, static/prepared SQL.
- Preferred Android stack: Kotlin + Jetpack Compose + Material 3, lean multi-module architecture, OkHttp, Kotlinx Serialization, Room/DataStore where needed, FCM, WebView preview, Maestro E2E.
- v0.3 dogfood exception from recovered ADR: a bounded Expo + HeroUI Native Android client may exist under `apps/client/`, but it must preserve the Kotlin app and keep UI-free behavior in `packages/client-core/`.

## Testing Decisions

- Highest-value seam: end-to-end session control through public relay/node/client protocol, asserting observable behavior rather than implementation details.
- The core acceptance test should drive Android -> relay -> `lynttyd` -> pi runtime -> event/evidence replay.
- Tests should prove one active runtime per session through activation lock, lease heartbeat, stale state, and explicit takeover behavior.
- Native pi continuation should be tested by enabling `/lyntty`, routing Android input to the same native runtime, and verifying both native and Android surfaces observe the same events.
- Headless session path should be tested through pi SDK start/resume, prompt, steer, follow-up, abort, and persisted pi JSONL history.
- Reconnect tests should cover REST backfill, WebSocket live stream, dedupe, history gap, command idempotency, and node reconnect.
- Event reducer tests should map raw events into attention state, session state, evidence summaries, collapsed feed groups, and detail drilldowns.
- Android UI tests should use stable test IDs for Node Management, Global Inbox, Session Remote, composer, next steps, events/logs/commands/diff/test details, recovery states, and settings.
- Maestro emulator flows should prove login/pairing, stored-device restore, continue latest, new session, send prompt, steer, abort, and evidence anchors.
- Physical Android should be supported and documented. If unavailable, final evidence must explicitly record emulator pass plus physical-phone not-run reason.
- Security tests should cover owner token exchange, device token refresh, device binding, revocation, node token auth, unauthenticated rejection, expired token rejection, path traversal rejection, and redaction.
- Preview tests should cover jail realpath checks, token expiry, no native bridge, WebView-safe settings, and no durable relay artifact storage.
- Worktree tests should cover git worktree creation, non-git fallback, dirty cleanup refusal, clean manual cleanup, and visible cleanup state.
- Good tests assert external behavior: messages, events, state transitions, security boundaries, UI-visible evidence, and recovery instructions.
- Prior art for testing and acceptance comes from recovered v0.1/v0.2/v0.3 gate docs: Bun checks, protocol/client-core tests, Android build, Maestro emulator, tunnel smoke, native `/lyntty` real-task smoke, `git diff --check`, and issue graph checks.

## Out of Scope

- Product PWA/web client for v0.
- iOS app for v0.
- Multi-user SaaS.
- Full cloud-hosted agent execution.
- End-to-end encryption for v0.
- Full terminal protocol or xterm mirror.
- Generic remote desktop.
- Task/backlog/issue/PR manager as primary product model.
- Merge/push/app-store/release publishing in the first implementation slice.
- Broad multi-agent support in v0.
- Discord/Telegram/ntfy bot flows.
- Arbitrary Android file editing.
- Unrestricted dev-server tunneling.
- Litter-style saved-app/widget runtime.
- Extra Lyntty-invented approval gate beyond pi/runtime semantics.
- Two active runtimes concurrently advancing the same session.

## Further Notes

- This PRD supersedes the earlier broad “web + APK multi-agent” framing. Recovered decisions from the deleted repo intentionally narrow v0 to Android-first, pi-first remote control.
- Reference products remain useful, but only selectively:
  - Claude Code Remote Control: local execution, phone as control surface, reconnect, QR-style pairing.
  - MindFS: structured tool/event cards and agent gateway ideas.
  - Litter: native mobile control and pairing patterns.
- Lyntty should borrow remote-control and mobile supervision patterns, not become a terminal mirror, generic web client, or multi-agent theater.
- Recovered source summary lives in `docs/recovered/previous-lyntty-decisions.md`.
- Suggested first milestone: scaffold relay + `lynttyd` + pi extension stub + Android shell; prove pair/login, native `/lyntty` session registration, Android prompt/steer, structured event feed, activation lock, reconnect, and evidence summary.
