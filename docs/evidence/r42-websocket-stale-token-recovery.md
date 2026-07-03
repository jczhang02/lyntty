# R42 WebSocket stale-token and tool-payload hardening

Date: 2026-07-03

Beads: `lyntty-cb4`, `lyntty-ium`

## Problem

During R41 release-style APK reruns after relay/account resets, the mobile app could remain on `Sessions` while its user-scoped WebSocket repeatedly failed with relay log lines such as `Invalid token provided`. The existing auth invalidation path handled REST/backoff failures, but the socket `connect_error` / `error` handlers only changed socket status to `error`, so stale credentials could keep reconnecting instead of clearing local auth.

The same rerun also found two remaining tool-payload leaks in long/current Pi timelines:

- dynamic/unknown Pi tools could fall through to the default tool renderer and expose raw JSON input/output;
- already-normalized serialized Pi tool-result agent text could be stored without `isThinking`, so the R39/R40 compatibility filter did not hide it.

## Fix 1: WebSocket stale-token recovery

Files:

- `packages/lyntty-app/sources/auth/authInvalidation.ts`
- `packages/lyntty-app/sources/auth/authInvalidation.test.ts`
- `packages/lyntty-app/sources/sync/apiSocket.ts`

Changes:

- factored auth-failure message detection into `isAuthInvalidationMessage()`;
- socket `connect_error` and `error` now call `requestAuthInvalidation()` for `Invalid token`, `Invalid authentication token`, `Unauthorized`, and `401` messages;
- regression coverage verifies socket-style auth failure strings are recognized without treating ordinary disconnect messages as auth invalidation.

## Fix 2: Unknown Pi tool / legacy payload folding

Files:

- `packages/lyntty-app/sources/components/tools/ToolView.tsx`
- `packages/lyntty-app/sources/hooks/useGroupedMessages.ts`
- `packages/lyntty-app/sources/hooks/useGroupedMessages.test.ts`

Changes:

- unknown Pi tools now render as compact/minimal tool cards, matching the existing protection for unknown Gemini tools;
- current-session compatibility filtering now hides serialized Pi tool-result agent text whether it was stored as plain agent text or thinking text;
- regression coverage verifies both plain and thinking serialized tool-result rows are hidden while final assistant text remains visible.

## Verification

```bash
pnpm --filter ./packages/lyntty-app exec vitest run \
  sources/auth/authInvalidation.test.ts \
  sources/sync/reducer/reducer.spec.ts \
  sources/hooks/useGroupedMessages.test.ts
# 3 files, 72 tests passed

pnpm --filter ./packages/lyntty-app test -- --run
# 64 files, 731 tests passed

pnpm --filter ./packages/lyntty-app typecheck
# passed

pnpm --filter ./packages/lyntty-cli exec vitest run src/pi/runPiSessionProtocol.test.ts
# 1 file, 4 tests passed

pnpm --filter ./packages/lyntty-cli typecheck
# passed

git diff --check
# passed
```

Release-style APK was rebuilt after the fixes:

```bash
cd packages/lyntty-app/android
EXPO_PUBLIC_LYNTTY_SERVER_URL=http://10.0.2.2:3005 APP_ENV=development \
CCACHE_DISABLE=1 CMAKE_C_COMPILER_LAUNCHER= CMAKE_CXX_COMPILER_LAUNCHER= \
  ./gradlew :app:assembleRelease --no-daemon
# BUILD SUCCESSFUL
```

Post-fix emulator smoke before the final exact-relay-string test hardening:

- first-run account creation reached the CLI install instructions after the relay was running;
- terminal deep-link pairing passed and CLI auth exited 0;
- ordinary direct `pi` plugin mirroring produced `R41_FINAL_PLUGIN_211109` and the phone showed it in Sessions Home and Session Remote;
- raw tool payload markers were absent in the captured current-session XML.

After the review fixes, the release-style APK was rebuilt again successfully. No extra emulator flow was rerun after that rebuild because the final changes were covered by deterministic app tests and did not alter pairing/session navigation logic.

## Review

Two reviewer passes ran for R42. The first found blockers around the exact relay socket error string and over-broad JSON hiding. The final pass reported no blockers:

- exact relay socket error `Invalid authentication token` is covered;
- legitimate assistant JSON with `content`/`details` remains visible;
- unknown Pi tools render compactly rather than exposing raw input/output JSON.

## Follow-up risk

This fix covers stale user-scope socket auth failures. It does not replace the broader account-rebinding UX: if a real phone and test emulator are intentionally paired to different relay accounts, the user still needs to align server URL/account and re-pair the node.
