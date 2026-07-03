# R39 Legacy Pi Tool Output Current-Session Rendering

Date: 2026-07-03

Task: `lyntty-9zk` — fix user-reported screenshot `/home/jc/Downloads/Screenshot_20260703_192633_Lyntty (dev).jpg` where Session Remote still displayed raw Beads/bash Pi toolResult text such as `available work\nbd show`.

## Diagnosis

The screenshot was not a new Pi-sync failure. It was a display compatibility gap:

- R35/R36 hid legacy `pi-history-*-tool-output` thinking messages during raw sync and normal grouped rendering.
- `ChatList` passes user setting `groupToolCalls` into `useGroupedMessages()`.
- When `groupToolCalls` was disabled, `groupMessagesForDisplay(messages, false)` returned all messages directly and bypassed `isInvisibleMessage()`.
- Therefore already-persisted legacy Pi tool-output thinking rows could still render as raw escaped italic text on phones with grouping disabled or older local settings.

## Fix

Changed `packages/lyntty-app/sources/hooks/useGroupedMessages.ts` so invisible-message filtering always runs even when grouping is disabled:

- `groupMessagesForDisplay(..., false)` now filters `isInvisibleMessage()` before returning standalone message items.
- `groupToolCallsForDisplay(..., false)` does the same for the older tool-list helper.

Added regression coverage in `packages/lyntty-app/sources/hooks/useGroupedMessages.test.ts` proving persisted legacy `pi-history-*-tool-output` thinking text is hidden when grouping is disabled.

## Verification

```bash
pnpm --filter ./packages/lyntty-app exec vitest run sources/hooks/useGroupedMessages.test.ts
# ✓ sources/hooks/useGroupedMessages.test.ts (12 tests)

pnpm --filter ./packages/lyntty-app typecheck
# tsc --noEmit passed

git diff --check
# passed
```

## User action

Expo Dev Client users must reload the JS bundle after this fix. If the phone still shows the old raw text, force-close Lyntty (dev), restart Metro with cache clear, then reopen:

```bash
cd packages/lyntty-app
EXPO_PUBLIC_LYNTTY_SERVER_URL=http://<LAN_IP>:3005 pnpm expo start --host lan -c
```

Release/preview APK users need a rebuilt APK containing this commit.
