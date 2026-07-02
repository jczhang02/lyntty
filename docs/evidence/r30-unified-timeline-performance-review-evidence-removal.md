# R30 Unified Timeline Performance + Review Evidence Removal

Date: 2026-07-02
Issue: `lyntty-vhl`

## Scope

- Removed `Review Evidence` from active APK UI/source with no replacement panel.
- Stopped Pi runtime/debug service messages from entering chat/session protocol.
- Changed historical Pi open from full JSONL import-before-display to app-triggered `pi-history-page` paging.
- Kept live/new/historical Pi display on same session-protocol path for text, thinking, tool calls, and tool results.
- Added older-history retry UI for upward-scroll failures.
- Hardened `pi-history-page` persistence, session RPC scope, and history page payload size.

## Key changes

- `packages/lyntty-app/sources/-session/SessionView.tsx`
  - Removed `ReviewEvidencePanel` render and reducer input.
- `packages/lyntty-app/sources/components/ReviewEvidencePanel.tsx`
- `packages/lyntty-app/sources/sync/reviewEvidence.ts`
- `packages/lyntty-app/sources/sync/reviewEvidence.test.ts`
  - Deleted active Review Evidence code/tests.
- `packages/lyntty-cli/src/pi/runPi.ts`
  - Registers session RPC `pi-history-page`.
  - Sets `piHistoryHasMore` metadata for requested historical Pi sessions instead of pushing all history on process open.
  - Flushes history envelopes and awaits metadata persistence before returning RPC cursor state.
  - Logs rejected local-only slash commands and Pi command failures instead of sending service/debug messages to the app.
- `packages/lyntty-cli/src/pi/runPiHistory.ts`
  - Adds tail-first renderable Pi history paging.
  - Preserves structured text/thinking/tool-call/tool-result envelopes.
  - Keeps multi-tool assistant turns open until all mapped tool results arrive.
  - Includes parent assistant entry when a page starts at a tool result.
  - Caps serialized history page payloads and falls back to a compact truncated envelope for pathological entries.
- `packages/lyntty-app/sources/sync/sync.ts`
  - Initial message fetch stays latest-page only.
  - Older Pi history loads through `pi-history-page` on upward scroll or empty initial historical session.
  - Background draining of long histories removed.
- `packages/lyntty-app/sources/sync/storage.ts`
  - Revives `hasMoreOlder` when later session metadata reports `piHistoryHasMore`.
  - Tracks older-history loading errors.
- `packages/lyntty-app/sources/components/ChatList.tsx`
  - Adds top retry affordance: `Could not load older messages · Retry`.
  - Avoids auto-retry storm while an older-load error is present.
- `packages/lyntty-relay/sources/app/api/socket/rpcHandler.ts`
  - User-scoped session RPC calls are allowlisted; `pi-history-page` allowed, undeclared session/machine methods denied.

## Review rounds

- `lyntty_unified_timeline_review`: 4 reviewer agents, found blockers around older-history reachability, duplicate page cursor advancement, tool result pairing, session RPC authorization, payload caps, and persistence race.
- `lyntty_postfix_review`: 3 reviewer agents, found remaining blockers around awaited metadata persistence, user-scoped machine method bypass, page-boundary tool results, maxBytes guarantee, and initial history push.
- `lyntty_r30_final_review`: 3 reviewer agents after fixes; blockers reported as none. Non-blocking risks remained around broader live APK validation and release UX, not code-blocking for this slice.

## Verification

Passed:

```text
pnpm --filter ./packages/lyntty-cli test src/pi/runPiHistory.test.ts src/pi/runPiSessionProtocol.test.ts src/pi/runPiControl.test.ts
# 3 files, 16 tests passed

pnpm --filter ./packages/lyntty-app test
# 63 files, 716 tests passed

pnpm --filter ./packages/lyntty-cli test
# CLI build/typecheck plus full unit suite passed

pnpm --filter ./packages/lyntty-relay test
pnpm --filter ./packages/lyntty-wire test
pnpm --filter ./packages/lyntty-agent test
pnpm --filter ./packages/lyntty-relay typecheck
pnpm --filter ./packages/lyntty-wire typecheck
pnpm --filter ./packages/lyntty-agent typecheck
git diff --check
# passed
```

Focused runtime probes also verified:

- Multi-tool historical assistant entry emits one shared turn and one final `turn-end`.
- Oversized single-entry user history page stays under 16 KB after truncation.
- Oversized multi-entry assistant page trims to capped payload and preserves cursor.
- Pathological many-tool assistant page falls back to compact truncated agent turn under cap.

## Not run

- Fresh Android APK/Maestro run for this exact R30 diff.
- Real phone smoke for progressive upward-scroll history paging.

Reason: R30 changed TypeScript protocol/sync/UI logic and was covered by full package automation plus multi-round workflow review; APK/real-device regression remains recommended before release build.
