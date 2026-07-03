# R45 app deep-link and auth reset follow-up

Date: 2026-07-04
Task: `lyntty-1zz`.

## Trigger

Late R43 app review reported production deep-link mismatch and app lifecycle risks after R44.

## Fixes

- Android App Links:
  - production Android intent filter uses `app.lyntty.engineering`.
  - `assetlinks.json` now declares package `dev.jczhang.lyntty` instead of legacy `com.ex3ndr.lyntty`.
  - fingerprint format covered by test; production Play/App Signing fingerprint still must be verified during release setup.
- iOS Universal Links:
  - `apple-app-site-association` now declares `466DQWDR8C.dev.jczhang.lyntty` instead of legacy `466DQWDR8C.com.ex3ndr.lyntty`.
- Auth invalidation / server switching:
  - `clearLocalAuth()` calls `syncReset()` to disconnect socket and allow future `syncCreate()`/`syncRestore()` re-init.
  - server URL save/reset forces logout/reload and skips push-token unregister against the newly selected server to avoid hanging on old-token/new-server mismatch.
- QR scanner fallback:
  - terminal and account QR actions catch scanner unavailable/launch failure and open manual URL prompt.
  - `launchScanner()` is awaited so async failures hit fallback.
- Production server URL UX:
  - production builds reject cleartext `http://` relay URLs before platform cleartext policy fails.
  - app env is embedded in Expo `extra.app.appEnv` and read through `loadAppConfig()` for runtime-safe validation.

## Verification

```bash
pnpm --filter ./packages/lyntty-app exec vitest run \
  sources/utils/appLinks.test.ts \
  sources/sync/serverConfig.test.ts \
  sources/auth/authInvalidation.test.ts
pnpm --filter ./packages/lyntty-app typecheck
pnpm --filter ./packages/lyntty-app test -- --run
git diff --check
```

Results:

- Focused app tests: 3 files / 6 tests passed.
- Full app suite: 67 files / 736 tests passed.
- app typecheck passed.
- diff check passed.

## Remaining release checks

- Live `https://app.lyntty.engineering/.well-known/assetlinks.json` / AASA deployment could not be validated from this environment. Release needs domain deployment check and real signing fingerprints.
- Auth invalidation reset disconnects socket and resets initialization; deeper in-memory store purge is still a possible future hardening item, but logout/reload remains the primary clean path.
