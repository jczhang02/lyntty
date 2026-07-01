# R24 Active synthetic Pi row attach behavior

Date: 2026-07-02
Task: `lyntty-b8n` — Review active synthetic Pi row attach behavior.

## Problem

Read-only review found a Sessions Home edge case:

- Pi discovery can produce a synthetic row with `state: active_runtime`, `active: true`, and no matching relay session id.
- Inactive synthetic rows used the historical-session open path: spawn/open the Pi JSONL session through `spawn-lyntty-session`, create an optimistic relay session, then navigate to the real relay session id.
- Active rows render through `ActiveSessionsGroupCompact`, whose `CompactSessionRow` previously navigated directly to `session.id`.
- For synthetic rows that id is `pi-local:<machineId>:<piSessionId>`, not a relay session id, so tapping could open a fake/deleted session screen or try actions against a fake id.

## Fix

- Added shared Pi synthetic open helpers:
  - `packages/lyntty-app/sources/sync/piSessionOpenRequest.ts`
  - `packages/lyntty-app/sources/sync/piSessionOpen.ts`
  - `packages/lyntty-app/sources/hooks/useOpenPiDiscoveredSession.ts`
- Reused the same open path from both inactive and active synthetic rows:
  - build `spawn-lyntty-session` request with `{ agent: 'pi', sessionId: piSessionId }`,
  - insert optimistic active relay session,
  - navigate to returned real relay `sessionId`,
  - refresh sessions asynchronously.
- Disabled context-menu/long-press/swipe archive behavior for synthetic active rows so fake ids are not sent to `sessionKill` or actions popovers.
- Added regression coverage for:
  - active runtime synthetic rows being `active: true`, `presence: 'online'`, and `piSynthetic: true`,
  - synthetic-row spawn request construction and `~/...` optimistic path expansion.

## Verification

```text
pnpm --filter ./packages/lyntty-app run typecheck
pnpm --filter ./packages/lyntty-app exec vitest run \
  sources/sync/piSessionOps.test.ts \
  sources/sync/piDiscoveredSessions.test.ts \
  sources/utils/sessionUtils.test.ts
# 3 files, 10 tests passed
```

## Remaining limitations

- This is a focused app-side regression fix. A full APK repro for an `active_runtime` synthetic row without a relay row was not run in this slice.
- The daemon still does not have a true Pi attach/resume RPC; opening a Pi JSONL session uses the existing spawn/open path and can still hit activation-lock policy if another Pi runtime owns the same cwd.
