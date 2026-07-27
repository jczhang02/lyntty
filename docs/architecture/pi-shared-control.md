# Pi shared control architecture

Date: 2026-07-04

## Status

Accepted architecture with the core ordinary computer-side shared-control path implemented. Current code and tests remain implementation truth.

Implementation evidence: `docs/evidence/r50-pi-shared-control.md`. Reference research: `docs/research/pi-remote-control-models.md`.

## Problem

At the time of this design, a phone message sent from `Session Remote` could persist to `relay` and reach `lynttyd` but did not enter an ordinary computer-side Pi process. The extension path was one-way live event mirroring. The implementation described in the status and final section closed that gap.

The product requirement is stronger:

- phone must fully control the current ordinary `pi` session;
- no user-visible mirror/read-only mode;
- no silent message loss;
- no automatic duplicate runtime if the computer-side Pi is alive but extension control is unavailable.

## Research conclusion

Two upstream/reference models establish the boundary:

- `pi-web` controls sessions owned by its daemon through Pi SDK runtimes. This works for daemon-owned/headless sessions, but does not attach to an existing ordinary Pi TUI process.
- `@mporenta/pi-discord-remote` controls an already-running ordinary Pi session by running as a Pi extension inside that process and calling `pi.sendUserMessage(...)`, `ctx.abort()`, and related in-process APIs.

Therefore Lyntty uses:

- **Pi extension** for ordinary already-running computer-side `pi` sessions.
- **Pi SDK** for Lyntty-owned runtimes, including new/headless/historical sessions when no live ordinary Pi process owns the session.

SDK-only is rejected for ordinary TUI shared control because `SessionManager.open(...)` opens JSONL into a separate runtime; it does not attach to another running process.

## Product semantics

Lyntty has one user-facing concept: controllable Pi sessions.

Do not expose these as UI concepts:

- mirror
- read-only
- `external_pi`

Hard cut direction:

- new writes must not encode user-facing mirror/read-only semantics;
- old metadata such as `lifecycleState: "external_pi"` must be normalized at read boundaries into the new control model;
- existing output-only send behavior must be replaced with queued shared control.

Preferred internal model:

```ts
type RuntimeOwner = "pi-extension" | "lyntty-sdk" | "none";

type ControlState =
  | "ready"
  | "queued"
  | "waiting_extension"
  | "takeover_required"
  | "computer_offline"
  | "history_gap";
```

## Control paths

### Ordinary computer-side Pi alive

Use the Pi extension as the in-process control inlet.

```text
phone -> relay -> lynttyd -> 127.0.0.1 local IPC -> Pi extension -> Pi process
```

Responsibilities:

- phone creates user command intent;
- `relay` persists command intent and sequence;
- `lynttyd` owns local delivery policy and per-session queue;
- Pi extension polls or receives local commands from `lynttyd`;
- Pi extension calls Pi in-process APIs;
- extension returns ack/failure to `lynttyd`;
- `lynttyd` updates command delivery state through `relay`.

### No ordinary TUI runtime alive

Use the Pi SDK runtime in `lynttyd`.

```text
phone -> relay -> lynttyd -> Pi SDK runtime -> session.prompt()
```

Rules:

- reuse the same `machineId + piSessionId` relay session mapping;
- preserve `activation lock` semantics;
- load latest tail quickly and older history progressively;
- queued mobile sends flush once runtime is ready;
- relay-only Pi ids without a real local Pi session record are not product-visible sessions; skip them from session discovery and keep only dev-log/evidence traces.

## Session discovery retrieval

Pi JSONL remains canonical. `lynttyd` may maintain a private, rebuildable summary index under `LYNTTY_HOME_DIR`, but the index is never canonical history and is never uploaded to the `relay`.

Retrieval rules:

- restore the persisted summary immediately and revalidate it stale-while-revalidate;
- coalesce concurrent refreshes into one scan;
- fingerprint each JSONL, verify append continuity with a bounded head hash, and resume parsing from the persisted byte offset;
- rebuild a file after truncation, replacement, parser-version change, corrupt index data, or a failed append-continuity check;
- when no snapshot exists, publish a bounded newest-session prefix first, then scan complete files with low concurrency and cooperative event-loop yields;
- mark bounded-prefix summaries incomplete: their message count is a lower bound and must never authoritatively create `history_gap` or suppress a later backfill decision;
- before inferring a discovery gap from a cached complete count, revalidate that exact file fingerprint; never infer one from an active runtime's write/import race;
- cap retained JSON-line bytes so one large message or tool payload cannot monopolize memory;
- bind every discovery cursor to the immutable index generation and a per-daemon-runtime nonce, and reject continuation after either changes.

Sessions Home performs one bounded initial relay attempt, publishes relay rows without waiting for Pi discovery, and merges each Pi page as it arrives. A failed or warming machine keeps its previous rows. Rows are pruned only after a successful end-of-snapshot page. Transport retries are per-machine and finite. Explicit App, socket, or machine lifecycle signals request a generation-stamped full refresh, cancel obsolete pending pages, and preserve socket machine mutations that race an HTTP snapshot. Relay/settings/message/send work is bound to the active account generation; reset aborts bounded settings/message/history waits and late work cannot mutate the replacement runtime. Discovery gaps are provisional and clearable after verified recovery; `pi-history-page` gaps remain authoritative. Unknown deletions are hidden immediately and promoted to account-scoped Pi tombstones if identity arrives later.

### Extension missing or stale

Default behavior:

- do not silently fail;
- do not auto-start a duplicate SDK runtime while an ordinary computer-side Pi may still be alive;
- queue the command with visible remediation.

User-visible states/actions:

- `Queued`
- `Waiting for Pi extension`
- `Needs Pi extension`
- `Retry`
- `Install extension`
- `Take over on this node` only as explicit user action.

Existing running Pi processes need `/reload` or restart after extension updates.

## History bootstrap and recovery

Pi JSONL is canonical, but opening `Session Remote` must not wait for a full JSONL import. Lyntty bootstraps a bounded latest tail (currently 50 renderable entries) and exposes older history through progressive paging.

Two coordinates have different meanings and must not be conflated:

- the local **append checkpoint** is the newest canonical JSONL entry whose forward replay has been confirmed by `relay`;
- Relay metadata's `piHistoryCursor` is the oldest confirmed/renderable entry and therefore the authoritative lower bound for the next older page.

The append checkpoint is not proof that every earlier JSONL entry is already in Relay. On restart, `lynttyd` replays only entries after that checkpoint and preserves the progressive cursor. When no checkpoint exists during an upgrade, startup still reconciles only the bounded tail; an immutable tail anchor bounds later `agent_end` recovery even after progressive paging moves or clears its own cursor. Older entries remain reachable through paging. A completed progressive history (`piHistoryHasMore: false`) stays complete across restart. Ordinary mirrors and managed Pi runtimes use the same rule and derive coordinates from the complete JSONL entry sequence, not only the currently selected Pi branch.

Page RPCs may load only the current authoritative cursor. Stale or arbitrary cursors are safe no-ops, and the App rejects delayed responses whose requested cursor or metadata version is no longer current. Cursor metadata advances only after canonical envelopes and the Relay metadata update are confirmed; that metadata acknowledgement is time-bounded so a failed attempt releases the page queue without changing the local cursor. Assistant tool-call entries and their dependent tool results remain an atomic pagination boundary. A cursor, append checkpoint, or bounded recovery anchor that no longer exists in canonical JSONL produces explicit `history_gap`; reconciliation failures preserve the last confirmed cursor for diagnosis and later repair rather than silently skipping it or falling back to full replay.

## Thin extension boundary

The Pi extension may do:

- identify current session: `piSessionId`, `sessionFile`, `cwd`, `name`;
- send lifecycle/message/thinking/tool/input events to local `lynttyd`;
- heartbeat;
- poll local command queue;
- call approved Pi APIs;
- ack command delivery or failure.

The Pi extension must not own:

- relay auth;
- mobile token policy;
- encryption;
- account/device state;
- history pagination;
- durable command queues;
- takeover policy;
- multi-device conflict policy;
- direct relay/network access.

## Current strict command contract

Use a strict enum. Reject unknown command types. Do not pass raw slash commands or arbitrary strings through as privileged commands.

Supported user-visible command shapes:

```ts
type RemotePiCommand =
  | { type: "send_user_message"; text: string; images?: RemoteImage[] }
  | { type: "follow_up"; text: string; images?: RemoteImage[] }
  | { type: "steer"; text: string; images?: RemoteImage[] }
  | { type: "abort" }
  | { type: "compact"; instructions?: string }
  | { type: "reload" }
  | { type: "set_session_name"; name: string }
  | { type: "get_commands" }
  | { type: "invoke_pi_command"; commandLine: string; deliverAs?: "followUp"; images?: RemoteImage[] }
  | { type: "set_label"; entryId: string; label?: string };
```

Mapping:

- idle ordinary text: `pi.sendUserMessage(text)`
- streaming ordinary text: `pi.sendUserMessage(text, { deliverAs: "followUp" })`
- explicit steer: `pi.sendUserMessage(text, { deliverAs: "steer" })`
- stop: `ctx.abort()`
- compact: `ctx.compact(...)`
- reload: `ctx.reload()`
- rename: `pi.setSessionName(name)`
- command list: `pi.getCommands()` as read-only metadata
- allowlisted `/goal`, `/context`, and `/skill:*`: validated `invoke_pi_command` dispatch through the Pi command registry
- label: `pi.setLabel(entryId, label)`

`lynttyd` may also enqueue a local-only `internal_shutdown` maintenance command for Stop & Archive after the user confirms hiding a running ordinary Pi session. This command is not parsed from mobile text, is not surfaced as a slash command, requires the authenticated local Pi-extension channel, and `lynttyd` must wait for `session_shutdown`/mirror removal before reporting stop success to the app.

Explicitly out of scope for first version:

- `new_session`
- `switch_session`
- `fork`
- `navigate_tree`
- user-visible `shutdown`
- arbitrary Pi slash command execution
- `setActiveTools`
- model/thinking-level changes
- arbitrary `pi.sendMessage(...)`

Rationale: first version controls the current session without changing session identity, branch/tree, runtime ownership, model/tool permission surface, or user-visible process lifecycle. Stop & Archive's `internal_shutdown` is a separate local maintenance path for an explicit archive/hide action, not a general remote command.

## Delivery state model

Each layer only proves its own work.

```ts
type RemotePiCommandState =
  | "queued"
  | "delivered_to_computer"
  | "delivered_to_pi_extension"
  | "accepted_by_pi"
  | "failed";
```

Meanings:

- `queued`: `relay` persisted the command intent.
- `delivered_to_computer`: `lynttyd` received the command and put it in the local delivery queue.
- `delivered_to_pi_extension`: the Pi extension received the command.
- `accepted_by_pi`: the extension or SDK runtime called the Pi API successfully and Pi accepted the input/control action.
- `failed`: delivery failed with a reason.

Failure reasons include:

- `extension_offline`
- `computer_offline`
- `unsupported_command`
- `session_mismatch`
- `pi_busy_requires_mode`
- `pi_api_error`
- `timeout`

`accepted_by_pi` must be confirmed by extension or SDK runtime. It must not be inferred from phone optimism alone.

## Queueing and ordering

Queue key:

```text
machineId + piSessionId
```

Rules:

1. `abort` has highest priority and may bypass queued ordinary messages.
2. All other remote commands are FIFO by relay-assigned sequence.
3. Local computer keyboard input is not locked.
4. Local input becomes authoritative when Pi emits input/message events or writes JSONL.
5. Final timeline follows actual Pi session history/order, while mobile command bubbles retain delivery state.

## Source display

Shared control must be transparent without changing the user's visible prompt text.

- The Pi extension sends the visible mobile prompt unchanged; it does not add a source prefix.
- When enabled, phone-origin context is injected separately as a hidden `lyntty-mobile-context` message so Pi can prefer concise phone-friendly replies.
- The App merges the canonical Pi echo into the optimistic bubble by `localKey` and shows delivery/source presentation there; computer-origin user messages may carry a `Computer` label in the App.
- No hidden “ghost input” or duplicate visible user bubble may appear.

This behavior is implemented and validated in `docs/evidence/r57-mobile-send-echo-merge.md`.

## UI behavior

Phone send is optimistic but honest:

- user bubble appears immediately;
- bubble shows delivery state, not just “sent”;
- if extension is missing, bubble remains queued with remediation;
- if accepted, state advances to accepted;
- later assistant/tool events prove actual response progress.

Suggested simplified UI labels:

- `Queued`
- `On computer`
- `Delivered to Pi`
- `Accepted`
- `Needs Pi extension`
- `Retry send`

## Security and safety notes

- Extension talks only to local `lynttyd` over local-only IPC/HTTP.
- Extension never connects directly to `relay`.
- `lynttyd` remains the policy and audit boundary.
- Unknown command types are rejected.
- Remote command payloads must be capped and validated.
- Stop/abort must record source and outcome.
- Takeover must be explicit.

## Implementation status

The core path is implemented and recorded in `docs/evidence/r50-pi-shared-control.md`:

- Durable command intent is implemented at the Relay message layer; `lynttyd` provides bounded per-session delivery queues and an accepted-command ledger.
- The Pi extension polls the local authenticated command endpoint, invokes approved Pi APIs, and acknowledges outcomes.
- Ordinary Pi sends route through shared control instead of the former output-only path.
- Old `external_pi` metadata is normalized to `runtimeOwner` / `controlState` at read boundaries.
- Extension-missing and stale states preserve queued intent and visible remediation without starting a duplicate SDK runtime.
- Focused daemon, extension, App reducer, and real ordinary-Pi smoke coverage exercise the path.

Richer delivery-state presentation and future command additions remain incremental product work. They must preserve this architecture and be verified through the real isolated phone/Relay/daemon/extension path appropriate to the claim.
