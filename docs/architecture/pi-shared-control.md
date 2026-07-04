# Pi shared control architecture

Date: 2026-07-04

## Status

Accepted design direction for ordinary computer-side `pi` session control in Lyntty.

Reference research: `docs/research/pi-remote-control-models.md`.

## Problem

A phone message sent from `Session Remote` to an ordinary `pi` session already running on the computer can currently persist to `relay` and reach `lynttyd`, but it does not enter that computer-side Pi process. The existing extension path was one-way live event mirroring, not two-way control.

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
  | "missing_local_history"
  | "computer_offline";
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
- missing local JSONL remains `missing_local_history` and cannot send.

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

## First-version command whitelist

Use a strict enum. Reject unknown command types. Do not pass raw slash commands or arbitrary strings through as privileged commands.

Supported P0/P1 commands:

```ts
type RemotePiCommand =
  | { type: "send_user_message"; text: string }
  | { type: "follow_up"; text: string }
  | { type: "steer"; text: string }
  | { type: "abort" }
  | { type: "compact"; instructions?: string }
  | { type: "reload" }
  | { type: "set_session_name"; name: string }
  | { type: "get_commands" }
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
- label: `pi.setLabel(entryId, label)`

Explicitly out of scope for first version:

- `new_session`
- `switch_session`
- `fork`
- `navigate_tree`
- `shutdown`
- arbitrary Pi slash command execution
- `setActiveTools`
- model/thinking-level changes
- arbitrary `pi.sendMessage(...)`

Rationale: first version controls the current session without changing session identity, branch/tree, runtime ownership, model/tool permission surface, or process lifecycle.

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

Shared control must be transparent.

- Mobile-originated user input should be labeled as from Lyntty in local Pi and mobile UI.
- Computer-local user input should be distinguishable as computer/local input when displayed remotely.
- No hidden “ghost input” from phone.

Default source label for extension-injected user messages:

```text
[lyntty]
```

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

## Open implementation work

- Add durable command intent and delivery-state storage.
- Add local `lynttyd` per-session delivery queues.
- Extend Pi extension with command polling and ack.
- Add app UI command-state rendering.
- Normalize old `external_pi` metadata into `runtimeOwner/controlState`.
- Replace output-only ordinary Pi session send path.
- Add regression and E2E coverage for ordinary phone send into a running computer-side Pi session.
