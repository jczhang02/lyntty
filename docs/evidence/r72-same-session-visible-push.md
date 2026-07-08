# r72 — Same-session visible push suppression

Date: 2026-07-09
Bead: `lyntty-z9q`
Branch/worktree: `feat/pi-completion-push` / `worktrees/pi-completion-push`

## Scope

Refined relay session-event push suppression from broad `any active non-machine client` to `same-session-visible`:

- App/Web socket presence now reports `visibleSessionId` only while the Session Remote `/session/<id>` screen is focused and app state is active.
- Relay suppresses `done`, `permission`, and `question` session-event pushes only when a non-machine socket is active and `visibleSessionId` matches the pushed `sessionId`.
- Machine sockets, background clients, Settings/Sessions Home/other-session clients, and old clients without `visibleSessionId` fail open and allow push delivery.

## Verification

Commands run from `/home/jc/dev/lyntty/worktrees/pi-completion-push`:

```bash
pnpm --filter ./packages/lyntty-relay exec vitest run sources/app/events/eventRouter.spec.ts sources/app/push/pushDispatch.spec.ts
pnpm --filter ./packages/lyntty-app exec vitest run sources/sync/apiSocketPresence.test.ts
pnpm --filter ./packages/lyntty-relay typecheck
pnpm --filter ./packages/lyntty-app typecheck
pnpm --filter ./packages/lyntty-relay test -- --run
pnpm --filter ./packages/lyntty-app lint:i18n
pnpm --filter ./packages/lyntty-app test -- --run
pnpm ci:relay
pnpm ci:app
git diff --check
```

Results:

- Focused relay tests: 2 files / 4 tests passed.
- Focused app presence test: 1 file / 2 tests passed.
- Relay typecheck passed.
- App typecheck passed.
- Full relay tests passed: 17 files / 101 tests.
- App i18n lint passed.
- Full app tests passed: 83 files / 795 tests.
- `pnpm ci:relay` passed, including relay typecheck, runtime build, and 17 relay test files / 101 tests.
- `pnpm ci:app` passed, including app typecheck, i18n lint, 83 app test files / 795 tests, and Expo config introspection to `/tmp/lyntty-expo-config.json`.
- `git diff --check` passed.

## Not run

- Production relay deployment and real phone notification retest were not run in this branch verification because deploying relay changes external production behavior and requires explicit approval.
- APK rebuild was not run. Existing APKs do not report `visibleSessionId`; with the new relay rule they fail open and will no longer suppress pushes, but exact same-session foreground suppression requires an updated APK/OTA bundle.

## Residual risk

- On older App/Web clients, foreground same-session viewing will no longer suppress session-event pushes until those clients update and send `visibleSessionId`.
- Per-device suppression remains deferred: if any updated App/Web client actively views the same session, account-wide session-event push fanout is suppressed.
