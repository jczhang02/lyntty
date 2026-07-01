# R23 Maestro E2E and Pi session scalability hardening

Date: 2026-07-02
Task: `lyntty-dhp` — Maestro production E2E and session scalability hardening.

## What changed

- Added Maestro Android E2E infrastructure under `e2e/maestro/`:
  - `01_first_run.yml` account/onboarding smoke.
  - `02_pair_node.yml` terminal deep-link pairing smoke.
  - `03_history_send_reply.yml` historical Pi session open + live reply smoke.
  - `04_reconnect_smoke.yml` app relaunch visible-session smoke.
- Added `scripts/e2e/run-maestro.sh`:
  - renders flow placeholders (`APP_ID`, pairing URL, history title, prompt, expected reply),
  - writes debug/JUnit artifacts,
  - can run a directory of flows sequentially,
  - prelaunches the dev-client Activity with adb to reduce Expo Dev Client launcher state flakes,
  - can start the paired node daemon after `02_pair_node.yml` when `LYNTTY_MAESTRO_NODE_HOME` is set.
- Added stable mobile automation selectors for first-run, pairing, server settings, and session composer controls.
- Hardened Pi session discovery scalability:
  - machine RPC `list-pi-sessions` now supports `{ limit, cursor }` and returns `{ sessions, nextCursor, total }`,
  - Sessions Home and Machine Detail fetch Pi discovery in pages instead of one giant encrypted RPC payload,
  - node daemon caches local Pi `SessionManager` scans briefly across page requests,
  - active Pi runtimes are sorted before pagination slices,
  - app merge regression covers 5000 discovered Pi sessions.

## Verification

Automated checks passed:

```text
pnpm --filter ./packages/lyntty-cli run typecheck
pnpm --filter ./packages/lyntty-cli exec vitest run \
  src/pi/runPiRecovery.test.ts \
  src/api/apiMachine.test.ts \
  src/api/apiMachine.codexFork.test.ts \
  src/daemon/piSpawnDirectory.test.ts
# 4 files, 26 tests passed

pnpm --filter ./packages/lyntty-app run typecheck
pnpm --filter ./packages/lyntty-app exec vitest run \
  sources/sync/piSessionOps.test.ts \
  sources/sync/piDiscoveredSessions.test.ts \
  sources/utils/sessionUtils.test.ts
# 3 files, 8 tests passed

pnpm --filter ./packages/lyntty-relay run typecheck
pnpm --filter ./packages/lyntty-relay exec vitest run sources/app/api/socket/rpcHandler.spec.ts
# 1 file, 4 tests passed

bash -n scripts/e2e/run-maestro.sh
# rendered Maestro syntax checks for 01-04: OK
git diff --check
```

Maestro/APK evidence on emulator `emulator-5554`:

```text
01_first_run.yml passed in 20s during `/tmp/lyntty-maestro-e2e/maestro-suite-seq2/01_first_run`.
02_pair_node.yml passed in 14s during `/tmp/lyntty-maestro-e2e/maestro-pair6`; paired CLI exited 0 with Machine ID `0c4b670d-9649-40f9-819a-960e3413b696`.
03_history_send_reply.yml passed in 50s during `/tmp/lyntty-maestro-e2e/maestro-history-proof5` with the anti-false-positive prompt (`Join MAESTRO and PONG...`) and expected Pi reply `MAESTRO_PONG`.
04_reconnect_smoke.yml passed in 32s during `/tmp/lyntty-maestro-e2e/maestro-reconnect-proof`.
```

## Findings from high-intensity E2E

- The original one-shot Pi discovery path could freeze or disconnect on many local Pi sessions because it returned all records in one encrypted machine RPC payload. Pagination and text truncation reduce this risk.
- Fresh `lyntty auth login --method mobile` only authenticates the node; the node is not visible to Sessions Home until `lyntty daemon start` runs for the same `LYNTTY_HOME_DIR`.
- Expo Dev Client launch state is flaky across repeated Maestro invocations. The runner now force-stops and foregrounds `MainActivity` before each flow, but preview/release APK validation is still needed for final release confidence.
- The previous live-reply flow could have passed on a user bubble because the user prompt contained the expected token. The prompt now asks Pi to derive `MAESTRO_PONG` without embedding that exact string in the sent message.

## Remaining limitations

- `04_reconnect_smoke.yml` is an app relaunch smoke, not a daemon/relay restart automation.
- Session-row opening still uses a coordinate because historical session rows do not yet have stable row-level testIDs.
- Offset cursors remain best-effort over a short daemon cache window; a future hardening pass should use opaque snapshot/keyset cursors for mutation-proof pagination.
- Preview/release APK and physical-device runs were not performed in this slice.
