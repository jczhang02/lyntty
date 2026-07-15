# Lyntty Maestro E2E

Production E2E target: repeatable Android validation for the mobile -> relay -> lynttyd -> pi path.

## Prerequisites

- Maestro CLI available (`maestro --version`).
- Android emulator/device connected (`adb devices`).
- Lyntty development/preview release-style APK installed; the APK contains its bundle and does not require Metro.
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

`LYNTTY_MAESTRO_PRELAUNCH=1` is enabled by default. It force-stops and foregrounds the App before each flow to avoid Android launcher state leaks. Set it to `0` when direct Maestro `launchApp` is sufficient.

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
- `02_pair_node.yml`: terminal deep-link pairing through the Pair Node accept screen. On Android the runner uses an adb deep-link fallback because Maestro `openLink` can report success without delivering the custom `lyntty://` scheme to Expo Router.
- `03_history_send_reply.yml`: Sessions Home Pi history row open, deleted-session regression guard, prompt send, visible Pi reply token. The prompt intentionally does **not** contain the expected reply token to avoid passing on the user bubble.
- `04_reconnect_smoke.yml`: visible session survives app relaunch. This is an app relaunch smoke, not a daemon/relay restart test.

## Current limitations

- Pairing flows may require a second adb deep-link delivery when Android routing does not foreground the Pair Node screen; inspect artifacts under `LYNTTY_MAESTRO_ARTIFACT_DIR` on failure.
- Session-row opening still uses a screen coordinate because historical rows do not yet expose stable row-level testIDs.
- Full daemon/relay restart and offline-status automation is still separate from `04_reconnect_smoke.yml`.
