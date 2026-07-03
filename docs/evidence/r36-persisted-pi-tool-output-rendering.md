# R36 Persisted Pi Tool-Output Rendering Compatibility

Date: 2026-07-03
Task: `lyntty-dsh`

## Problem

User reported no visible change after R35. R35 fixed raw session-protocol normalization and future historical imports, but existing app-local normalized rows can already contain legacy messages like:

```text
id: pi-history-...-tool-output
kind: agent-text
isThinking: true
text: available work\nbd show ... {"details":{}}
```

Those rows no longer pass through raw sync normalization, so the R35 raw-envelope filter could not affect already-stored Session Remote timelines.

## Fix

Changed `packages/lyntty-app/sources/hooks/useGroupedMessages.ts`:

- added render-grouping compatibility filter for persisted legacy Pi history tool-output thinking messages;
- hides only `agent-text` messages with `isThinking === true` and id matching `pi-history-*-tool-output`;
- preserves normal thinking messages and new `pi-history-*-tool-error-output` error text.

Added regression test in `packages/lyntty-app/sources/hooks/useGroupedMessages.test.ts` proving persisted legacy raw text is excluded from display groups.

## Verification

```text
pnpm --filter ./packages/lyntty-app test sources/hooks/useGroupedMessages.test.ts sources/sync/typesRaw.spec.ts
# 2 files, 71 tests passed

pnpm --filter ./packages/lyntty-app run typecheck
# passed

pnpm --filter ./packages/lyntty-app test
# 64 files, 726 tests passed
```

## User action

If using Expo Dev Client, reload JS (`r` in Metro, or force-close/reopen app). If using installed release APK, install a build containing this commit.
