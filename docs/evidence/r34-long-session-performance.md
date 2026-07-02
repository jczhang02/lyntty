# R34 Long Pi Session E2E Performance

Date: 2026-07-03
Task: `lyntty-qia`

## Scenario

Chosen many-message Pi session:

- Pi session id: `019f17bb-4492-73cd-b28f-61f993c92089`
- Title: `lyntty: happy fork pi agent support research`
- CWD: `/home/jc/dev/lyntty`
- Message count during APK run: 7,675+ messages
- Reason: large real Pi JSONL session, visible near top of Sessions Home, contains long tool-heavy history.

## What the E2E found

Release APK human-style run opened the long session through Sessions Home and inspected Session Remote display/performance.

Findings:

1. Historical Pi sessions with no visible messages could briefly show `This session is inactive.` before history arrived. This was wrong for Slack-like history loading.
2. Pi lowercase tool names such as `bash`, `grep`, `find`, `ls`, and `web_search` were not all classified for compact tool display. A long `bash` tool input could render as a huge expanded raw JSON/code block in the chat.
3. Sessions sync could coalesce poorly under repeated refreshes and issue overlapping Pi discovery requests, adding avoidable pressure during many-session/long-session E2E.

## Fixes

Files:

- `packages/lyntty-app/sources/-session/SessionView.tsx`
- `packages/lyntty-app/sources/utils/sessionUtils.ts`
- `packages/lyntty-app/sources/utils/sessionUtils.test.ts`
- `packages/lyntty-app/sources/utils/toolDisplay.ts`
- `packages/lyntty-app/sources/utils/toolDisplay.test.ts`
- `packages/lyntty-app/sources/sync/sync.ts`
- translation files under `packages/lyntty-app/sources/text/translations/`

Changes:

- Added `shouldShowPiHistoryLoading()` and Session Remote loading copy for empty Pi history sessions with known historical messages.
- Suppressed the misleading inactive-session hint while Pi history is still loading.
- Opened synthetic Pi history rows immediately before node attach/spawn completes, while mirror/spawn work continues in the background.
- Made daemon historical-session open check the requested directory first before falling back to machine-wide Pi session discovery.
- Added Pi-native lowercase tool names to compact display classification:
  - `bash` as terminal;
  - `ls` as read;
  - `grep`/`find` as search;
  - `web_search`/`fetch_content` as web.
- Coalesced in-flight Pi session discovery fetches so repeated session refreshes reuse the same Promise instead of starting overlapping page scans.

## Verification

Automated:

```text
pnpm --filter ./packages/lyntty-app test sources/utils/toolDisplay.test.ts sources/utils/sessionUtils.test.ts sources/sync/piSessionOpen.test.ts sources/sync/piDiscoveredSessions.test.ts
# 4 files, 20 tests passed

pnpm --filter ./packages/lyntty-app test
# 64 files, 724 tests passed

pnpm --filter ./packages/lyntty-app run typecheck
# passed

pnpm --filter ./packages/lyntty-cli test
# 86 files, 745 tests passed

pnpm --filter ./packages/lyntty-cli run typecheck
# passed

EXPO_PUBLIC_LYNTTY_SERVER_URL=http://10.0.2.2:3005 \
CCACHE_DISABLE=1 CMAKE_C_COMPILER_LAUNCHER= CMAKE_CXX_COMPILER_LAUNCHER= \
./gradlew assembleRelease --no-daemon
# packages/lyntty-app/android/app/build/outputs/apk/release/app-release.apk rebuilt
```

APK/manual E2E:

- Started local relay on `:3005` with `LYNTTY_HOME_DIR=/tmp/lyntty-r39-long-node`.
- Cleared and launched release APK `dev.jczhang.lyntty.dev`.
- Created first-run account.
- Paired CLI through `lyntty://terminal?...` deep link.
- Started daemon.
- Confirmed Sessions Home showed the chosen session with `7675 messages • discovered_local`.
- Opened the long session from Sessions Home.

Observed after fixes:

- `visual-timing2/after-300ms.png` shows Session Remote already entered by the 300ms screenshot capture.
- `open-long/current.png` shows compact `bash` tool row instead of a huge expanded raw tool-input block.
- No `This session is inactive.` placeholder was captured during the long-session open after the loading-state fix.

Artifacts:

- `docs/evidence/artifacts/r34-long-session-performance/final-fresh/08-sessions.png`
- `docs/evidence/artifacts/r34-long-session-performance/final-fresh/open-long/current.png`
- `docs/evidence/artifacts/r34-long-session-performance/final-fresh/visual-timing2/after-300ms.png`
- `docs/evidence/artifacts/r34-long-session-performance/assemble-release-after-list-coalesce.log`

## Remaining risk

The exact millisecond measurement uses adb screenshots/uiautomator and is noisy. Visual proof is stronger here: the 300ms screenshot already shows Session Remote for the selected 7.6k-message session. Further production confidence should use a purpose-built native performance marker rather than adb polling.
