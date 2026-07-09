# r71 Pi completion push notifications

Date: 2026-07-08
Bead: `lyntty-c3k`

## Scope

Add phone push notifications for completed live `pi` turns without adding new notification settings or copy.

Implemented behavior:

- Managed `runPi` SDK sessions send existing `done` push after a live `agent_start -> agent_end` turn.
- Extension-backed local computer `pi` sessions send existing `done` push after a live `agent_start -> agent_end` turn.
- Isolated `agent_end` events do not notify.
- History replay/backfill does not notify because it does not pass through the live completion gate.
- `/abort`, Session Remote Stop / `internal_shutdown`, and kill-session abort suppress completion push for the current turn.
- Extension mirror push is suppressed when a managed Pi runtime already owns the same `piSessionId`.
- Ephemeral/no-session child sessions are not eligible for extension completion push unless there is a real session file/mirror.
- Push copy and active mobile/web suppression reuse existing `sendSessionNotification({ kind: 'done' })` relay path.

## Changed files

- `packages/lyntty-cli/src/pi/piCompletionNotifications.ts`
- `packages/lyntty-cli/src/pi/piCompletionNotifications.test.ts`
- `packages/lyntty-cli/src/pi/runPi.ts`
- `packages/lyntty-cli/src/daemon/run.ts`

## Verification

Commands run from isolated worktree `/home/jc/dev/lyntty/worktrees/pi-completion-push`:

```bash
pnpm install --frozen-lockfile
pnpm --filter ./packages/lyntty-cli exec vitest run --project unit src/pi/piCompletionNotifications.test.ts
pnpm --filter ./packages/lyntty-cli typecheck
pnpm --filter ./packages/lyntty-cli exec vitest run --project unit src/pi/piCompletionNotifications.test.ts src/daemon/piExtensionDelivery.test.ts src/pi/piExtensionEvent.test.ts
pnpm --filter ./packages/lyntty-cli test
git diff --check
```

Results:

- Focused completion notification test passed: 1 file, 6 tests.
- Focused Pi/daemon regression tests passed: 3 files, 14 tests.
- Full CLI unit suite passed: 92 files, 791 tests.
- CLI typecheck passed.
- `git diff --check` passed.

## Not run

- No live `lynttyd` restart or global Pi extension reload.
- No real relay push dispatch to phone.
- No APK/Android install test.

Reason: those would touch live daemon/session/global extension or external notification state. Local logic and CLI regression coverage passed first.

## Residual risk

- Real phone notification delivery still depends on existing APK push permission/token registration and relay presence suppression.
- Pi SDK/extension event ordering is assumed to deliver `agent_start` before cancellable `agent_end`; isolated or gap-affected `agent_end` is intentionally suppressed.
