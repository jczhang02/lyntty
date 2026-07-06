# R61 Duplicate computer/user messages in Session Remote

Date: 2026-07-06

## Scope

- Beads `lyntty-l1y`: duplicate `Computer`/user bubbles in mobile Session Remote.
- User screenshot: `/home/jc/Downloads/Screenshot_20260706_180234_Lyntty (dev).jpg`.
- Symptom: computer-origin Pi input appears twice, e.g. two identical `说明 59, 60 修改的都是什么?` bubbles and two identical `说明 59, 60 做的都是 什么问题和事情?` bubbles.

## Workflow review result

A workflow review ran four read-only investigation lanes:

- app sync/grouping/reducer path;
- daemon/Pi extension live-event and JSONL fallback path;
- relay v3 idempotency/session-protocol path;
- integration trace from R50-R60 evidence.

Root cause: R60 fixed only duplicate agent/assistant replies. The computer-origin user-message path had the same live-extension plus JSONL-fallback duplication class:

1. Pi extension emits `input` for local computer text.
2. `lynttyd` forwards that immediately as a session-protocol `user` text envelope.
3. Pi later writes the same user input to JSONL.
4. `PiExternalMirror` fallback imports the JSONL user entry with a different history envelope id/localId.
5. The app sees two separate user messages and renders both as `Computer` bubbles.

The existing `markUserTextDeliveredSince()` only removed matching user JSONL entries already present, plus one delayed 2.5s read. If the JSONL entry arrived later, it was not remembered. R60 added a recent-delivered ledger only for assistant text, not user text.

## Fix

### Daemon / JSONL fallback

- Added a recent-delivered user-text ledger to `PiExternalMirror`, parallel to the assistant ledger.
- `markUserTextDeliveredSince(text, cutoff)` now records the exact text for a five-minute dedupe window.
- Later `tick()` suppresses matching user JSONL entries even if they appear after the original mark/delayed mark.
- Non-matching user entries still import normally.

### App persisted-state guard

- Added a defensive grouping guard for already-persisted live+history fallback duplicates:
  - applies only when one adjacent computer-origin `user-text` is from `pi-live-input-*` and the other from `pi-history-*`,
  - requires same normalized text,
  - requires timestamps within five minutes,
  - preserves repeated phone/local optimistic messages,
  - preserves repeated generic computer-origin messages so intentional repeated desktop Pi inputs remain visible.

## Verification

### Focused/full automated checks

- `pnpm --filter ./packages/lyntty-cli test -- src/pi/runPiExternalMirror.test.ts`
  - Passed: 90 files / 781 tests.
- `pnpm --filter ./packages/lyntty-app test -- sources/hooks/useGroupedMessages.test.ts`
  - Initial R61 pass: 79 files / 785 tests.
  - Follow-up narrowed app guard pass: 79 files / 786 tests.
- `pnpm --filter ./packages/lyntty-cli typecheck`
  - Passed.
- `pnpm --filter ./packages/lyntty-app typecheck`
  - Passed.

### Release-style APK build

- Built non-production release-style APK with local relay URL:
  - `EXPO_PUBLIC_LYNTTY_SERVER_URL=http://10.0.2.2:3007 CCACHE_DISABLE=1 CMAKE_C_COMPILER_LAUNCHER= CMAKE_CXX_COMPILER_LAUNCHER= ./gradlew :app:assembleRelease --no-daemon`
  - Result: `BUILD SUCCESSFUL`.

### Diff hygiene

- `git diff --check`
  - Passed.

## Not run / limitations

- No physical phone validation was run.
- No live global Pi extension install/reload was performed.
- The exact screenshot session was not mutated. The fix is covered by deterministic mirror and app grouping regressions plus release-style APK build.

## Residual risk

- Source dedupe is exact text plus time-window based; if live input and JSONL input differ materially, both remain visible.
- App defensive guard is now limited to explicit `pi-live-input-*` plus `pi-history-*` fallback duplicates. Generic repeated computer-origin inputs remain visible, so intentional repeated desktop Pi sends are not hidden.
