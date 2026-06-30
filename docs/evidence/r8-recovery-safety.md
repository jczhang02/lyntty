# R8 Recovery and Safety Evidence

Date: 2026-06-30

## Scope

Roadmap phase R8 / Beads `lyntty-ekv.8`: node-local Pi recovery/safety semantics for Lyntty-on-Lyntty.

## Changed files

- `packages/lyntty-cli/src/pi/runPiRecovery.ts`
- `packages/lyntty-cli/src/pi/runPiRecovery.test.ts`
- `docs/evidence/r8-recovery-safety.md`

Related existing safety files verified:

- `packages/lyntty-cli/src/daemon/activationLock.ts`
- `packages/lyntty-cli/src/daemon/activationLock.test.ts`
- `packages/lyntty-cli/src/pi/runPiControl.ts`
- `packages/lyntty-cli/src/pi/runPiControl.test.ts`

## Implemented semantics

### Historical Pi session recovery model

`runPiRecovery.ts` defines node-local recovery states:

- `discovered_local`
- `registered`
- `active_runtime`
- `stale_local`
- `missing_local_history`
- `history_gap`
- `import_failed`

`discoverLocalPiSessions()` uses Pi SDK `SessionManager.list(cwd, sessionDir)` by default and classifies each local Pi JSONL session against:

- registered relay/import ledger state.
- active runtime session IDs.
- stale threshold.
- local/relay message-count consistency.
- relay cache availability.

### `history_gap` and backfill rules

Classification rules now encode:

- unregistered local JSONL -> `discovered_local`, needs registration and backfill.
- registered local session with active runtime -> `active_runtime`.
- registered session missing local JSONL -> `missing_local_history`, `hasHistoryGap`.
- local JSONL has fewer messages than import ledger expects -> `history_gap`.
- relay cache loss -> registered session needing local backfill.
- local JSONL has more messages than import ledger -> registered/stale session needing backfill.
- import parse/registration failure -> `import_failed`.

### Redaction boundary

`redactPiTextForRelay()` and `redactPiSessionForRelay()` redact before relay/client exposure:

- home directory prefixes become `~`.
- obvious API keys/tokens/authorization values are replaced.
- session path, cwd, display name, and reason are redacted.

### Safety semantics already in product path

Existing verified pieces still cover:

- activation lock blocks duplicate active Pi runtime in the same directory unless takeover is `stop` or `interrupt`.
- takeover `wait` returns blocked because queue semantics are not implemented.
- duplicate remote command `localKey` is dropped before Pi SDK delivery.
- local-only slash commands are blocked from remote prompt delivery.

## Test commands

```bash
pnpm --filter ./packages/lyntty-cli exec vitest run src/daemon/activationLock.test.ts src/pi/runPiControl.test.ts src/pi/runPiRecovery.test.ts
pnpm --filter ./packages/lyntty-cli run typecheck
```

Results:

- 3 test files passed.
- 24 tests passed.
- `lyntty-cli` typecheck passed.

Coverage from these tests:

- activation lock.
- two active runtimes cannot advance one same-directory Pi runtime without takeover.
- duplicate remote commands.
- local-only slash commands.
- redaction.
- historical local import/classification.
- relay cache loss.
- `history_gap`.

## Real Pi SDK historical discovery smoke

Created a temporary Pi JSONL session file and listed it through `SessionManager.list()`.

Command result:

```json
[{"id":"pi-history-smoke","cwd":"/tmp/lyntty-history-cwd","messageCount":1,"firstMessage":"hello from historical pi session"}]
```

This proves the SDK historical discovery surface used by `discoverLocalPiSessions()` can read local JSONL history.

## Not run

- Full relay registration/backfill mutation path.
- Full mobile reconnect/backfill UI.
- Android device/emulator smoke.

## Risks / next work

- R9 must surface recovery/backfill/check results in `Review Evidence`.
- Full live mobile -> relay -> daemon -> Pi recovery smoke still required before final completion.
- Current implementation stores recovery semantics in CLI-side helpers; deeper relay persistence wiring remains future hardening.
