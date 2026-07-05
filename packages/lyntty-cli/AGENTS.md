# Lyntty CLI / Daemon Agent Instructions

This package contains the `lyntty` CLI, local `lynttyd`, Pi SDK runtime adapter, Pi extension installer/source generation, and local-control bridge. It is the highest-risk package for the user's live Pi environment.

## Product boundary

- Current product runtime is `pi` only.
- Claude/Codex/Gemini/OpenClaw/ACP directories are inherited Happy-era compatibility or regression material. Do not expand or restore them as product surfaces unless explicitly scoped.
- `lynttyd` is the local source of truth for node state, extension IPC, SDK-owned runtimes, active-runtime policy, worktree RPCs, and relay bridging.
- The Pi extension is thin and local-only: identify session, send live events, heartbeat, poll commands, call approved Pi APIs, ack/fail. It must not own relay auth, encryption, durable queues, takeover policy, or public-network behavior.

## Pi extension safety

Default: never touch the user's live global Pi extension or current Pi sessions.

For extension work use isolation:

- temporary `HOME`
- temporary `LYNTTY_HOME_DIR`
- temporary Pi agent dir, e.g. `HOME=/tmp/...` so `~/.pi/agent/extensions/lyntty/index.ts` is not the real one
- isolated relay port and daemon state
- isolated tmux session if a real `pi` process is required

Do not run `cli:install`, `lyntty remote install`, `/reload`, or overwrite `~/.pi/agent/extensions/lyntty/index.ts` against the real home without explicit user approval.

Generated extension source must be syntax/bundle checked in temp HOME before any live install is proposed.

## Shared-control rules

Ordinary computer-side `pi` sessions are controllable sessions, not user-visible mirrors.

Control path:

```text
phone -> relay -> lynttyd -> local Pi extension -> pi.sendUserMessage()/ctx.abort()
```

Implementation rules:

- Use `runtimeOwner` / `controlState` metadata for new writes.
- Normalize old `lifecycleState: "external_pi"` only at read boundaries.
- Phone input to a live ordinary Pi process must become a strict remote command, not a legacy session RPC.
- Unsupported commands must produce visible, non-retrying feedback.
- Abort/stop has priority over ordinary queued commands.
- Remote command delivery requires local `piExtensionToken` auth plus delivery-token ack semantics.
- Preserve user-message `localKey`/relay `localId` for replay protection.
- Never silently spawn a duplicate SDK runtime if a live ordinary Pi process may own the session.

## Pi SDK runtime rules

Use Pi SDK runtime for Lyntty-owned sessions only:

- new/headless sessions
- historical session attach when no ordinary Pi TUI owns the session
- explicit takeover/resume paths

Respect:

- `machineId + piSessionId` stable relay mapping
- `activation lock`
- progressive history loading, not full JSONL import before open
- deterministic session-protocol envelope ids and relay localIds
- extension binding and rebind behavior after session switches/imports

## Session history and display

- Pi JSONL is canonical history.
- `runPiSessionProtocol.ts` and `runPiHistory.ts` should preserve equivalent live/history display semantics.
- Visible agent envelopes need turn ids.
- Tool outputs belong on tool-result/tool-card paths, not raw thinking/plain text.
- Streaming text must flush bounded tails so the APK does not wait for JSONL fallback.
- JSONL fallback must be retry-safe and must not mark entries known before successful send/flush.

## Local control server

- Bind local extension/control endpoints to `127.0.0.1`.
- Require `X-Lyntty-Extension-Token` for Pi extension endpoints.
- Keep daemon state files permission-restricted (`0600`) when they contain tokens.
- Cap queues/payloads and preserve FIFO except abort priority.
- Shutdown/session-death must clear active/keepAlive state promptly.

## Worktree and machine RPC

- Do not re-enable generic machine-scope `bash`, `readFile`, `writeFile`, `listDirectory`, `getDirectoryTree`, `ripgrep`, or `difftastic`.
- Machine worktree operations must use narrow RPCs backed by `execFile('git', args)` with validation and output caps.
- Generic shell/file operations belong only on session-scoped RPC where appropriate.

## Tests

Preferred checks:

```bash
pnpm --filter ./packages/lyntty-cli exec tsc --noEmit
pnpm --filter ./packages/lyntty-cli test
```

Focused areas often need these tests:

- `src/pi/piExtensionEvent.test.ts`
- `src/pi/piExtensionInstall.test.ts`
- `src/pi/runPiSessionProtocol.test.ts`
- `src/pi/runPiHistory.test.ts`
- `src/pi/runPiExternalMirror.test.ts`
- `src/daemon/controlServer.piExtension.test.ts`
- `src/api/apiSession.test.ts`
- `src/api/apiMachine.test.ts`

For extension source changes, also smoke generated output in a temp HOME and verify it bundles/loads without touching the live extension.

## Legacy Happy agent test guidance

Happy's old one-primary-integration-file-per-agent guidance is retained only for legacy agent compatibility tests. In Lyntty, primary acceptance is Pi behavior:

- ordinary Pi TUI through extension shared control;
- Lyntty-owned SDK runtime;
- historical Pi JSONL discovery/open/progressive history;
- command/event delivery to the mobile app.

Do not add new Claude/Codex/Gemini/OpenClaw integration requirements for Lyntty product acceptance.
