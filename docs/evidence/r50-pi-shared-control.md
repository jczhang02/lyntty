# R50 Pi shared control

Date: 2026-07-04

## Scope

Fix `lyntty-2ep`: phone sends to an ordinary computer-side `pi` session must reach the currently running Pi process through `relay -> lynttyd -> Pi extension -> pi.sendUserMessage()`. User-visible mirror/read-only/`external_pi` semantics are removed; old `external_pi` metadata is normalized at read time.

## Changes

- Added shared-control design docs:
  - `docs/research/pi-remote-control-models.md`
  - `docs/architecture/pi-shared-control.md`
- Added strict P0+P1 command parsing for extension delivery: `send_user_message`, `follow_up`, `steer`, `abort`, `status`, `compact`, `reload`, `set_session_name`, `get_commands`, `set_label`.
- Added local-only extension command polling and ack endpoints:
  - `POST /pi-extension/commands`
  - `POST /pi-extension/command-ack`
- Hardened extension IPC:
  - `X-Lyntty-Extension-Token` required for extension endpoints.
  - token persisted in `~/.lyntty/daemon.state.json` with mode `0600`.
  - command envelopes carry `deliveryToken`.
  - failed acks keep commands queued for retry; accepted acks persist a bounded accepted-localKey ledger.
  - queue cap and payload caps added.
- Extended installed global Pi extension to poll commands, execute strict commands via Pi APIs, and ack results.
- Routed ordinary relay user messages for Pi-extension-owned sessions into the extension queue instead of leaving them in `ApiSessionClient.pendingMessages`.
- Added `runtimeOwner` / `controlState` metadata and read-time normalization for old `lifecycleState: "external_pi"`.
- Changed synthetic Pi open so successful extension mirror attach returns without spawning a duplicate SDK runtime.

## Manual E2E smoke

Environment: local relay/daemon, tmux Pi TUI, global Lyntty Pi extension installed by `pnpm --filter ./packages/lyntty-cli run cli:install`.

Steps:

1. Started tmux Pi TUI session `lyntty-r50-shared2` in `/home/jc/dev/lyntty`.
2. Confirmed daemon state:
   - `hasPiExtensionToken: true`
   - `daemon.state.json` mode `600`
   - control server bound on `127.0.0.1`
3. Posted an encrypted user message through the deterministic Pi relay session for Pi session `019f2d01-5516-7bbd-9e23-afa5125219dd`.
4. Verified daemon decrypted the relay user message and queued remote Pi command.
5. Verified computer Pi TUI displayed the remote source label:
   - `[lyntty] Please reply exactly R50_SHARED_CONTROL_FINAL_200203`
6. Verified Pi JSONL contains both user input and assistant response:
   - user line contains `[lyntty] Please reply exactly R50_SHARED_CONTROL_FINAL_200203`
   - assistant line contains `R50_SHARED_CONTROL_FINAL_200203`

Result: phone-equivalent encrypted relay send reached ordinary running Pi via extension shared-control path.

## Verification

- `pnpm --filter ./packages/lyntty-cli exec vitest run src/api/apiSession.test.ts src/pi/piExtensionEvent.test.ts src/daemon/controlServer.piExtension.test.ts` — pass, 36 tests.
- `pnpm --filter ./packages/lyntty-cli typecheck` — pass.
- `pnpm --filter ./packages/lyntty-app exec vitest run sources/sync/piDiscoveredSessions.test.ts` — pass, 5 tests.
- `pnpm --filter ./packages/lyntty-app typecheck` — pass.
- `pnpm --filter ./packages/lyntty-cli test` — pass, 88 files / 767 tests.
- `pnpm --filter ./packages/lyntty-app test` — pass, 68 files / 739 tests.
- `pnpm --filter ./packages/lyntty-relay test` — pass, 14 files / 93 tests.
- `pnpm --filter ./packages/lyntty-wire test` — pass, 2 files / 19 tests.
- `pnpm --filter ./packages/lyntty-agent test` — pass, 9 files / 227 tests.
- `pnpm --filter ./packages/lyntty-relay typecheck` — pass.
- `pnpm --filter ./packages/lyntty-agent typecheck` — pass.
- `pnpm --filter ./packages/lyntty-wire build` — pass.
- `git diff --check` — pass.

## Review

Two read-only review rounds found and drove fixes for:

- dropped persisted relay commands after daemon restart;
- command delivery-token wedging;
- missing token preservation during daemon heartbeat;
- daemon state file permissions;
- failed-ack retry cursor suppression.

Final targeted review (`final ack review`): no blockers after failed-ack cursor/idempotency fixes.

## Known limits

- This is an emulator/local-daemon/manual relay-send smoke, not a full fresh phone APK Maestro run for this specific diff.
- Commands are daemon-memory queues backed by relay message intent and accepted-command metadata ledger; richer UI delivery-state rendering can be improved later.
- Existing running Pi processes need `/reload` or restart to load the updated global Lyntty extension.
