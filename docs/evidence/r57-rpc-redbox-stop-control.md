# R57 RPC redbox stop-control fix

## Issue

- Beads: `lyntty-j99` (`Fix APK RPC call failed redbox`)
- User screenshots:
  - `/home/jc/Downloads/Screenshot_20260705_171442_Lyntty (dev).jpg`
  - `/home/jc/Downloads/Screenshot_20260705_175626_Lyntty (dev).jpg`
- APK showed React Native RedBox: `Uncaught (in promise, id: 0/1) Error: RPC call failed` at `apiSocket.ts:171`.

## Diagnosis

The user pressed the small button immediately to the right of the input settings gear. Code inspection showed that button was not an info button: it was the Stop/Abort control.

Root causes:

1. `SessionView` passed `showAbortButton={sessionStatus.state === 'thinking' || sessionStatus.state === 'waiting'}`, but `AgentInput` ignored that prop when rendering the Stop button. It rendered whenever `onAbort` existed, so idle connected sessions showed a misleading unlabeled stop-square.
2. `SessionView.handleAbort()` called `sessionAbort(sessionId)` without returning/awaiting the Promise, so `AgentInput`'s try/catch could not catch the failure.
3. Ordinary Pi extension/shared-control sessions should not use legacy `sessionRPC('abort')`; they should enqueue `/abort` through the shared-control command bridge so the Pi extension calls Pi abort APIs.
4. `ApiSocket#sessionRPC()` collapsed relay errors to the generic `RPC call failed`, hiding the failing method and relay detail.

## Fix

- `packages/lyntty-app/sources/components/AgentInput.tsx`
  - Stop button now renders only when `showAbortButton` is true and an abort handler exists.
  - Stop button has `testID="lyntty-session-stop"` and `accessibilityLabel="Stop current Pi turn"`.
- `packages/lyntty-app/sources/-session/SessionView.tsx`
  - `handleAbort()` now returns/awaits the abort Promise.
- `packages/lyntty-app/sources/-session/sessionAbortAction.ts`
  - Pi-extension/shared-control sessions enqueue `/abort` through normal message delivery.
  - SDK-owned sessions keep using legacy `sessionAbort()`.
- `packages/lyntty-app/sources/sync/apiSocket.ts`
  - Session RPC failures now include method and relay error details.

## Verification

Commands:

```bash
pnpm --filter ./packages/lyntty-app test -- sources/components/agentInputControls.spec.ts sources/-session/sessionAbortAction.spec.ts sources/sync/apiSocketErrors.spec.ts
pnpm --filter ./packages/lyntty-app typecheck
git diff --check
```

Results:

- App tests: 72 files / 750 tests passed.
- App typecheck passed.
- `git diff --check` passed.

## Notes

No live Pi extension install/reload was performed. The fix is app-side routing/UI/error handling only.
