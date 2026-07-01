# Lyntty Maestro E2E

Production E2E target: repeatable Android validation for the mobile -> relay -> lynttyd -> pi path.

## Prerequisites

- Maestro CLI available (`maestro --version`).
- Android emulator/device connected (`adb devices`).
- Lyntty dev/preview APK installed and launched with a reachable JS bundle if using the dev-client APK.
- Self-hosted relay running and reachable from the emulator/phone.
- For pairing flows, a fresh CLI auth URL from `lyntty auth login --method mobile`.
- For history/reply flows, the same node must be authenticated and its daemon must be running; `lyntty auth login` alone writes credentials but does not keep the node online.

## Environment

```bash
export LYNTTY_MAESTRO_APP_ID=dev.jczhang.lyntty.dev
export LYNTTY_MAESTRO_DEVICE=emulator-5554
export LYNTTY_MAESTRO_PAIRING_URL='lyntty://terminal?...'
export LYNTTY_MAESTRO_NODE_HOME=/tmp/lyntty-maestro-node
export LYNTTY_MAESTRO_SERVER_URL=http://127.0.0.1:3005
export LYNTTY_MAESTRO_HISTORY_TITLE='jc: pi sum calculation session'
export LYNTTY_MAESTRO_PROMPT='Join MAESTRO and PONG with one underscore. Reply with only the result.'
export LYNTTY_MAESTRO_PONG='MAESTRO_PONG'
```

`LYNTTY_MAESTRO_PRELAUNCH=1` is enabled by default. It force-stops and foregrounds the dev-client activity before each flow to avoid Expo Dev Client/Android launcher state leaks. Set it to `0` for release/preview APKs if direct Maestro `launchApp` is enough.

## Run

Single flows:

```bash
scripts/e2e/run-maestro.sh e2e/maestro/01_first_run.yml
scripts/e2e/run-maestro.sh e2e/maestro/02_pair_node.yml
scripts/e2e/run-maestro.sh e2e/maestro/03_history_send_reply.yml
scripts/e2e/run-maestro.sh e2e/maestro/04_reconnect_smoke.yml
```

Sequential suite folder, after creating `LYNTTY_MAESTRO_PAIRING_URL` from the same `LYNTTY_MAESTRO_NODE_HOME`:

```bash
scripts/e2e/run-maestro.sh e2e/maestro
```

When `LYNTTY_MAESTRO_NODE_HOME` is set, the runner starts `lyntty daemon start` for that node after the pairing flow succeeds.

## Coverage

- `01_first_run.yml`: onboarding/account creation into empty Sessions Home.
- `02_pair_node.yml`: terminal deep-link pairing through the Pair Node accept screen.
- `03_history_send_reply.yml`: Sessions Home Pi history row open, deleted-session regression guard, prompt send, visible Pi reply token. The prompt intentionally does **not** contain the expected reply token to avoid passing on the user bubble.
- `04_reconnect_smoke.yml`: visible session survives app relaunch. This is an app relaunch smoke, not a daemon/relay restart test.

## Current limitations

- Dev-client APKs remain less deterministic than preview/release APKs; keep Metro running and inspect artifacts under `LYNTTY_MAESTRO_ARTIFACT_DIR` on failure.
- Session-row opening still uses a screen coordinate because historical rows do not yet expose stable row-level testIDs.
- Full daemon/relay restart and offline-status automation is still separate from `04_reconnect_smoke.yml`.
