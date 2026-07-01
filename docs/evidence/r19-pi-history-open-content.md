# R19 Pi History Open Content

## User-reported bug

Opening a discovered historical Pi session from `Sessions Home`, for example `jc: pi sum calculation session`, showed the session as deleted on the phone and did not show existing session content/messages.

## Root cause

Two separate gaps:

1. **Navigation race**: tapping a synthetic local Pi history row spawned a real relay session, then navigated immediately to `result.sessionId`. The app often had not fetched/applied that relay session yet, so `SessionView` saw no local session record and rendered `Session deleted`.
2. **No history import**: the runtime attached to the local Pi JSONL, but Lyntty did not import existing Pi JSONL entries into relay/session-protocol messages. The opened session could receive new messages, but old content was absent.

## Fix

### App: optimistic session record before navigation

`packages/lyntty-app/sources/components/SessionsList.tsx`

- When a synthetic Pi history row opens successfully, the app now creates an optimistic active relay-session record in local storage before navigation.
- This prevents the `Session deleted` screen while the server/session sync catches up.
- `sync.refreshSessions()` runs after navigation in the background.

### App: row metadata support

`packages/lyntty-app/sources/sync/storage.ts`

- `SessionRowData` now carries `piFirstMessage` and `piHasHistoryGap` so optimistic real-session metadata preserves the discovered Pi row's history context.

### CLI: import Pi JSONL history into session protocol

`packages/lyntty-cli/src/pi/runPiHistory.ts`
`packages/lyntty-cli/src/pi/runPi.ts`

- When `LYNTTY_PI_SESSION_ID` is used, `runPi` reads `piRuntime.session.sessionManager.getEntries()`.
- Pi JSONL history entries are mapped to Lyntty session protocol envelopes:
  - Pi user messages -> `role: user`, `text`
  - Pi assistant messages -> agent turn start/text/turn end
  - Pi tool results -> visible thinking text
- Imported history is sent to relay before the normal runtime-connected service message.

## Verification commands

```bash
pnpm --filter ./packages/lyntty-cli run typecheck
pnpm --filter ./packages/lyntty-cli exec vitest run \
  src/pi/runPiHistory.test.ts \
  src/pi/runPiRecovery.test.ts \
  src/api/apiMachine.codexFork.test.ts

pnpm --filter ./packages/lyntty-app run typecheck
pnpm --filter ./packages/lyntty-app exec vitest run \
  sources/sync/piDiscoveredSessions.test.ts \
  sources/sync/piSessionOps.test.ts \
  sources/utils/sessionUtils.test.ts
```

Results:

- CLI typecheck passed.
- CLI focused tests: 21 passed.
- App typecheck passed.
- App focused tests: 7 passed.

## Human-style APK E2E

Environment:

- Emulator: `emulator-5554`
- Fresh relay: `LYNTTY_HOME_DIR=/tmp/lyntty-e2e-r19-relay lyntty server --host 0.0.0.0 --port 3005 --reset --no-persist`
- App: Expo dev client against `http://192.168.100.21:3005`
- Fresh node: `LYNTTY_HOME_DIR=/tmp/lyntty-e2e-r19-node`

Validated:

1. Created fresh mobile account.
2. Paired fresh node by terminal deep link.
3. Started `lynttyd`.
4. `Sessions Home` showed node-local Pi history, including `jc: pi sum calculation session`.
5. Opened `jc: pi sum calculation session`.
6. Phone did **not** show `Session deleted`.
7. Session Remote showed imported historical content:
   - `Imported 8 historical Pi session events from 019f1ce6-aee1-72b5-8020-178c4c499320.`
   - existing history content such as `Interpreting user requests` and `R18_PONG`
8. Sent `reply exactly R19_OK` from phone.
9. Pi replied `R19_OK` on phone.
10. Logcat fatal scan found no Lyntty/ReactNative fatal errors.

Key artifacts:

- `docs/evidence/artifacts/r19-pi-history-open-content/10-sessions-history.png` — Sessions Home shows Pi history.
- `docs/evidence/artifacts/r19-pi-history-open-content/13-opened-history-after-fix.png` — opened historical session shows imported content, not deleted.
- `docs/evidence/artifacts/r19-pi-history-open-content/15-r19-ok.png` — phone-to-Pi-to-phone message works after opening history.

## Remaining limitations

- History import maps current Pi JSONL text/tool-result content into Lyntty session protocol; richer Pi-specific artifacts/branch UI are still future work.
- This is dev-client APK E2E, not release APK E2E.
