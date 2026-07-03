# R35 Pi History/Live Rendering Unification

Date: 2026-07-03
Task: `lyntty-2nd`

## User-reported symptom

Screenshot: `/home/jc/Downloads/Screenshot_20260703_122801_Lyntty (dev).jpg`.

The current long `lyntty: happy fork pi agent support research` session displayed a historical Pi tool result as a giant italic/raw text block, including escaped `\n`, markdown fences, Beads command output, and JSON tail text like `"details":{}`. That is not the live Pi tool-card rendering model.

## Diagnosis

Root cause: historical Pi JSONL replay and live Pi SDK events diverged at tool result mapping.

Before this fix:

- live path: `tool_execution_end` emitted `tool-call-end`; successful final result was not emitted as plain chat text.
- history path: `toolResult` entries emitted a separate `agent text` envelope with `thinking: true`, then emitted `tool-call-end`.
- app path: `thinking: true` text envelopes render as visible thinking text, so large `bash`/Beads outputs appeared as raw italic transcript text instead of tool-card state.

This was confirmed with a red-capable focused test in `packages/lyntty-cli/src/pi/runPiHistory.test.ts` comparing historical tool-call/result visible shape to `PiSessionProtocolMapper` live output. The test failed before the fix because history added an extra `thinking` text event for tool output.

## Changes

Files changed:

- `packages/lyntty-wire/src/sessionProtocol.ts`
- `packages/lyntty-wire/src/sessionProtocol.test.ts`
- `packages/lyntty-cli/src/pi/runPiSessionProtocol.ts`
- `packages/lyntty-cli/src/pi/runPiSessionProtocol.test.ts`
- `packages/lyntty-cli/src/pi/runPiHistory.ts`
- `packages/lyntty-cli/src/pi/runPiHistory.test.ts`
- `packages/lyntty-app/sources/sync/typesRaw.ts`
- `packages/lyntty-app/sources/sync/typesRaw.spec.ts`

Implementation:

- Extended `tool-call-end` session protocol events with optional `result` and `isError` fields.
- Live Pi mapper now places final tool result/error state on `tool-call-end` instead of adding error output as separate thinking text.
- Historical Pi mapper now maps `toolResult` entries to `tool-call-end { result, isError }` and stops emitting successful tool output as separate thinking text.
- App raw sync now maps `tool-call-end.result` to normalized `tool-result.content` and `isError` to `tool-result.is_error`.
- Added compatibility drop for legacy historical `pi-history-*-tool-output` thinking envelopes so existing polluted relay logs do not keep rendering the old raw-text artifact.

## Verification

Red/green focused checks:

```text
pnpm --filter ./packages/lyntty-cli test src/pi/runPiHistory.test.ts
# initially failed before fix: history had extra thinking text for tool result
# after fix: 5 tests passed

pnpm --filter ./packages/lyntty-app test sources/sync/typesRaw.spec.ts
# initially failed before compatibility normalization
# after fix: 60 tests passed
```

Full automated checks:

```text
pnpm --filter ./packages/lyntty-wire test
# 2 files, 19 tests passed

pnpm --filter ./packages/lyntty-app test
# 64 files, 725 tests passed

pnpm --filter ./packages/lyntty-cli test
# 86 files, 745 tests passed

pnpm --filter ./packages/lyntty-cli run typecheck
pnpm --filter ./packages/lyntty-app run typecheck
pnpm --filter ./packages/lyntty-wire run typecheck
# all passed

git diff --check
# passed
```

Release APK E2E:

- Rebuilt release APK with `EXPO_PUBLIC_LYNTTY_SERVER_URL=http://10.0.2.2:3005`.
- Started fresh local relay on `:3005`.
- Installed release APK on emulator.
- Created account manually after Maestro first-run tap flake.
- Paired node through `lyntty://terminal?...` deep link; pairing URL was redacted in artifacts.
- Started daemon with `LYNTTY_HOME_DIR=/tmp/lyntty-r35-node`.
- Sessions Home showed `lyntty: happy fork pi agent support research` with `8062 messages • discovered_local`.
- Opened that session in Session Remote.

Observed fixed rendering:

- `release-e2e/current-session-fixed.png` shows compact `bash` tool-card row for the current historical tool event.
- UI dump `release-e2e/current-session-fixed.xml` does not contain the old raw strings `available work\nbd show`, `details`, or the giant escaped transcript block.

Artifacts:

- `docs/evidence/artifacts/r35-history-live-rendering/release-e2e/current-session-fixed.png`
- `docs/evidence/artifacts/r35-history-live-rendering/release-e2e/current-session-fixed.xml`
- `docs/evidence/artifacts/r35-history-live-rendering/release-e2e/sessions-home.png`
- `docs/evidence/artifacts/r35-history-live-rendering/release-e2e/pair-node.png`
- `docs/evidence/artifacts/r35-history-live-rendering/release-e2e/cli-auth-redacted.log`
- `docs/evidence/artifacts/r35-history-live-rendering/release-e2e/assemble-release-summary.log`

## Remaining risk

- Existing relay messages that were already imported with old `pi-history-*-tool-output` envelopes are hidden at app normalization for compatibility, but not deleted from relay storage.
- Live `tool_execution_update` events can still stream transient output as thinking while a tool is running. Final tool result now lives on `tool-call-end`, matching historical replay semantics.
