# R38 E2E Validation

Date: 2026-07-03

Task: `lyntty-dpg` — run current Lyntty Android/Maestro and Pi-extension E2E validation.

## Scope

Validated on emulator `emulator-5554` using release-style APK `dev.jczhang.lyntty.dev` against fresh local relay `http://127.0.0.1:3005` / emulator URL `http://10.0.2.2:3005`.

Covered:

- first-run account creation;
- terminal deep-link pairing;
- Pi historical session discovery/open/send/reply;
- app relaunch visible-session smoke;
- ordinary direct `pi` current-session live mirroring through the global Lyntty Pi extension.

## Setup

```bash
LYNTTY_HOME_DIR=/tmp/lyntty-e2e-r38-server HANDY_MASTER_SECRET=r38-local-secret \
  node packages/lyntty-cli/dist/index.mjs server --host 0.0.0.0 --port 3005 --no-persist

adb -s emulator-5554 install -r packages/lyntty-app/android/app/build/outputs/apk/release/app-release.apk
adb -s emulator-5554 shell pm clear dev.jczhang.lyntty.dev
```

Relay readiness check:

```bash
curl -X POST http://127.0.0.1:3005/v1/version \
  -H 'content-type: application/json' \
  -d '{"platform":"android","version":"1.7.0","app_id":"dev.jczhang.lyntty.dev"}'
# {"updateUrl":null}
```

## Maestro flows

```bash
scripts/e2e/run-maestro.sh e2e/maestro/01_first_run.yml
```

Passed: first-run account creation in 14s.

```bash
LYNTTY_HOME_DIR=/tmp/lyntty-e2e-r38-node LYNTTY_SERVER_URL=http://127.0.0.1:3005 \
  node packages/lyntty-cli/dist/index.mjs auth login --force --method mobile
scripts/e2e/run-maestro.sh e2e/maestro/02_pair_node.yml
```

Passed: Pair Node deep link and Accept Connection flow.

```bash
LYNTTY_HOME_DIR=/tmp/lyntty-e2e-r38-node LYNTTY_SERVER_URL=http://127.0.0.1:3005 \
  node packages/lyntty-cli/dist/index.mjs daemon start

LYNTTY_MAESTRO_HISTORY_TITLE='lyntty: happy fork pi agent support research' \
LYNTTY_MAESTRO_PROMPT='Join R38, E2E, and OK with underscores. Reply with only that token.' \
LYNTTY_MAESTRO_PONG='R38_E2E_OK' \
  scripts/e2e/run-maestro.sh e2e/maestro/03_history_send_reply.yml
```

Passed: historical Pi row opened, prompt sent, assistant reply `R38_E2E_OK` visible in 45s.

```bash
scripts/e2e/run-maestro.sh e2e/maestro/04_reconnect_smoke.yml
```

Passed: app relaunch visible-session smoke in 32s.

## Ordinary `pi` extension live-mirroring smoke

Ran a normal Pi prompt directly, not through `lyntty pi`:

```bash
pi -p --no-tools --name "r38 plugin live R38_PLUGIN_LIVE_190816" \
  "Reply exactly R38_PLUGIN_LIVE_190816"
```

Observed:

- Pi replied `R38_PLUGIN_LIVE_190816` locally.
- Daemon log captured extension-driven relay activity.
- APK Sessions Home showed row `r38 plugin live R38_PLUGIN_LIVE_190816`.
- APK Session Remote showed:
  - title `r38 plugin live R38_PLUGIN_LIVE_190816`;
  - assistant reply `R38_PLUGIN_LIVE_190816`;
  - user prompt `Reply exactly R38_PLUGIN_LIVE_190816`;
  - status `online` and input visible.

This revalidates:

```text
ordinary pi -> global Lyntty Pi extension -> local lynttyd -> relay -> release APK Sessions Home/Session Remote
```

## Artifacts

Under `docs/evidence/artifacts/r38-e2e-validation/`:

- `01_first_run/` — Maestro first-run artifacts.
- `02_pair_node/` — Maestro pairing artifacts with pairing URL redacted.
- `03_history_send_reply/` — historical open/send/reply artifacts.
- `04_reconnect_smoke/` — relaunch smoke artifacts.
- `plugin-live-home.xml` — Sessions Home contains `r38 plugin live R38_PLUGIN_LIVE_190816`.
- `plugin-live-session.xml` — Session Remote contains current ordinary Pi reply and prompt.
- `plugin-live-daemon-tail.log` — daemon relay/mirror tail for ordinary Pi extension smoke.
- `relay.log`, `daemon-start.log`, `auth-login-redacted.log` — local stack logs.

## Security hygiene

Pairing URLs in persisted artifacts were redacted to `lyntty://terminal?<redacted-public-key>`.

## Result

Pass. No product blocker found in this E2E run.

Remaining risk:

- physical Android device validation was not repeated;
- `04_reconnect_smoke` remains app relaunch coverage, not full daemon/relay/network restart automation.
