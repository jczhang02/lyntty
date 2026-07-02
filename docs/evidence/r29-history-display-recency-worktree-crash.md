# R29 Pi history display parity, session recency, and worktree-list crash

Date: 2026-07-02
Task: `lyntty-qmd` — Unify Pi history/live display and session recency.

## User-reported issues

- Historical Pi imports should render like new/live sessions: thinking, tool calls, and tool status should not be flattened away.
- Sessions Home ordering and archived/inactive grouping should depend on last communication time, not creation time.
- APK screenshot `/home/jc/Downloads/Screenshot_20260702_104053_Lyntty (dev).jpg` showed:

```text
Uncaught (in promise, id: 0) TypeError: Cannot read property 'map' of undefined
index.tsx:694
setWorktreeItems(worktrees.map(...))
```

## Root causes

1. `machineWorktreeList()` assumed every daemon returns `{ worktrees }`. If a legacy/malformed response returned a bare array or missing field, app helper returned `undefined`, and `new/index.tsx` crashed on `.map`.
2. `runPiHistory.ts` imported historical assistant messages by collecting all content into one plain text envelope. Historical `thinking` lost `thinking:true`, and historical `toolCall` / `toolResult` did not become the same session-protocol tool envelopes used by live Pi events.
3. Sessions Home list construction sorted/grouped inactive sessions by `createdAt`. Active compact grouping also sorted by `createdAt`. `applyMessages()` did not bump local session `updatedAt`, so recency could stay stale until a later session sync.

## Fix

- Worktree crash:
  - `machineWorktreeList()` now normalizes `{ worktrees }`, legacy bare arrays, and malformed responses into `{ worktrees: [] | rows }`.
- Historical Pi display parity:
  - `runPiHistory.ts` now preserves assistant content order.
  - Historical thinking maps to session-protocol `text` envelopes with `thinking: true`.
  - Historical `toolCall` maps to `tool-call-start` with tool name and args.
  - Historical `toolResult` maps to visible thinking output plus `tool-call-end`; duplicate starts are suppressed when a prior assistant `toolCall` already opened the same call id.
- Session recency:
  - Added pure `sessionRecency.ts` helpers.
  - Sessions Home active/inactive sorting and inactive date grouping now use `updatedAt` / recency.
  - active compact session groups sort by recency.
  - `applyMessages()` bumps `session.updatedAt` from latest incoming message timestamp and rebuilds list view data immediately.

## Verification

```text
pnpm --filter ./packages/lyntty-cli run typecheck
pnpm --filter ./packages/lyntty-cli exec vitest run \
  src/pi/runPiHistory.test.ts \
  src/pi/runPiSessionProtocol.test.ts
# 2 files, 5 tests passed

pnpm --filter ./packages/lyntty-cli exec vitest run \
  src/pi/runPiHistory.test.ts \
  src/pi/runPiSessionProtocol.test.ts \
  src/api/apiSession.test.ts \
  src/api/apiMachine.test.ts
# 4 files, 37 tests passed

pnpm --filter ./packages/lyntty-app run typecheck
pnpm --filter ./packages/lyntty-app exec vitest run \
  sources/sync/piSessionOps.test.ts \
  sources/utils/worktree.test.ts \
  sources/sync/piReplyVisibility.e2e.test.ts \
  sources/sync/sessionRecency.test.ts
# 4 files, 15 tests passed

pnpm --filter ./packages/lyntty-app test
# 64 files, 718 tests passed

pnpm --filter ./packages/lyntty-relay run typecheck
# passed
```

## Regression coverage

- Worktree list wrapper accepts legacy/malformed daemon responses and never returns undefined rows.
- Pi history imports thinking/tool-call/tool-result session-protocol shapes matching live display expectations.
- App normalizes `thinking:true` session-protocol text into a visible thinking message.
- Session recency helpers sort by `updatedAt`, not `createdAt`, and bump from latest message timestamps.

## Remaining limitations

- This is automated code-path verification, not a rebuilt APK/manual retest. The user must restart relay/daemon/Expo or rebuild the dev client to test this exact patch on-device.
- Historical tool result content is preserved as a visible thinking output next to the tool card because current session-protocol `tool-call-end` carries no result payload field.
