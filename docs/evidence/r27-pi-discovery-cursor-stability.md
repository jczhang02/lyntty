# R27 Pi discovery cursor stability

Date: 2026-07-02
Task: `lyntty-x2z` — Fix Pi discovery pagination cursor stability.

## Problem

Pagination review found that `list-pi-sessions` used numeric offset cursors over a mutable local Pi session list. If a new or modified Pi session appeared before the next page, the offset could shift and page 2 could duplicate or skip rows.

## Fix

- Replaced offset cursors in `discoverLocalPiSessionsPage()` with an opaque keyset cursor.
- Cursor payload stores the last emitted row's discovery sort key:
  - active-runtime priority,
  - modified timestamp,
  - Pi session id.
- Next page filters by this key rather than by array index.
- This preserves forward progress when newer sessions are inserted before the cursor between page requests.
- Active-runtime ordering remains part of the sort key, so active rows are still prioritized before pagination slices.

## Verification

```text
pnpm --filter ./packages/lyntty-cli run typecheck
pnpm --filter ./packages/lyntty-cli exec vitest run \
  src/pi/runPiRecovery.test.ts \
  src/api/apiMachine.test.ts \
  src/api/apiMachine.codexFork.test.ts
# 3 files, 25 tests passed

pnpm --filter ./packages/lyntty-app run typecheck
pnpm --filter ./packages/lyntty-app exec vitest run \
  sources/sync/piSessionOps.test.ts \
  sources/sync/piDiscoveredSessions.test.ts
# 2 files, 7 tests passed
```

## Regression coverage

- Opaque newest-first cursor pagination.
- Cursor remains stable when a newer Pi session appears before page 2.
- Active runtime rows remain ordered before pagination slices.

## Remaining limitations

- This is keyset pagination, not a full retained snapshot. If an already-unseen row mutates to sort before the cursor between page requests, it may be picked up by a future refresh rather than the current page walk. This is still safer than offset cursors and avoids duplicate/skip caused by simple insertions before the cursor.
