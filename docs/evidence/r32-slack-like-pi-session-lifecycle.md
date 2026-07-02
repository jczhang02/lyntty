# R32 Slack-like Pi Session Lifecycle

Date: 2026-07-02
Task: `lyntty-1zo`

## User-approved model

Reference product: Slack channel model.

Goal: Lyntty opens a Pi session like Slack opens a channel: immediate entry, recent/tail first, older history progressive, realtime events shared across surfaces, optimistic/pending sends, and one shared backend stream rather than per-client duplicate runtimes.

## Implemented slice

### Instant historical row open

Files:

- `packages/lyntty-app/sources/hooks/useOpenPiDiscoveredSession.ts`
- `packages/lyntty-app/sources/sync/piSessionOpenRequest.ts`
- `packages/lyntty-app/sources/sync/piSessionOpen.ts`
- `packages/lyntty-app/sources/sync/sync.ts`

Behavior:

- Synthetic Pi rows (`pi-local:<machineId>:<piSessionId>`) now navigate immediately to `Session Remote` before `machineSpawnNewSession()` completes.
- Background open still resolves the real relay session id.
- Pending messages typed against the synthetic row are queued locally and flushed only after session sync has relay encryption for the real session id.
- If relay encryption is not ready, queued messages remain in memory rather than being deleted.

### Stable Pi session to relay session mapping

File:

- `packages/lyntty-cli/src/pi/runPi.ts`

Behavior:

- Requested historical Pi sessions now use deterministic relay tags derived from `machineId + piSessionId`.
- Reopening the same Pi JSONL session on the same node asks relay for the same session tag rather than randomizing a new tag every spawn.

### Active runtime attach/reuse

Files:

- `packages/lyntty-cli/src/daemon/activationLock.ts`
- `packages/lyntty-cli/src/daemon/run.ts`

Behavior:

- Before activation-lock takeover logic, daemon checks active tracked Pi runtimes for matching `piSessionId`.
- If found, `spawn-lyntty-session` returns the existing relay session id instead of spawning a second Pi runtime.

### External ordinary `pi` JSONL mirror groundwork

File:

- `packages/lyntty-cli/src/pi/runPiExternalMirror.ts`

Behavior:

- Adds a quiet-window JSONL mirror for the attached Pi session file.
- New external JSONL entries are converted through existing deterministic history mapping and sent as session-protocol envelopes after the file is quiet.
- While the Lyntty-managed runtime is active, current file entries are marked known to avoid echoing managed runtime writes back as duplicate historical messages.
- Pending external entries are preserved if runtime activity starts before the quiet window expires.

## Verification

Passed:

```text
pnpm --filter ./packages/lyntty-app run typecheck
pnpm --filter ./packages/lyntty-cli run typecheck

pnpm --filter ./packages/lyntty-cli test src/daemon/activationLock.test.ts src/pi/runPiExternalMirror.test.ts src/pi/runPi.test.ts
# 3 files, 12 tests passed

pnpm --filter ./packages/lyntty-app test sources/sync/piSessionOpen.test.ts
# 1 file, 2 tests passed

pnpm --filter ./packages/lyntty-app test
# 64 files, 718 tests passed

git diff --check
```

Review:

- `lyntty_slack_lifecycle_design_scan`: 4 read-only agents mapped app, daemon/runtime, Pi JSONL, and relay/protocol surfaces.
- `lyntty_slack_lifecycle_impl_review`: 3 reviewers found blockers in queued synthetic sends and mirror suppress behavior.
- Follow-up blocker reviews verified the fixes; final review reported no blockers.

Full CLI suite note:

```text
pnpm --filter ./packages/lyntty-cli test
```

ran the whole CLI unit suite but failed in existing watcher/session-scanner areas:

- `src/claude/utils/sessionScanner.test.ts`
- `src/modules/watcher/startFileWatcher.test.ts`

The focused changed areas passed; the failing tests are outside the Pi lifecycle diff and reproduce when run directly. They remain a separate test-environment/fake-timer watcher issue, not accepted as proof of this diff failing.

## Not run

- Fresh APK/Maestro/human smoke for this diff was not run in this slice. Emulator was connected, but local relay/Metro stack was not running.
- Real external ordinary `pi` TUI live mirror was not physically exercised; only deterministic JSONL append mirror tests ran.

## Remaining risks

- External mirror is attached to the current Lyntty-managed Pi runtime process; a fuller daemon-level watcher is still needed for sessions with no Lyntty runtime open.
- Synthetic queued sends are in-memory only; app process death before attach loses them.
- Attachment sends from a synthetic pre-attach row are queued as options but local optimistic rendering only shows text.
- Stable relay tags apply going forward; older random-tag sessions are still found/merged by metadata discovery rather than retroactively retagged.
