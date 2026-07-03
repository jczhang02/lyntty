# R41 Complex E2E Quality Pass

Date: 2026-07-03

Beads: `lyntty-3hv`

## Grill decisions covered

Primary target: release-style Android APK. Dev Client remains only a debug aid.

P0/P1 concerns from the grill:

- current ordinary `pi` session live mirror;
- polluted/legacy timeline should not show raw Pi tool payloads;
- long-history session should open and remain usable;
- node/session state should distinguish active/history/offline/archive semantics;
- historical open should not be blocked by history loading;
- tool elapsed time must stop when tool completion arrives;
- visual QA should catch misleading inactive/archive text and raw payload blocks;
- multiple review rounds must run before accepting changes.

## Fixes made during R41

### 1. Out-of-order tool completion / elapsed timer

Files:

- `packages/lyntty-app/sources/sync/reducer/reducer.ts`
- `packages/lyntty-app/sources/sync/reducer/reducer.spec.ts`
- `packages/lyntty-cli/src/pi/runPiSessionProtocol.ts`
- `packages/lyntty-cli/src/pi/runPiSessionProtocol.test.ts`

Problem: if a session-protocol `tool-result` reached the app before the matching `tool-call`, the reducer dropped it. When the later `tool-call` arrived, the tool stayed `running`, so `ToolView` continued to show an increasing elapsed timer even though the tool had completed.

Fix:

- added bounded pending tool-result storage in reducer;
- when the matching tool-call later arrives, apply the pending result immediately;
- duplicate late results no longer override completed tools;
- pending cache capped at 200 orphan results.
- stopped mapping live Pi `tool_execution_update` partial payloads into chat thinking text; only the final `tool_execution_end.result` is emitted into the folded tool card.

Verification:

- reducer race regression added;
- focused reducer/grouping tests passed;
- full app test suite passed.

### 2. Active/history/offline/archive text semantics

Files:

- `packages/lyntty-app/sources/-session/SessionView.tsx`
- `packages/lyntty-app/sources/text/_default.ts`
- `packages/lyntty-app/sources/text/translations/*.ts`

Problem: Lyntty UI reused `inactiveArchived` for disconnected, history-only, and archive-like states. That made non-open historical Pi sessions feel archived, even though product semantics are:

- `Active on computer`: ordinary `pi` / Pi extension producer is live;
- `Active via Lyntty`: Lyntty-managed headless producer is live;
- `History only`: JSONL history exists but no live producer;
- `Computer offline`: node/daemon is offline;
- `Archived`: explicit user archive/hide action only.

Fix:

- added Session Remote hint resolver:
  - explicit `lifecycleState: archived` / `archivedBy` -> archived copy;
  - Pi session + offline machine -> computer offline copy;
  - Pi session + machine online/unknown -> history-only copy;
- changed session-list toggle copy from `Show/Hide archived` to `Show/Hide history` to avoid implying all inactive Pi histories are archived;
- added fallback strings for all translations, with polished English and zh-Hans strings.

### 3. Polluted/current mirrored tool payload display

R39/R40 already fixed most app-side compatibility filters before the R41 run. R41 E2E revalidated that raw payload markers are absent from the current ordinary Pi mirrored session and the long-history session XML.

Markers checked:

- `\"details\"` / `"details":{}`;
- `beads.role not configured`;
- `available work`;
- large escaped Beads/GPG payload text.

## Automated verification

```bash
pnpm --filter ./packages/lyntty-app exec vitest run \
  sources/sync/reducer/reducer.spec.ts \
  sources/hooks/useGroupedMessages.test.ts
# 2 files, 69 tests passed

pnpm --filter ./packages/lyntty-app test -- --run
# 64 files, 729 tests passed

pnpm --filter ./packages/lyntty-app typecheck
# tsc --noEmit passed

pnpm --filter ./packages/lyntty-cli exec vitest run src/pi/runPiSessionProtocol.test.ts
# 1 file, 4 tests passed

pnpm --filter ./packages/lyntty-cli typecheck
# tsc --noEmit passed

git diff --check
# passed
```

Release-style APK rebuild:

```bash
cd packages/lyntty-app/android
EXPO_PUBLIC_LYNTTY_SERVER_URL=http://10.0.2.2:3005 APP_ENV=development \
CCACHE_DISABLE=1 CMAKE_C_COMPILER_LAUNCHER= CMAKE_CXX_COMPILER_LAUNCHER= \
  ./gradlew :app:assembleRelease --no-daemon
# BUILD SUCCESSFUL
```

## Release APK E2E

Environment:

- emulator: `emulator-5554` / AVD `lyntty-api35`;
- relay: fresh local `lyntty server --host 0.0.0.0 --port 3005 --no-persist`;
- APK: `packages/lyntty-app/android/app/build/outputs/apk/release/app-release.apk`;
- app id: `dev.jczhang.lyntty.dev`;
- node home: `/tmp/lyntty-e2e-r41-node2`.

### Passed

1. First-run account creation

```bash
scripts/e2e/run-maestro.sh e2e/maestro/01_first_run.yml
# passed, 13s
```

2. Terminal deep-link pairing

```bash
scripts/e2e/run-maestro.sh e2e/maestro/02_pair_node.yml
# prepare passed, accept passed, CLI auth exited 0
```

3. Ordinary direct `pi` current-session live mirror

Command:

```bash
LYNTTY_HOME_DIR=/tmp/lyntty-e2e-r41-node2 \
pi -p --no-tools --name "r41 plugin live R41_PLUGIN_LIVE_204627" \
  "Reply exactly R41_PLUGIN_LIVE_204627"
```

Observed:

- local Pi printed `R41_PLUGIN_LIVE_204627`;
- Sessions Home showed row `r41 plugin live R41_PLUGIN_LIVE_204627`;
- Session Remote showed prompt + assistant reply + `online` status;
- raw tool payload markers were absent from `plugin-live-session.xml`.

This validates:

```text
ordinary pi -> global Lyntty Pi extension -> local lynttyd -> relay -> release APK
```

4. Long-history session open/display

Maestro `Open R41 long history session` passed. The 9k+ message session row was visible:

```text
lyntty: happy fork pi agent support research
~/dev/lyntty • 9238 messages • discovered_local
```

The flow opened the row and reached a usable state with `Type a message ...` visible. Raw legacy payload markers were absent in captured XML.

5. Offline/visual state smoke

After daemon stop, the app no longer showed the current ordinary Pi row as active. This confirms the active row depends on a live node/session producer, not merely historical JSONL presence. More precise offline-copy automation remains a follow-up because the fresh no-persist relay/app session list was empty after daemon stop.

## Found issues / follow-ups

1. Historical long-session exact-token reply is not a reliable E2E assertion.

The standard `03_history_send_reply.yml` with `R41_E2E_OK` failed once after the long historical session entered `synthesizing…`. Daemon logs showed the headless Pi runtime executing git/status shell RPCs in `/home/jc/dev/lyntty`, so the prompt reached a live runtime, but the long context caused the agent to continue task-like behavior instead of returning the exact token within the 180s window.

Treatment in R41:

- do not use long historical sessions as an exact-token assistant assertion;
- keep exact-token validation on ordinary direct `pi` plugin sessions;
- use long-history flows for open/display/performance/raw-payload checks.

2. Pairing success modal can linger if the flow does not tap OK.

During an earlier failed run, a stale `Pair Node`/success modal state interfered with later flows. The existing runner handles this in most cases, but R41 evidence keeps the failed artifacts so this can be hardened in future Maestro scripts.

3. Physical device smoke not run.

`adb devices` showed only `emulator-5554`. No physical Android device was available in this run.

## Review rounds

- Workflow review `r41_parallel_review` ran three read-only subagents:
  - state semantics/headless lifecycle audit;
  - tool duration/rendering audit;
  - E2E scenario plan.
- Reviewer subagent `f93eb0c7-075f-485` found no blockers. Its non-blocking suggestions led to:
  - avoiding `machine === null` being treated as offline;
  - adding a cap to pending orphan tool results.

## Artifacts

`docs/evidence/artifacts/r41-complex-e2e/` includes:

- release APK install/clear logs;
- first-run and pairing Maestro artifacts;
- failed historical exact-token run artifacts;
- ordinary direct `pi` live-mirror XML/logs;
- long-history open XML/logs;
- daemon/relay logs;
- redacted auth logs.

Pairing URLs in artifacts are redacted as `lyntty://terminal?<redacted-public-key>`.

## Result

Pass with documented follow-ups. R41 fixed product-impacting app bugs discovered by E2E/review and validated the core current ordinary `pi` live mirror on release-style APK.
