# R43 whole-project review and E2E matrix

Date: 2026-07-03
Task: `lyntty-dvu` — whole-project review and E2E matrix.

## Scope

Whole-project review with release-style APK validation as primary target:

- ordinary computer-side `pi` live mirroring
- historical and long Pi sessions
- pairing/account/server setup
- stale token/rebind recovery
- offline/online daemon clarity
- raw tool-payload hiding
- tool-duration completion regression coverage
- security-sensitive relay paths
- review rounds >= 3

## Review rounds

1. Round 1 subagents: app/mobile sync/rendering/auth/pairing, CLI/daemon/Pi runtime/mirror/history, relay/wire security/auth/RPC/payloads, and E2E matrix.
2. Round 2: release-style APK E2E execution and issue triage on emulator.
3. Round 3 subagents: final app review, final relay/security review, and final E2E evidence review.

Round 3 blockers fixed before commit:

- `rpcHandler` nested payload cap treated `undefined`/function/symbol as oversized. Fixed by treating non-JSON values as not oversized and cyclic values as oversized; covered in `rpcHandler.spec.ts`.
- R43 relay evidence artifact contained pre-fix encrypted session update payload fields. Artifact redacted; source log now records `updateSeq` instead of full update payload.
- Missing R43 evidence doc. This file records matrix, commands, artifacts, and known gaps.
- Disabled Expo Updates produced release-style APK logcat noise. Fixed by guarding update checks with `Updates.isEnabled`.

## Code fixes

- `packages/lyntty-app/sources/hooks/useUpdates.ts`
  - skip `Updates.checkForUpdateAsync()` when Expo Updates is disabled.
- `packages/lyntty-app/sources/hooks/useUpdatesUtils.ts`
  - testable `shouldCheckForUpdates()` helper.
- `packages/lyntty-relay/sources/app/api/socket/rpcHandler.ts`
  - nested/cyclic RPC payload cap for params and responses.
- `packages/lyntty-relay/sources/app/api/socket/sessionUpdateHandler.ts`
  - socket message content/localId caps.
- `packages/lyntty-relay/sources/app/api/routes/accessKeysRoutes.ts`
  - access-key data caps.
- `packages/lyntty-relay/sources/app/api/routes/sessionRoutes.ts`
  - remove full `updatePayload` logging from new-session events.
- `packages/lyntty-relay/sources/app/api/routes/machinesRoutes.ts`
  - add authenticated machine offline endpoint for daemon shutdown.
- `packages/lyntty-relay/sources/app/api/socket.ts`
  - persist machine offline on machine-socket disconnect.
- `packages/lyntty-cli/src/api/api.ts`
  - add `markMachineOffline()`.
- `packages/lyntty-cli/src/daemon/run.ts`
  - mark machine offline during graceful daemon shutdown.

## Verification commands

Focused verification:

```bash
pnpm --filter ./packages/lyntty-relay exec vitest run sources/app/api/socket/rpcHandler.spec.ts sources/app/api/routes/machinesRoutes.spec.ts
pnpm --filter ./packages/lyntty-relay typecheck
pnpm --filter ./packages/lyntty-app exec vitest run sources/hooks/useUpdates.test.ts sources/hooks/useGroupedMessages.test.ts sources/auth/authInvalidation.test.ts
pnpm --filter ./packages/lyntty-app typecheck
pnpm --filter ./packages/lyntty-cli typecheck
pnpm --filter ./packages/lyntty-cli run bundle:server
pnpm --filter ./packages/lyntty-cli build
git diff --check
```

Full verification recorded during R43 final pass:

- `packages/lyntty-cli` full unit suite: 88 files / 751 tests passed.
- `packages/lyntty-app` full Vitest: 65 files / 732 tests passed.
- `packages/lyntty-relay` full suite: 13 files / 89 tests passed.
- `packages/lyntty-wire` full suite: 2 files / 19 tests passed.
- `packages/lyntty-agent` full suite: 9 files / 227 tests passed.
- Release-style APK rebuild passed with `APP_ENV=development EXPO_PUBLIC_LYNTTY_SERVER_URL=http://10.0.2.2:3005 ./gradlew :app:assembleRelease`.

## Release-style APK E2E matrix

Artifacts root: `docs/evidence/artifacts/r43-whole-project-e2e/`.

| Scenario | Evidence | Result |
|---|---|---|
| First-run account setup | `final-fresh/01_first_run/`, `final-offline-fixed/01_first_run/` | Passed |
| Terminal deep-link pairing accept | `final-fresh/02_pair_node/`, `final-offline-fixed/02_pair_node/` | Passed |
| Pairing reject | `02a_pair_reject_final/` | Passed with adb deep-link/no-launch workaround; earlier launchApp attempts failed and are superseded |
| Ordinary direct `pi` plugin live mirror | `final-fresh/plugin-home.xml`, `final-fresh/plugin-session.xml` | Passed; token visible, input visible, raw payload absent |
| Plugin update after same Pi session | `plugin-update-session-open.xml` | Passed manually after opening session; Sessions Home did not immediately surface update before open |
| Long historical session open | `final-long-fixed/home.xml`, `final-long-fixed/long-open-tap560.xml` | Passed manually after using actual row bounds; Session Remote title/input visible |
| Long-history raw tool-payload hiding | `final-long-fixed/long-open-tap560.xml` | Passed; markers absent: `{"content"`, `"details":{}`, `beads.role not configured`, `available work`, `gpg: Signature made` |
| Disabled Expo Updates log noise | `final-relaunch-logcat.txt` | Passed; `Updates.checkForUpdateAsync() is not supported` absent after fix |
| Daemon offline/online clarity | `final-offline-fixed/online.xml`, `final-offline-fixed/offline.xml`, `final-offline-fixed/relay-relevant.log` | Improved: graceful daemon shutdown posts `/v1/machines/:id/offline`; offline state returns setup/no-active-node view after relaunch. UI `connected` text denotes app-to-relay socket, not node online label. |
| Stale token / rebind recovery | R42 evidence plus R43 review; socket auth invalidation already covered | Covered by prior committed R42 tests/evidence, not re-run as a full destructive account-rebind scenario in R43 |
| Tool duration completion | reducer pending/out-of-order tool-result tests from R41/R42 baseline | Covered by app reducer tests and R43 full app baseline |
| Security-sensitive relay caps/logs | focused relay tests, redacted artifact scan | Passed focused checks; access-key and socket message caps are source/typecheck verified, not direct route/socket E2E tested |

## Known limitations / follow-up risks

- Maestro/text row taps remain flaky on long duplicate-title lists; stable session-row testIDs should be added for production-grade automation. R43 final long-session proof used exact row bounds from the UI hierarchy.
- `04_reconnect_smoke.yml` is app relaunch smoke, not full relay/network reconnect validation.
- Daemon offline UI still shows `connected` for the app-to-relay socket. Node offline semantics improved by daemon shutdown marking the machine offline, but copy should distinguish relay connection from node status more clearly.
- Firebase/FIS logcat warnings remain environmental for local debug Firebase config.
- Access-key and socket-message caps need direct route/socket regression tests in future hardening.
- Real physical phone smoke was not run in R43; emulator `emulator-5554` was available and used.

## Artifact hygiene

R43 artifact scan result:

```text
R43_ARTIFACT_SECRET_SCAN_CLEAN
```

Pairing URLs and data-encryption-key-like payloads were redacted under `docs/evidence/artifacts/r43-whole-project-e2e/` before commit. Large relay logs were reduced to `relay-relevant.log` snippets to avoid committing secret-bearing or noisy server logs.
