# Lyntty CLI / Daemon Agent Instructions

The root `AGENTS.md` applies here. This guide adds CLI/daemon-specific deltas and cannot weaken root safety, permission, product, release, or verification rules.

This package contains the `lyntty` CLI, local `lynttyd`, Pi SDK runtime adapter, Pi extension installer/source generator, local-control bridge, `lyntty remote`, and `lyntty dev app-logs`.

## Product boundary

- `pi` is the only supported agent/runtime.
- Do not restore Claude, Codex, Gemini, OpenClaw, ACP, web-auth, or static-webapp command surfaces.
- `lynttyd` alone connects to the Relay and owns node state, extension IPC, active-runtime policy, worktree RPCs, durable command delivery, and Relay bridging.
- The Pi extension is local-only. It identifies sessions, sends live events and heartbeats, polls commands, calls approved Pi APIs, and acknowledges outcomes. It must not connect to the Relay or own durable policy.
- Formal releases compile `lyntty` and `lynttyd` with Bun. Do not add Node/npm/pnpm/npx/tsx execution paths or runtime fallbacks.

## Live-environment safety

Never touch the user's live global Pi extension, current Pi sessions, `~/.pi`, or `~/.lyntty` by default. Use:

- temporary `HOME` and `LYNTTY_HOME_DIR`;
- a temporary Pi agent/extension path;
- isolated Relay ports and daemon state;
- a uniquely named, PID/cwd/env-verified tmux session when a real `pi` process is required.

Do not run `lyntty remote install`, force `/reload`, or overwrite the live extension without explicit approval. Bundle-check generated extension source in isolation first.

## Shared control

```text
phone -> relay -> lynttyd -> local Pi extension -> pi.sendUserMessage()/ctx.abort()
```

- Use `runtimeOwner` / `controlState` for new metadata writes.
- Normalize old metadata only at read boundaries; never execute old non-Pi runtimes.
- Deliver phone input as durable remote commands with epoch/owner tokens, bounded retry, and explicit terminal states.
- Abort has priority. Unsupported or stale-extension cases need visible remediation.
- Preserve message `localKey` / Relay `localId` idempotency.
- Never silently spawn a duplicate SDK runtime when an ordinary Pi TUI may own the session.

## Runtime and history

- Use the Pi SDK only for Lyntty-owned sessions, explicit takeover/resume, or history attach when no ordinary Pi TUI owns the session.
- One `machineId + piSessionId` maps to one Relay session and one active runtime.
- Pi JSONL is canonical history. Preserve progressive loading, deterministic envelope ids, turn ids, live/history display equivalence, durable watermarks, and explicit `history_gap`.
- Do not advance coverage before Relay acknowledgement or successful canonical replay.

## Local control and RPC

- Bind extension/control endpoints to `127.0.0.1` and require `X-Lyntty-Extension-Token`.
- Keep token-bearing state files at `0600`, cap payloads/queues, and clear active state on shutdown.
- Do not add generic machine-scope shell or filesystem RPCs. Worktree RPCs must stay narrow, validated, output-capped, and backed by `execFile('git', args)`.

## Verification tiers

Use isolated focused checks while iterating:

```bash
bun run --filter lyntty-cli typecheck
HOME="$(mktemp -d)" LYNTTY_HOME_DIR="$(mktemp -d)" \
  bun run --filter lyntty-cli test
```

Before a commit or claim about the CLI package, run the package claim gate, which typechecks, builds the distributable package output, and runs unit tests:

```bash
bun run ci:cli
```

Changes to daemon lifecycle, Pi extension IPC, compiled executable behavior, local control, or process ownership additionally require the isolated integration gate. This gate compiles both `lyntty` and `lynttyd`, builds the standalone Relay, and exercises their integration:

```bash
bun run ci:daemon-integration
```

Important focused coverage includes Pi extension events/install, Session Protocol mapping/history, ordinary-Pi shared control, daemon ownership/queueing, `ApiSessionClient`, `ApiMachineClient`, `lyntty remote`, and app-log receiver behavior. Keep every integration run off the user's live `~/.pi`, `~/.lyntty`, and current Pi process.
