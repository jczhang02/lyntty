# R58 Archive Session GO_BACK navigation fix

## Issue

Beads: `lyntty-5cb`.

User screenshot: `/home/jc/Downloads/Screenshot_20260706_041317_Lyntty (dev).jpg`.

Visible failure: React Navigation reported `GO_BACK` was not handled after using `Archive Session` from Session Remote/session actions.

## Root cause

`packages/lyntty-app/sources/app/(app)/session/[id]/info.tsx` archived by calling the existing stop/archive chain, then executed two `router.back()` calls. If the session was opened with a shallow stack, deep link, or the user manually navigated away while the async archive was still finishing, the second or delayed back could target an empty stack.

## Fix

- Preserved existing Archive semantics: `sessionKill(session.id)` first, fallback to `sessionArchive(session.id)` when kill fails.
- Replaced post-archive double-back navigation with deterministic Sessions Home replacement through `navigateAfterSessionArchive(router)`.
- Added focused navigation regression coverage proving the archive completion path calls `router.replace('/')` instead of depending on back stack state.

## Verification

```bash
pnpm --filter ./packages/lyntty-app test -- sources/utils/archiveNavigation.test.ts
pnpm --filter ./packages/lyntty-app typecheck
```

Results:

- `packages/lyntty-app` Vitest: 75 files, 764 tests passed.
- `packages/lyntty-app` typecheck passed.

## Not run

- Release-style APK archive tap smoke not run for this narrow fix; final R58 matrix will cover release-style APK/E2E after remaining Beads tasks.

## Residual risk

Other non-archive screens still contain legitimate `router.back()` uses. This fix targets only Archive Session completion from Session Info/Remote, which caused the reported crash.
