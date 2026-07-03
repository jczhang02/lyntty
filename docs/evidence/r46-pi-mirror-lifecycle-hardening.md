# R46 Pi mirror lifecycle hardening

Date: 2026-07-04
Beads: `lyntty-l34`

## Trigger

Late CLI/daemon review after R45 found risks in ordinary Pi live mirroring and JSONL fallback:

- Pi runtime rebind could keep mirroring the old JSONL file.
- Extension/daemon startup queues could lose or reorder live Pi events.
- Live extension events and JSONL fallback could duplicate assistant/tool turns.
- JSONL fallback could drop entries when relay send failed.
- Discovery omitted registered relay sessions whose local Pi JSONL was missing.
- Import ledger counts were hardcoded to `0`.
- Extension-provided `sessionFile` was accepted but ignored.
- External mirror polled whole JSONL files each tick and had mtime-only skip risks.

## Fixes

### Runtime and external mirror lifecycle

- `runPi()` now stops the current external mirror and creates a new mirror for the rebound Pi session file when Pi runtime rebinds to another session.
- `startPiExternalMirror().stop()` is async and waits for any in-flight poll before rebind/shutdown can proceed.
- Daemon shutdown and self-restart now await all external mirror stops.

### JSONL fallback correctness

- `PiExternalMirror` now:
  - tracks byte offsets and reads only appended JSONL data after initial catch-up;
  - uses both `mtimeMs` and file size for skip checks;
  - preserves incomplete trailing JSONL lines for the next poll;
  - keeps pending entries until send/flush succeeds;
  - retries pending entries after send failures;
  - catches stale initial snapshots by starting with offset `0` and deduping with known ids.

### Live extension / fallback dedupe

- Daemon Pi extension handling now serializes all queued and live extension events through one FIFO promise chain.
- Live event handling marks JSONL entries as delivered only after live envelopes flush.
- `markCurrentEntriesDeliveredSince()` drops only non-user JSONL entries covered by extension-live timing, preserving local user prompts because the extension does not emit user input events.
- Delayed delivered marking is guarded with try/catch so removed/moved session files do not crash timers.

### Extension queue behavior

- Installed Pi extension source now uses a bounded FIFO payload queue with retry.
- Retry timers use `unref()` where available so Lyntty remote sync does not keep a Pi process alive.
- Permanent failures are bounded to five attempts for the head item, avoiding infinite head-of-line blocking.
- When the queue is full, low-value `message_update` items are dropped before lifecycle/tool events.
- Daemon pre-handler startup queue now rejects when full instead of silently dropping oldest events, letting the extension retry.

### Discovery and exact file resolution

- Extension `sessionFile` is passed through to daemon mirror setup and validated against the Pi JSONL header id before directory/machine-wide fallback scans.
- Registered relay sessions without local JSONL now appear as `missing_local_history` records in discovery.
- Discovery ordering uses registered `updatedAt` for missing-local records.
- Registered import ledger uses `piHistoryTotalMessages ?? piMessageCount ?? 0` instead of hardcoded `0`.

## Review rounds

- Initial CLI/daemon review reported no proven blocker but high risks.
- R46 mirror review found duplicate suppression, startup offset, rebind-state, and stop risks.
- R46 daemon review found extension queue head-of-line and queued-event ordering blockers.
- R46 recheck found remaining duplicate/data-loss/stop blockers.
- Final R46 blocker review reported: **No blockers**.
  - Residual risks: daemon `/pi-extension/event` concurrency is still not integration-tested, and timestamp-based live/history dedupe can still duplicate in odd extension ordering cases.

## Verification

```bash
pnpm --filter ./packages/lyntty-cli exec vitest run --project unit \
  src/pi/runPiExternalMirror.test.ts \
  src/pi/runPiRecovery.test.ts \
  src/pi/piExtensionEvent.test.ts \
  src/daemon/controlServer.piExtension.test.ts \
  src/daemon/activationLock.test.ts
pnpm --filter ./packages/lyntty-cli typecheck
pnpm --filter ./packages/lyntty-cli test -- --run
git diff --check
```

Results:

- Focused CLI tests: 5 files / 42 tests passed.
- Full `lyntty-cli` suite: 88 files / 760 tests passed.
- CLI typecheck passed.
- `git diff --check` passed.
- Final reviewer: no blockers.

## Remaining risks

- No fresh APK/Maestro run was needed because this slice only changes local CLI/daemon/Pi mirror internals and unit-covered behavior.
- Full integration coverage for daemon `/pi-extension/event` concurrency remains a future release-grade E2E target.
- Timestamp-window dedupe is safer than blind dropping but can still duplicate assistant history if Pi extension events arrive in unusual order relative to JSONL writes.
