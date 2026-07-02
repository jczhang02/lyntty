# R34 External Pi Mirror and CLI Baseline

Date: 2026-07-03
Task: `lyntty-bee`

## Scope

Follow-up after the Slack-like Pi lifecycle work to close two remaining confidence gaps:

- prove the ordinary external Pi JSONL mirror forwards new external writes into Lyntty session-protocol output, not only raw entry collection;
- re-run the full `lyntty-cli` unit baseline after the earlier watcher/session-scanner failures.

## Changes

### External Pi mirror session-protocol coverage

File:

- `packages/lyntty-cli/src/pi/runPiExternalMirror.test.ts`

Added a focused integration-style unit test for `startPiExternalMirror()`:

- seeds a Pi JSONL file with an existing entry;
- appends a new external user entry;
- advances the quiet window;
- verifies the mirror emits a session-protocol envelope with stable id `pi-history-u2-user` and text payload `external mobile-visible line`;
- verifies `ApiSessionClient.flush()` is called exactly once.

This covers the production path used by daemon `ensure-pi-session-mirror`: JSONL append -> `mapPiSessionHistoryToEnvelopes()` -> `sendSessionProtocolMessage()` -> `flush()`.

## Verification

```text
pnpm --filter ./packages/lyntty-cli test src/pi/runPiExternalMirror.test.ts
# 1 file, 4 tests passed

pnpm --filter ./packages/lyntty-cli run typecheck
# passed

pnpm --filter ./packages/lyntty-cli test
# 86 files, 745 tests passed
```

The previous full-CLI failures in `src/claude/utils/sessionScanner.test.ts` and `src/modules/watcher/startFileWatcher.test.ts` did not reproduce in the fresh full run; they passed as part of the 745-test baseline.

## Notes / remaining risk

- This validates the mirror's session-protocol forwarding path deterministically. A separate human typing in an interactive desktop `pi` TUI was not run in this slice, but the production mirror logic is now covered past raw JSONL collection and the release APK path was already validated in R33/R35 evidence.
- No product code changed; only mirror coverage and evidence were added.
