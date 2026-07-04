# R53 APK account spinner after invalid token

Date: 2026-07-05

## User report

APK logs after local relay reset / stale auth:

```text
WARN  [auth] Invalid credentials detected; clearing local auth: Invalid authentication token
WARN  [Error: Failed to fetch sessions: 401]
WARN  [Error: Failed to fetch profile: 401]
ERROR Failed to fetch machines: 401
WARN  [Error: Failed to fetch artifacts: 401]
WARN  [Error: Failed to sync settings: Invalid token]
WARN  [Error: Settings sync failed after 3 retries due to version conflicts]
```

Then tapping `Create account` spins forever.

## Diagnosis

Root cause is app-local stale auth cleanup not resetting all in-memory sync state:

1. `AuthContext.clearLocalAuth()` called `syncReset()` and cleared persistent storage.
2. `Sync.resetRuntimeState()` stopped sync queues and cleared caches, but kept the in-memory `pendingSettings` object that had been loaded before persistent storage was cleared.
3. New account creation called `auth.login()`, saved the fresh token, then awaited `syncCreate()` before returning to the button.
4. If sync was stuck on stale/pending settings or a replayed auth reset path, the `RoundButton` action never returned, so `Create account` kept spinning.

## Fix

- `Sync.resetRuntimeState()` now clears in-memory `pendingSettings` and writes an empty pending-settings record.
- `AuthProvider.login()` now saves credentials and marks auth state immediately, then starts `syncCreate()` in the background. Account creation no longer blocks the button spinner on first sync/settings/profile/purchases completion.
- Added regression proving `auth.login()` resolves even when `syncCreate()` is still running.

## Verification

- `pnpm --filter ./packages/lyntty-app exec vitest run sources/auth/AuthContext.test.ts sources/auth/authInvalidation.test.ts sources/utils/time.test.ts` — pass, 4 tests.
- `pnpm --filter ./packages/lyntty-app typecheck` — pass.
- `pnpm --filter ./packages/lyntty-app test` — pass, 69 files / 740 tests.
- `git diff --check` — pass.

## APK note

This is JavaScript/TypeScript app logic. Dev Client can pick it up by reloading Metro with cache clear. Release-style APK must be rebuilt/reinstalled to include the fix.
