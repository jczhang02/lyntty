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
export LYNTTY_MAESTRO_APP_ID=dev.jczhang.lyntty.preview
export LYNTTY_MAESTRO_DEVICE=emulator-5554
export LYNTTY_MAESTRO_PAIRING_URL='lyntty://terminal?...'
export LYNTTY_MAESTRO_NODE_HOME="$PWD/dist/test-state/maestro/node"
export LYNTTY_MAESTRO_RUNTIME_DIR="$PWD/dist/test-state/maestro/rendered-flows"
export LYNTTY_MAESTRO_SERVER_URL=http://127.0.0.1:3005
export LYNTTY_MAESTRO_HISTORY_TITLE='jc: pi sum calculation session'
export LYNTTY_MAESTRO_PROMPT='Join MAESTRO and PONG with one underscore. Reply with only the result.'
export LYNTTY_MAESTRO_PONG='MAESTRO_PONG'
# Only after staging a higher, same-channel signed APK manifest:
export LYNTTY_MAESTRO_UPDATE_VERSION_NAME='1.0.4'
```

`LYNTTY_MAESTRO_PRELAUNCH=1` is enabled by default. It force-stops and foregrounds the App before each flow to avoid Android launcher state leaks. Set it to `0` when direct Maestro `launchApp` is sufficient.

## Run

Single flows:

```bash
bun run e2e:maestro:preview-first-run
scripts/e2e/run-maestro.sh e2e/maestro/01_first_run.yml
scripts/e2e/run-maestro.sh e2e/maestro/02_pair_node.yml
scripts/e2e/run-maestro.sh e2e/maestro/03_history_send_reply.yml
scripts/e2e/run-maestro.sh e2e/maestro/04_reconnect_smoke.yml
scripts/e2e/maestro-daemon-restart.sh
scripts/e2e/run-maestro.sh e2e/maestro/06_recovered_reply.yml
scripts/e2e/maestro-reload-ownership.sh
scripts/e2e/run-maestro.sh e2e/maestro/08_history_gap.yml
scripts/e2e/run-maestro.sh e2e/maestro/09_full_apk_update.yml
scripts/e2e/run-maestro.sh e2e/maestro/10_bad_apk_hash.yml
```

Sequential suite folder, after creating `LYNTTY_MAESTRO_PAIRING_URL` from the same `LYNTTY_MAESTRO_NODE_HOME`:

```bash
scripts/e2e/run-maestro.sh e2e/maestro
```

When `LYNTTY_MAESTRO_NODE_HOME` is set, the runner starts `lyntty daemon start` for that node after the pairing flow succeeds.

## Coverage

- `01_first_run.yml`: development/legacy onboarding and account creation into empty Sessions Home.
- `standalone/preview_first_run.yml`: standalone Preview-only assertion that Relay setup is mandatory before account actions. Run it through `bun run e2e:maestro:preview-first-run`; the subdirectory keeps it out of the stateful folder sequence.
- `02_pair_node.yml`: terminal deep-link pairing through the Pair Node accept screen. On Android the runner uses an adb deep-link fallback because Maestro `openLink` can report success without delivering the custom `lyntty://` scheme to Expo Router.
- `03_history_send_reply.yml`: Sessions Home Pi history row open, deleted-session regression guard, prompt send, visible Pi reply token. The prompt intentionally does **not** contain the expected reply token to avoid passing on the user bubble.
- `04_reconnect_smoke.yml`: visible session survives app relaunch. This is an app relaunch smoke, not a daemon/relay restart test.
- `05_daemon_restart_replay.yml`: a queued phone command reaches the exact Pi session once after `lynttyd` restarts; use the guarded orchestration script.
- `06_recovered_reply.yml`: the recovered assistant reply remains visible after app recovery.
- `07_reload_ownership.yml`: an isolated Pi `/reload` produces a new extension owner and one execution; use the guarded orchestration script.
- `08_history_gap.yml`: Session Remote renders explicit `history_gap` remediation.
- `09_full_apk_update.yml`: a higher same-channel APK downloads, verifies, opens Android Package Installer, upgrades, and retains an existing session row.
- `10_bad_apk_hash.yml`: a mismatched digest shows the failure remediation and never changes the installed `versionCode`.

## Current limitations

- Pairing flows may require a second adb deep-link delivery when Android routing does not foreground the Pair Node screen; inspect artifacts under `LYNTTY_MAESTRO_ARTIFACT_DIR` on failure.
- Session-row opening still uses a screen coordinate because historical rows do not yet expose stable row-level testIDs.
- Daemon restart and Pi `/reload` flows require the guarded orchestration scripts plus isolated node/Pi homes under ignored `dist/test-state`; never point them at live `~/.pi`, `~/.lyntty`, or a current Pi pane.
- Full-APK flows require a locally staged manifest/APK outside production, the package's own signing key for both installed and update APKs, and Android unknown-source permission. The runner skips them when `LYNTTY_MAESTRO_UPDATE_VERSION_NAME` is unset.
