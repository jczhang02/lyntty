# Lyntty Roadmap

Status: PRD confirmed. This document converts the PRD into implementation order. It is not a calendar plan.

## Roadmap principles

- Prove vertical slices before expanding pages or edge capabilities.
- Every milestone must leave verifiable evidence: protocol tests, Android build/UI test, manual smoke, or explicit not-run reason.
- Android-first, pi-first. Product web client, iOS, multi-user SaaS, PR manager, and terminal mirror stay out of current scope.
- `Review Evidence` is a mode/panel inside `Session Remote`, not standalone main navigation.
- Real work stays on the node; the Android app only controls the `pi` session through `relay` -> `lynttyd` -> `active runtime`.

## Milestones

### M0 — Repo scaffold + protocol contracts

Goal: establish the minimum code structure and cross-surface protocol so later work builds against one contract.

Scope:

- scaffold `relay`, `lynttyd`, pi extension stub, and Expo/React Native Android shell.
- define shared protocol: session, node, runtime, event, command, confirmation, evidence, error, auth token, and sequence envelope.
- create `packages/client-core/` for session reducer, event grouping, reconnect/dedupe, Review Evidence summary, recovery state mapping, and command state machine.
- create minimum test harness: public relay/node/client protocol tests + `git diff --check`.

Exit criteria:

- repo can install dependencies, build base packages, and run minimum protocol tests.
- mock node can send ordered events through `relay`; client-core can produce session state.
- docs record contract versioning, breaking-change rules, and test command.

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

Non-goals: session control, `pi` execution, Review Evidence.

Dependencies: M0.

### M2 — Session registry + activation lock

Goal: establish session/runtime model and ensure one session can have only one `active runtime`.

Scope:

- session registry: native `/lyntty` session registration, recent session resume, headless session creation metadata.
- runtime adapter contract for native `/lyntty` and headless `pi` SDK paths; mocks may support tests, but the boundary must be explicit.
- `active runtime` heartbeat, lease, stale state, explicit takeover/release.
- busy takeover UX contract: stop/wait/interrupt.
- node capacity and queue state.
- Android-created git sessions default to temporary worktree; dirty worktrees are never auto-deleted.

Exit criteria:

- native pi TUI, Android app, and debug tooling (development only) can observe the same session/runtime state.
- tests prove activation lock prevents two active runtimes from advancing one session.
- busy runtime takeover requires explicit stop/wait/interrupt choice.
- capacity full creates visible queue state.

Non-goals: full live event feed, Review Evidence, previews.

Dependencies: M0, M1.

### M3 — Session Remote live control

Goal: `Session Remote` becomes the phone's main control page for supervising and controlling one `pi` session in real time.

Scope:

- structured event feed: progress, commands, logs, file changes, checks, errors.
- header/state strip: repo, node, runtime state, model, connection state, current action, elapsed time, last event.
- input semantics: idle sends new request; running defaults to queued next-turn context; redirect active work must be explicit; stop requires confirmation.
- confirmation handling: surface only pi/runtime-supported confirmations; show “needs computer-side confirmation” when unsupported.
- minimal slash command support: pass-through for known safe local commands, local-only marking, raw fallback. Rich command discovery/palette polish can wait until M6.

Exit criteria:

- Android can send a new request, add follow-up context, redirect active work, and stop a task on the same active runtime.
- at least one smoke proves Android input reaches a real native `/lyntty` session or headless `pi` SDK runtime, and resulting events/evidence return through `relay` -> `lynttyd` -> `client-core`. Mock runtime may support tests but cannot satisfy M3 completion.
- event feed is not a terminal mirror; low-level events are collapsed by default and can be filtered, expanded, and searched.
- confirmations appear near the input box; unsupported confirmations do not pretend to work.
- Maestro covers pairing -> session -> live control basic flow.

Non-goals: full reconnect hardening, complete Review Evidence, notifications, previews.

Dependencies: M2.

### M4 — Reconnect, ordering, and `history_gap`

Goal: after app sleep, network loss, or node reconnect, the user can recover context; if continuity cannot be proven, Lyntty shows `history_gap`.

Scope:

- per-session sequence allocation.
- REST backfill + WebSocket live stream.
- client dedupe by sequence/event identity.
- command idempotency.
- node reconnect, relay/node redelivery.
- visible recovery states: offline, stale, revoked, blocked, `history_gap`.

Exit criteria:

- tests cover app sleep, WebSocket reconnect, node reconnect, duplicate redelivery, and out-of-order protection.
- if continuity cannot be proven, Lyntty must emit visible `history_gap` before continuing.
- UI gives recovery paths and never pretends a broken timeline is continuous.

Non-goals: new product surfaces, cloud canonical history, zero-trust E2E.

Dependencies: M3.

### M5 — Review Evidence

Goal: provide a review mode inside `Session Remote` so the user can judge what `pi` did, whether results have evidence, and what to do next.

Scope:

- changed files, diff summary, test/check results, command summary, errors, event timeline, artifact metadata, preview anchors, recovery state, next actions.
- command output summary + expandable detail.
- per-file changes readable on Android.
- next actions: ask follow-up, ask `pi` to add tests or fix issues, open workspace on computer, export evidence.
- evidence summary reducer lives in `packages/client-core/`; UI does not directly implement protocol semantics.

Exit criteria:

- `Review Evidence` is available when a session finishes, fails, waits for confirmation, or the user opens it.
- no merge, push, or PR approval is provided.
- tests cover evidence reducer, UI anchors, error/test/detail drilldown.
- final acceptance evidence records commands, results, and not-run reasons.

Non-goals: standalone Review Evidence main navigation, PR manager, mobile code editor, hardened jailed/WebView preview implementation.

Dependencies: M3, M4.

### M6 — Notifications, previews, and Android hardening

Goal: turn the core loop into a daily-usable Android experience with safe previews and notifications.

Scope:

- Android notifications: session finished, waits, fails, needs local confirmation, node disconnects.
- static HTML artifact preview.
- constrained live dev-server preview through jailed/read-only/tokenized proxy.
- WebView-safe settings with no native bridge.
- mobile polish: large touch targets, reduced motion, clear state labels, stable test IDs.
- physical Android smoke where available; if unavailable, record emulator pass + physical-phone not-run reason.

Exit criteria:

- preview security tests cover jail realpath, token expiry, path traversal rejection, and no native bridge.
- notifications have reviewable evidence on Android emulator or physical device.
- Maestro covers happy path, failure path, recovery path, and evidence anchors.
- final docs update issue evidence and known limitations.

Non-goals: iOS, Product PWA/web client, unrestricted dev-server tunneling, app-store publishing.

Dependencies: M5.

## Cross-milestone gates

Before closing any milestone, answer:

- Does it still preserve Android-first, pi-first scope?
- Does real work, credentials, and canonical `pi` JSONL remain on the node?
- Did it avoid adding terminal mirror, remote desktop, task board, PR manager, or product web client behavior?
- Is behavior tested through public protocol or user-visible behavior instead of only implementation details?
- Is reviewable evidence recorded: commands, test results, screenshots/logs, not-run reasons?

## Suggested issue slicing

After the roadmap is confirmed, split implementation issues. Each milestone should become 2–5 issues:

- contract/schema issue: protocol and state model.
- backend/node issue: `relay`, `lynttyd`, pi integration.
- Android/client-core issue: state reducer, UI, storage, navigation.
- tests/evidence issue: protocol tests, Maestro, security tests, manual smoke.

Avoid broad issues like “implement all of M3”. Every issue needs files likely touched, acceptance criteria, test command, done evidence, and out-of-scope boundary.
