# R59 Missing Pi-history rows and Stop & Archive

Date: 2026-07-06

## Scope

- Beads `lyntty-8zq`: hide/remove relay-only or daemon-remembered Pi sessions when local Pi JSONL/history cannot be proven.
- Beads `lyntty-31i`: make Sessions Home / session actions Stop & Archive stop active Pi sessions before archiving, without falling through to archive when stop fails.

## Changes

### Missing Pi-history rows

- `lynttyd` Pi discovery no longer surfaces relay-only missing-local records as product-visible Pi sessions.
- App Pi discovery merge filters:
  - `missing_local_history` relay rows are hidden unconditionally.
  - non-active synthetic Pi rows with `0` messages are hidden.
- Machine Detail uses the same exported visibility predicate as Sessions Home.
- User-visible session-list labels no longer expose `history_gap` / `missing_local_history`; those remain diagnostic/dev evidence states only.

### Stop & Archive

- Added shared app action `stopAndArchiveSession()` and routed Sessions Home, active-session compact rows, native menus, session info, and quick actions through it.
- Active sessions are stopped before archive; stop failure does **not** archive.
- Stale relay `active=false` but `runtimeOwner=pi-extension` + `controlState=ready` sessions are still treated as stoppable.
- Ordinary Pi extension sessions register `killSession` on their relay session RPC.
- Stop & Archive uses a local-only `internal_shutdown` command over the authenticated lynttyd ⇄ Pi extension channel.
- `internal_shutdown` is not parsed from mobile text and is documented outside the public phone command whitelist.
- `killSession` now waits for Pi extension `session_shutdown` / mirror removal before reporting stop success to the app.

## Verification

### Automated

- `pnpm --filter ./packages/lyntty-cli test -- src/pi/piExtensionEvent.test.ts src/daemon/controlServer.piExtension.test.ts`
  - Passed: 90 files / 779 tests.
- `pnpm --filter ./packages/lyntty-app test -- sources/sync/archiveSessionAction.test.ts sources/sync/piDiscoveredSessions.test.ts`
  - Passed: 79 files / 781 tests.
- `pnpm --filter ./packages/lyntty-app test -- sources/sync/piDiscoveredSessions.test.ts`
  - Passed: 79 files / 780 tests during release-APK blocker fix validation.
- `pnpm --filter ./packages/lyntty-app typecheck`
  - Passed.
- `pnpm --filter ./packages/lyntty-relay test`
  - Passed: 14 files / 93 tests.
- `pnpm --filter ./packages/lyntty-wire test`
  - Passed: 2 files / 19 tests.
- `pnpm --filter ./packages/lyntty-agent test`
  - Passed: 9 files / 227 tests.
- `git diff --check`
  - Passed before final evidence write; rerun in final audit.

### Isolated Pi extension safety

- No live global Pi extension was installed or reloaded.
- Isolated install smoke:
  - `HOME=/tmp/lyntty-r59-ext-home-* LYNTTY_HOME_DIR=/tmp/lyntty-r59-ext-lyntty-* node packages/lyntty-cli/bin/lyntty.mjs remote install`
  - Generated extension path: temp `$HOME/.pi/agent/extensions/lyntty/index.ts`.
  - `pnpm exec tsx <temp extension index.ts>` exited `0`, proving generated source compiles/loads without touching the live Pi extension.

### Release-style APK / emulator

- Built non-production release-style APK:
  - `EXPO_PUBLIC_LYNTTY_SERVER_URL=http://10.0.2.2:3005 CCACHE_DISABLE=1 CMAKE_C_COMPILER_LAUNCHER= CMAKE_CXX_COMPILER_LAUNCHER= ./gradlew :app:assembleRelease --no-daemon`
  - Result: `BUILD SUCCESSFUL`.
- Started fresh local relay in a temporary `LYNTTY_HOME_DIR` and installed/relaunched `dev.jczhang.lyntty.dev` release APK.
- Maestro first-run account creation passed.
- Maestro terminal pairing passed; pairing artifacts were redacted.
- Injected a relay-only Pi session with:
  - `piSessionId=019f1d28-1514-71f1-b70b-947e69278d5d`
  - `piDiscoveryState=missing_local_history`
  - `piMessageCount=0`
  - no local JSONL history.
- Before the final filter tightening, APK UI XML reproduced the bad row as visible.
- After rebuilding/reinstalling with the final fix, APK UI XML showed:
  - `019f1d28-1514-71f1-b70b-947e69278d5d`: absent
  - `history_gap`: absent
  - `missing_local_history`: absent
  - `Sessions`: present

Artifacts: `docs/evidence/artifacts/r59-missing-history-stop-archive/`.

### Review

A read-only review found blockers after the initial implementation:

1. `shutdown` conflicted with the documented public phone command whitelist.
2. Pi extension ack could report success before actual process shutdown.
3. Stop decision used only `session.active` and could miss stale active Pi-extension rows.
4. Machine Detail duplicated the discovery visibility filter.

Follow-up fixes:

- Renamed the maintenance command to `internal_shutdown`, documented it as local-only, and kept user-visible `shutdown` out of scope.
- `killSession` now waits for `session_shutdown` / mirror removal before success.
- `shouldStopBeforeArchive()` now treats `runtimeOwner=pi-extension` + `controlState=ready` as stoppable even when relay `active` is stale false.
- Machine Detail imports the shared `shouldShowPiDiscoveredRecord()` predicate.

## Not run / limitations

- No live global Pi extension install/reload was performed, per project safety rules.
- Full real Pi process shutdown E2E was not run because the isolated temp Pi HOME has no provider credentials; direct `pi -p --no-tools` in temp HOME failed with `No API key found for the selected model`.
- The Stop & Archive behavior is covered by app unit tests, daemon/control-server command tests, generated-extension compile smoke, and code review rather than a live Pi TUI shutdown smoke.

## Residual risk

- If a live Pi extension accepts `internal_shutdown` but Pi never emits `session_shutdown`, archive is blocked with an explicit retry/reload message rather than hiding a still-running session.
- Existing old app-local caches may need a refresh/relaunch to remove already-loaded missing-local rows; sync merge prevents them from being reintroduced.
