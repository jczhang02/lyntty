# R21 Long History Outbox Order

## Finding

R20 code review found a high-confidence ordering bug for long Pi history imports.

`ApiSessionClient.flushOutbox()` sent the newest pending batch first. For a long chronological history import, for example 120 session-protocol envelopes, relay seq allocation became chunk-reversed:

1. envelopes 71-120 got seq 1-50
2. envelopes 21-70 got seq 51-100
3. envelopes 1-20 got seq 101-120

The app's latest-message paging can then open the wrong history window.

## Fix

`packages/lyntty-cli/src/api/apiSession.ts`

- `flushOutbox()` now drains FIFO from the front of `pendingOutbox`.
- This preserves enqueue order across 50-message POST batches.
- Live small batches still behave the same; long backfills now keep relay seq aligned with original conversation order.

Regression:

`packages/lyntty-cli/src/api/apiSession.test.ts`

- Added `flushes long outbox batches in enqueue order`.
- Seeds 120 queued messages.
- Verifies POST batches are `1-50`, `51-100`, `101-120`.
- Verifies `lastSeq` advances to 120.

## Verification

```bash
pnpm --filter ./packages/lyntty-cli run typecheck
pnpm --filter ./packages/lyntty-cli exec vitest run \
  src/api/apiSession.test.ts \
  src/pi/runPiHistory.test.ts \
  src/pi/runPiRecovery.test.ts
pnpm --filter ./packages/lyntty-cli test -- --run
```

Results:

- Focused CLI tests: 43 passed.
- Full CLI unit suite: 82 files / 723 tests passed.
- `git diff --check` passed.

## Related review notes

The same code review also reported the redacted `~` synthetic Pi path issue; that was already fixed and APK-verified in `ccad918 fix(pi): preserve cwd for history sessions`.

Remaining lower-confidence follow-up: active synthetic Pi row attach/takeover behavior if an active runtime exists but no matching relay row is present in app storage.
