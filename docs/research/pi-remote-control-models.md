# Pi remote control models: SDK, extension, and existing-process control

Date: 2026-07-04

## Question

Can Lyntty use the Pi SDK alone for all remote control, or does controlling an already-running ordinary `pi` process require a Pi extension?

The specific product requirement is stronger than “view history” or “start a headless agent”: a phone in `Session Remote` should control the same `pi` session that is already running on the computer, with no user-visible mirror/read-only mode.

## Summary

Lyntty needs both surfaces, with different ownership boundaries.

- **Pi SDK** is the right owner for Lyntty-managed runtimes: new sessions, reopened historical sessions, and headless continuation when no ordinary computer-side `pi` process is alive.
- **Pi extension** is the right control inlet for an ordinary `pi` process that is already running in a computer TUI. The extension runs inside that process and can call Pi’s in-process control APIs.
- **SDK-only is not sufficient** for shared control of an already-running ordinary TUI process. Opening the same JSONL with `SessionManager.open(...)` from `lynttyd` creates or resumes a separate SDK runtime; it does not attach to the other process’s live runtime.

User-facing product language should not expose “mirror” as a mode. Internally, an ordinary computer-side `pi` session can be extension-controlled; if the extension is absent, mobile sends must stay queued with an explicit recovery action rather than silently disappearing.

## Research source: `@jmfederico/pi-web`

Source: <https://pi.dev/packages/@jmfederico/pi-web> and upstream repo `jmfederico/pi-web`.

### How pi-web controls sessions

`pi-web` controls Pi sessions through a long-lived session daemon that owns the Pi SDK runtime.

Relevant implementation points from the upstream repo:

- `src/server/sessiond.ts` starts the long-lived session daemon, creates `PiSessionService`, and registers session routes plus WebSocket events.
- `src/server/sessions/piSessionService.ts` calls `createAgentSessionRuntime(...)` and binds `session.subscribe(...)` to publish events.
- `src/server/sessions/sessionRoutes.ts` exposes `POST /sessions/:sessionId/prompt`, which calls `sessions.prompt(...)`.
- `PiSessionService.prompt(...)` calls `session.prompt(text, options)`; while streaming or compacting it uses Pi’s `followUp`/queued behavior.
- Browser clients call `sessionsApi.prompt(...)` in `src/client/src/api/clients.ts`.

Control chain:

```text
browser -> pi-web server/sessiond -> Pi SDK AgentSessionRuntime -> session.prompt()
```

### What pi-web extension does

`extensions/pi-web.ts` registers `/pi-web` service-management commands such as install/status/logs/restart/open. It does not control an already-running ordinary Pi TUI session.

### Implication for Lyntty

`pi-web` proves SDK-owned runtimes are a good model when the daemon is the runtime owner. It does not prove SDK-only can control an ordinary `pi` process already running in another terminal.

## Research source: `@mporenta/pi-discord-remote`

Source: <https://pi.dev/packages/@mporenta/pi-discord-remote?name=discord> and npm package `@mporenta/pi-discord-remote@0.3.13`.

### How discord-remote controls an already-running Pi session

`pi-discord-remote` is a Pi extension. It runs inside the current `pi` process and connects that process to Discord.

Inbound Discord text is injected into the current Pi session with `pi.sendUserMessage(...)`:

```ts
if (idle) {
  await pi.sendUserMessage(`${cfg.steerLabel} ${text}`);
} else {
  await pi.sendUserMessage(`${cfg.steerLabel} ${text}`, {
    deliverAs: "steer",
  });
}
```

Other control paths are also extension-context calls:

- `/abort` or 🛑 reaction calls `ctx.abort()`.
- `/compact` calls `ctx.compact()`.
- `/new` uses `ctx.newSession(...)` when armed, otherwise spawns a new `pi` process.
- `/commands` lists Pi command metadata with `pi.getCommands()`.
- Outbound events use Pi extension event hooks such as `input`, `message_start`, `message_update`, `message_end`, `tool_call`, `tool_result`, and `session_shutdown`.

Control chain:

```text
Discord -> Discord bot inside Pi extension -> pi.sendUserMessage()/ctx.abort()/ctx.compact() -> current Pi process
```

### Implication for Lyntty

This package is closer to Lyntty’s ordinary-computer-`pi` requirement than `pi-web` is. It demonstrates that current-process remote control is done from inside a Pi extension, not by an external SDK process attaching to the TUI.

Lyntty should not copy its external-network shape. `pi-discord-remote` connects the extension directly to Discord. Lyntty should keep the extension local-only:

```text
phone -> relay -> lynttyd -> 127.0.0.1 local IPC -> Pi extension -> pi.sendUserMessage()
```

## SDK-only assessment

SDK-only works well when `lynttyd` owns the `active runtime`:

- create/open session through Pi SDK;
- subscribe to events;
- send user prompts via `session.prompt(...)`;
- use `followUp`, `steer`, and `abort` through the SDK runtime;
- keep the runtime alive across phone reconnects.

SDK-only does not satisfy shared control of an existing ordinary TUI process:

- no public SDK API was found that attaches to another running interactive Pi process;
- `SessionManager.open(...)` opens the session file into the caller’s process, not the other process’s runtime;
- two runtimes for one JSONL risk duplicate writes, conflicting streaming state, stale activity, and broken `activation lock` semantics;
- phone sends would not reach the computer-side TUI unless that TUI process exposes an in-process bridge.

Therefore, SDK-only would require a product restriction: “phone can control only sessions started or taken over by Lyntty.” That conflicts with the desired behavior where ordinary computer-side `pi` sessions are controllable from the phone.

## Recommended Lyntty model

Use a hybrid model with one user-facing concept: controllable Pi sessions.

### Ordinary computer-side `pi` is alive

Use the Pi extension as the in-process control inlet.

```text
phone -> relay -> lynttyd -> Pi extension -> pi.sendUserMessage()
```

Rules:

- idle Pi: send as a normal user turn;
- streaming Pi: default to `followUp` for ordinary mobile messages;
- explicit redirect/interrupt UI: use `steer`;
- stop: highest-priority abort command;
- all remote input is sequenced by `relay`/`lynttyd` before delivery to extension;
- extension reports ack states back through `lynttyd`.

The extension should stay thin:

- report session identity and live events;
- maintain heartbeat;
- poll or receive local-only commands from `lynttyd`;
- call `pi.sendUserMessage(...)`, `ctx.abort()`, or other approved Pi extension APIs;
- acknowledge delivery/failure.

The extension should not own:

- relay authentication;
- encryption;
- mobile account state;
- history paging;
- multi-device policy;
- durable command queues beyond a small local retry buffer.

### No ordinary TUI runtime is alive

Use the Pi SDK in `lynttyd`.

```text
phone -> relay -> lynttyd -> Pi SDK runtime -> session.prompt()
```

Rules:

- reopen the same Pi session with `SessionManager.open(...)`;
- reuse the same `machineId + piSessionId` relay session mapping;
- preserve `activation lock` semantics;
- load latest tail quickly and older history progressively;
- queued mobile sends flush once the SDK runtime is ready.

### Extension missing or stale

Do not silently drop mobile sends.

User-visible behavior:

- show `Queued` / `Waiting for Pi extension`;
- explain `lyntty remote install` and `pi /reload` or Pi restart;
- retry delivery when extension connects;
- do not auto-start a duplicate headless runtime while the ordinary computer-side Pi may still be active.

## Design conclusion

- `pi-web` supports the SDK-owned daemon model.
- `pi-discord-remote` supports the extension-controlled ordinary TUI model.
- Lyntty’s requirement combines both: one product surface, two internal owners.

The implementation should hide “mirror” from users, but it should not pretend SDK-only can control a process it does not own. For ordinary already-running `pi`, an in-process extension bridge is the safe control boundary.
