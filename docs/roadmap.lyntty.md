# Imported historical Lyntty scaffold roadmap

Status: preserved pre-import snapshot from 2026-06-30. Its scaffold workspaces, milestones, and UI proposals are superseded and must not be used as current policy or implementation status.

Current authority: `AGENTS.md`, `docs/contexts/product/CONTEXT.md`, and `docs/architecture/pi-shared-control.md`. The original roadmap body remains below for migration provenance.

## Roadmap principles

- Prove vertical slices before expanding pages or edge capabilities.
- Every milestone must leave verifiable evidence: protocol tests, Android build/UI test, manual smoke, or explicit not-run reason.
- Android-first, pi-first. Product web client, iOS, multi-user SaaS, PR manager, and terminal mirror stay out of current scope.
- `Review Evidence` is a mode/panel inside `Session Remote`, not standalone main navigation.
- Real work stays on the node; the Android app only controls the `pi` session through command path Android / `client-core` -> `relay` -> `lynttyd` -> `active runtime`. Events return through `active runtime` -> `lynttyd` -> `relay` -> Android / `client-core`.

## Milestones

### M0 — Repo scaffold + protocol contracts

Goal: establish the minimum code structure and cross-surface protocol skeleton so later work builds against one contract without freezing unknown runtime details too early.

Scope:

- scaffold `relay`, `lynttyd`, pi extension stub, and Expo/React Native Android shell.
- define shared protocol v0 skeleton: session, node, runtime, event envelope, command envelope, auth token, error, and sequence envelope.
- define extension points for confirmation, evidence, artifact, and preview fields; fill them from real behavior in M3/M5/M6 and bump contract version on breaking changes.
- create `packages/client-core/` for session reducer, event grouping, reconnect/dedupe, Review Evidence summary, recovery state mapping, and command state machine.
- create minimum test harness: public relay/node/client protocol tests + `git diff --check`.

Exit criteria:

- repo can install dependencies, build base packages, and run minimum protocol tests.
- mock node can send ordered events through `relay`; client-core can produce session state.
- docs record contract versioning, breaking-change rules, and test command.
- Android build passes for the shell; if unavailable, evidence records the not-run reason.

Non-goals: real `pi` runtime, full Android UI, notifications, previews.

Dependencies: none.

### M1 — Pairing, auth, and node presence

Goal: Android can safely bind to a node running `lynttyd` and see whether the node is available.

Scope:

- owner token -> device token flow, encrypted device token storage, revocation path.
- node token auth, node heartbeat, stale/offline/revoked states.
- QR/short-code pairing flow.
- minimum `Node Management` page: node name, health, last heartbeat, roots/workspace, trust state, diagnostics.

Exit criteria:

- Android app can pair with a local node and restore with stored device token after restart.
- revoked device cannot keep access.
- node offline/stale state is visible in UI and protocol state.
- security tests cover unauthenticated, expired token, and revoked token.
- Android build passes; pairing/restore has Maestro or emulator smoke evidence, or an explicit not-run reason.

Non-goals: session control, `pi` execution, Review Evidence.

Dependencies: M0.

### M2 — Session registry + activation lock

Goal: establish session/runtime model, prove the real runtime can register early, and ensure one session can have only one `active runtime`.

Scope:

- session registry: native `/lyntty` session registration, recent session resume, headless session creation metadata.
- runtime adapter contract for native `/lyntty` and headless `pi` SDK paths; mocks may support tests, but evidence must distinguish mock results from real runtime results.
- real native `/lyntty` registration smoke: session exposes `sessionId`, `runtimeId`, runtime heartbeat, and lease state through `lynttyd`.
- headless `pi` SDK start/resume capability probe; it may avoid a full task run, but cannot be only a mock type.
- `active runtime` heartbeat, lease, stale state, explicit takeover/release.
- busy takeover UX contract: stop/wait/interrupt.
- node capacity, default 3, and queue state.
- worktree policy contract: Android-created git sessions must use temporary worktree by default; dirty worktrees must never be auto-deleted.

Exit criteria:

- native pi TUI and Android app can observe the same session/runtime state; debug tooling is only for development verification, not product navigation or daily session control.
- real native `/lyntty` session registration smoke passes and records runtime identity, heartbeat, and lease state.
- headless `pi` SDK start/resume probe result is recorded separately from mock runtime tests.
- tests prove activation lock prevents two active runtimes from advancing one session.
- busy runtime takeover requires explicit stop/wait/interrupt choice.
- capacity full creates visible queue state.
- Android build passes; any user-visible takeover/queue UI has Maestro/emulator smoke evidence or an explicit not-run reason.

Non-goals: full live event feed, Review Evidence, previews.

Dependencies: M0, M1.

### M3 — Session Remote live control

Goal: `Session Remote` becomes the phone's main control page for supervising and controlling one real `pi` session in real time.

Internal slices:

- M3a — real runtime command/event loop: Android / `client-core` -> `relay` -> `lynttyd` -> real `pi` runtime, then runtime events back to Android. No full feed polish or slash palette.
- M3b — `Session Remote` mobile control UX: header/state strip, structured feed cards, collapse/filter/search, idle/running input semantics, stop/interrupt confirmation.
- M3c — runtime capabilities and confirmations: supported confirmations, unsupported computer-side confirmation, declared slash commands, local-only marking, raw text fallback boundary.

Scope:

- structured event feed: progress, commands, logs, file changes, checks, errors, artifact metadata.
- header/state strip: repo, node, runtime state, model, connection state, current action, elapsed time, last event.
- input semantics: idle sends new request; running defaults to queued next-turn context; redirect active work must be explicit; stop requires confirmation.
- confirmation handling: surface only pi/runtime-supported confirmations; show “needs computer-side confirmation” when unsupported.
- minimum slash command support: only handle slash commands declared supported by the `pi` runtime. local-only commands are shown as computer-side only. Android does not execute shell and does not provide terminal passthrough. unknown slash input may be sent as raw text to `pi` runtime only with unsupported/unverified capability UI.
- `lynttyd` performs basic redaction before events leave node. Redaction is self-host trusted-surface security, not zero-trust E2E.

Exit criteria:

- Android can send a new request, add follow-up context, explicitly redirect active work, and stop a task on the same `active runtime`.
- at least one smoke proves both paths work:
  - command path: Android / `client-core` -> `relay` -> `lynttyd` -> real native `/lyntty` session or headless `pi` SDK runtime.
  - event path: `active runtime` -> `lynttyd` -> `relay` -> Android / `client-core`.
- Mock runtime may support automated tests but cannot satisfy M3 completion.
- Structured events cover at least progress, commands, logs, file changes, checks, errors, and artifact metadata. M3 does not require full `Review Evidence` summary UI, but the event model must support the M5 evidence reducer.
- `relay` may cache and forward events, but does not become canonical history; events must originate from node-local runtime/cache through `lynttyd`.
- tests prove command/log/error events are basically redacted before leaving node; raw local-only payload does not enter `relay` or Android, only optional local-only payload references.
- event feed is not a terminal mirror; low-level events are collapsed by default and can be filtered, expanded, and searched.
- confirmations appear near the input box; unsupported confirmations show “needs computer-side confirmation” and do not pretend to work.
- Maestro covers pairing -> session -> live control basic flow.
- Android build passes; UI smoke evidence or explicit not-run reason is recorded.

Non-goals: full reconnect hardening, complete Review Evidence summary UI, notifications, previews, terminal passthrough.

Dependencies: M2.

### M4 — Reconnect, ordering, and `history_gap`

Goal: after app sleep, network loss, or node reconnect, the user can recover context; if continuity cannot be proven, Lyntty shows `history_gap`.

Scope:

- per-session sequence allocation.
- REST backfill + WebSocket live stream.
- Backfill authority comes from `lynttyd` node-local event cache / records derived from `pi` session history. `relay` may provide non-authoritative cache and redelivery buffer, but cannot become canonical session history.
- client dedupe by sequence/event identity.
- command idempotency.
- node reconnect, relay/node redelivery.
- visible recovery states: offline, stale, revoked, blocked, `history_gap`.

Exit criteria:

- tests cover app sleep, WebSocket reconnect, node reconnect, duplicate redelivery, out-of-order protection, and command idempotency.
- tests prove relay cache loss does not break canonical recovery when node-local cache/history can prove continuity.
- if node-local cache/history cannot prove continuity, Lyntty must emit visible `history_gap` before continuing.
- UI gives recovery paths and never pretends a broken timeline is continuous.
- Android build passes; recovery UI has Maestro/emulator smoke evidence or an explicit not-run reason.

Non-goals: new product surfaces, cloud canonical history, zero-trust E2E.

Dependencies: M3.

### M5 — Review Evidence

Goal: provide a review mode inside `Session Remote` so the user can judge what `pi` did, whether results have evidence, and what to do next.

Scope:

- `Review Evidence` consumes M3/M4 structured events, sequence/backfill, and recovery state. It does not invent a separate data model.
- changed files, diff summary, test/check results, command summary, errors, event timeline, artifact metadata, preview anchors, recovery state, next actions.
- command output summary + expandable detail.
- per-file changes readable on Android.
- artifact metadata and preview anchors only indicate that a previewable artifact exists. M5 may show filename, type, path summary, generating command, and open-on-computer action.
- M5 does not render artifacts in Android WebView and does not open live dev-server preview.
- next actions: ask follow-up, ask `pi` to add tests or fix issues, open workspace on computer, export evidence.
- evidence summary reducer lives in `packages/client-core/`; UI does not directly implement protocol semantics.

Exit criteria:

- `Review Evidence` is available when a session finishes, fails, waits for confirmation, or the user opens it.
- no merge, push, PR approval, WebView artifact rendering, or live dev-server preview is provided.
- tests cover evidence reducer, UI anchors, error/test/detail drilldown, recovery state mapping, and next actions.
- final acceptance evidence records commands, results, and not-run reasons.
- Android build passes; evidence UI has Maestro/emulator smoke evidence or an explicit not-run reason.

Non-goals: standalone Review Evidence main navigation, PR manager, mobile code editor, hardened jailed/WebView preview implementation.

Dependencies: M3, M4.

### M6 — Notifications, previews, and Android hardening

Goal: turn the core loop into a daily-usable Android experience with safe previews and notifications.

Scope:

- Android notifications: session finished, waits, fails, needs local confirmation, node disconnects.
- upgrade M5 preview anchors into interactive preview only after safety checks pass.
- static HTML artifact preview.
- constrained live dev-server preview through jailed/read-only/tokenized proxy.
- WebView-safe settings with no native bridge.
- mobile polish: large touch targets, reduced motion, clear state labels, stable test IDs.
- physical Android smoke where available; if unavailable, record emulator pass + physical-phone not-run reason.

Exit criteria:

- preview security tests cover jail realpath, token expiry, path traversal rejection, read-only enforcement, and no native bridge.
- no preview opens unless tokenized, jailed, read-only, and WebView-safe checks pass.
- notifications have reviewable evidence on Android emulator or physical device.
- Maestro covers lyntty path, failure path, recovery path, and evidence anchors.
- final docs update issue evidence and known limitations.
- Android build passes; physical-phone smoke or not-run reason is recorded.

Non-goals: iOS, Product PWA/web client, unrestricted dev-server tunneling, app-store publishing.

Dependencies: M5.

## Cross-milestone gates

Before closing any milestone, answer:

- Does it still preserve Android-first, pi-first scope?
- Does real work, credentials, and canonical `pi` JSONL remain on the node?
- Did it avoid adding terminal mirror, remote desktop, task board, PR manager, product web client, arbitrary shell passthrough, or PR approval behavior?
- Is behavior tested through public protocol or user-visible behavior instead of only implementation details?
- Is reviewable evidence recorded in the template below?

Evidence template:

- Commands run:
- Test results:
- Android build:
- UI / Maestro:
- Manual smoke:
- Screenshots/logs:
- Not-run reasons:
- Known limitations:

## Suggested issue slicing

After the roadmap is confirmed, split implementation issues. Most milestones should become 2–5 issues. M3 may become 5–8 issues because it has real runtime I/O, event model, Android UI, redaction, confirmations, and smoke tests.

- contract/schema issue: protocol and state model.
- backend/node issue: `relay`, `lynttyd`, pi integration.
- Android/client-core issue: state reducer, UI, storage, navigation.
- tests/evidence issue: protocol tests, Maestro, security tests, manual smoke.

Avoid broad issues like “implement all of M3”. Every issue needs files likely touched, acceptance criteria, test command, done evidence, and out-of-scope boundary.
