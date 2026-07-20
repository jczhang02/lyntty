#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
FLOW_PATH="${1:-e2e/maestro}"
APP_ID="${LYNTTY_MAESTRO_APP_ID:-dev.jczhang.lyntty.dev}"
DEVICE="${LYNTTY_MAESTRO_DEVICE:-}"
ARTIFACT_DIR="${LYNTTY_MAESTRO_ARTIFACT_DIR:-docs/evidence/artifacts/maestro}"
PAIRING_URL="${LYNTTY_MAESTRO_PAIRING_URL:-}"
HISTORY_TITLE="${LYNTTY_MAESTRO_HISTORY_TITLE:-jc: pi sum calculation session}"
PONG="${LYNTTY_MAESTRO_PONG:-MAESTRO_PONG}"
PROMPT="${LYNTTY_MAESTRO_PROMPT:-Join MAESTRO and PONG with one underscore. Reply with only the result.}"
UPDATE_VERSION_NAME="${LYNTTY_MAESTRO_UPDATE_VERSION_NAME:-}"
PRELAUNCH="${LYNTTY_MAESTRO_PRELAUNCH:-1}"
NODE_HOME="${LYNTTY_MAESTRO_NODE_HOME:-}"
SERVER_URL="${LYNTTY_MAESTRO_SERVER_URL:-${LYNTTY_SERVER_URL:-}}"
RUNTIME_BASE="${LYNTTY_MAESTRO_RUNTIME_DIR:-$ROOT/dist/test-state/maestro-runtime}"

if ! command -v maestro >/dev/null 2>&1; then
  echo "maestro not found; install Maestro before running E2E" >&2
  exit 127
fi

mkdir -p "$ARTIFACT_DIR"

requires_pairing_url=false
case "$FLOW_PATH" in
  *02_pair_node.yml*)
    requires_pairing_url=true
    ;;
esac
if [[ -d "$FLOW_PATH" && -e "$FLOW_PATH/02_pair_node.yml" ]]; then
  requires_pairing_url=true
fi
if [[ "$requires_pairing_url" == true && -z "$PAIRING_URL" ]]; then
  echo "LYNTTY_MAESTRO_PAIRING_URL is required for $FLOW_PATH" >&2
  exit 64
fi

if [[ -d "$FLOW_PATH" ]]; then
  status=0
  for flow in "$FLOW_PATH"/*.yml; do
    flow_name="$(basename "$flow" .yml)"
    if [[ "$flow_name" =~ ^(09_full_apk_update|10_bad_apk_hash)$ && -z "$UPDATE_VERSION_NAME" ]]; then
      echo "==> Skipping $flow_name (set LYNTTY_MAESTRO_UPDATE_VERSION_NAME after staging an update)"
      continue
    fi
    echo "==> Running $flow_name"
    if [[ "$flow_name" == "05_daemon_restart_replay" ]]; then
      if ! LYNTTY_MAESTRO_ARTIFACT_DIR="$ARTIFACT_DIR/$flow_name" "$ROOT/scripts/e2e/maestro-daemon-restart.sh"; then status=1; fi
      continue
    fi
    if [[ "$flow_name" == "07_reload_ownership" ]]; then
      if ! LYNTTY_MAESTRO_ARTIFACT_DIR="$ARTIFACT_DIR/$flow_name" "$ROOT/scripts/e2e/maestro-reload-ownership.sh"; then status=1; fi
      continue
    fi
    if LYNTTY_MAESTRO_ARTIFACT_DIR="$ARTIFACT_DIR/$flow_name" "$0" "$flow"; then
      if [[ "$flow_name" == "02_pair_node" && -n "$NODE_HOME" ]]; then
        echo "==> Starting paired node daemon"
        if [[ -n "$SERVER_URL" ]]; then
          LYNTTY_HOME_DIR="$NODE_HOME" LYNTTY_SERVER_URL="$SERVER_URL" lyntty daemon start
        else
          LYNTTY_HOME_DIR="$NODE_HOME" lyntty daemon start
        fi
      fi
    else
      status=1
    fi
  done
  exit "$status"
fi

case "$(basename "$FLOW_PATH")" in
  05_daemon_restart_replay.yml)
    echo "Run scripts/e2e/maestro-daemon-restart.sh so the restart and exactly-once checks cannot be bypassed" >&2
    exit 64
    ;;
  07_reload_ownership.yml)
    echo "Run scripts/e2e/maestro-reload-ownership.sh so isolated Pi /reload and ownership checks cannot be bypassed" >&2
    exit 64
    ;;
esac

rendered_flow="$FLOW_PATH"
cleanup_dir=""
if [[ -f "$FLOW_PATH" ]]; then
  mkdir -p "$RUNTIME_BASE"
  cleanup_dir="$(mktemp -d "$RUNTIME_BASE/render.XXXXXX")"
  trap '[[ -n "$cleanup_dir" ]] && rm -rf "$cleanup_dir"' EXIT
  export FLOW_PATH APP_ID PAIRING_URL HISTORY_TITLE PONG PROMPT UPDATE_VERSION_NAME SERVER_URL CLEANUP_DIR="$cleanup_dir"
  rendered_flow="$(python - <<'PY'
import os
from pathlib import Path

source = Path(os.environ["FLOW_PATH"])
target_root = Path(os.environ["CLEANUP_DIR"])
replacements = {
    "${APP_ID}": os.environ["APP_ID"],
    "${PAIRING_URL}": os.environ["PAIRING_URL"],
    "${HISTORY_TITLE}": os.environ["HISTORY_TITLE"],
    "${PONG}": os.environ["PONG"],
    "${PROMPT}": os.environ["PROMPT"],
    "${UPDATE_VERSION_NAME}": os.environ["UPDATE_VERSION_NAME"],
    "${SERVER_URL}": os.environ["SERVER_URL"],
}

def render_file(src: Path, dst: Path) -> None:
    text = src.read_text()
    for key, value in replacements.items():
        text = text.replace(key, value)
    dst.write_text(text)

if source.is_file():
    target = target_root / source.name
    render_file(source, target)
    print(target)
else:
    target = target_root / source.name
    target.mkdir(parents=True, exist_ok=True)
    for flow in sorted(source.glob("*.yml")):
        render_file(flow, target / flow.name)
    print(target)
PY
)"
fi

run_maestro_flow() {
  local flow="$1"
  local artifact_dir="$2"
  local output_name="${3:-junit.xml}"
  local args=(test "$flow" --debug-output "$artifact_dir/debug" --test-output-dir "$artifact_dir/output" --format JUNIT --output "$artifact_dir/$output_name" -e APP_ID="$APP_ID" -e PAIRING_URL="$PAIRING_URL" -e HISTORY_TITLE="$HISTORY_TITLE" -e PONG="$PONG" -e PROMPT="$PROMPT" -e UPDATE_VERSION_NAME="$UPDATE_VERSION_NAME")
  if [[ -n "$DEVICE" ]]; then
    args+=(--device "$DEVICE")
  fi
  maestro "${args[@]}"
}

if [[ "$PRELAUNCH" != "0" && -n "$DEVICE" ]] && command -v adb >/dev/null 2>&1; then
  adb -s "$DEVICE" shell am force-stop "$APP_ID" >/dev/null 2>&1 || true
  adb -s "$DEVICE" shell am start -n "$APP_ID/.MainActivity" >/dev/null 2>&1 || true
  sleep 2
fi

if [[ "$(basename "$FLOW_PATH")" == "02_pair_node.yml" && -n "$PAIRING_URL" && -n "$DEVICE" ]] && command -v adb >/dev/null 2>&1; then
  mkdir -p "$RUNTIME_BASE"
  if [[ -z "$cleanup_dir" ]]; then
    cleanup_dir="$(mktemp -d "$RUNTIME_BASE/pair.XXXXXX")"
    trap '[[ -n "$cleanup_dir" ]] && rm -rf "$cleanup_dir"' EXIT
  fi
  pair_dir="$cleanup_dir"
  prep_flow="$pair_dir/02_pair_node_prepare.yml"
  accept_flow="$pair_dir/02_pair_node_accept.yml"
  cat >"$prep_flow" <<EOF
appId: $APP_ID
name: Lyntty terminal pairing prepare
---
- launchApp
- runFlow:
    when:
      visible: "DEVELOPMENT SERVERS"
    commands:
      - tapOn: "http://10.0.2.2:8081"
- runFlow:
    when:
      visible: "Continue"
    commands:
      - tapOn: "Continue"
- runFlow:
    when:
      visible: "Reload"
    commands:
      - tapOn:
          point: "90%,46%"
EOF
  cat >"$accept_flow" <<EOF
appId: $APP_ID
name: Lyntty terminal pairing accept
---
- extendedWaitUntil:
    visible: "Pair Node"
    timeout: 30000
- assertVisible: "End-to-end encrypted"
- tapOn:
    id: "lyntty-pair-accept"
- extendedWaitUntil:
    visible: "Terminal connected successfully"
    timeout: 60000
EOF
  run_maestro_flow "$prep_flow" "$ARTIFACT_DIR/prepare" "prepare-junit.xml"
  adb -s "$DEVICE" shell am start -W -a android.intent.action.VIEW -c android.intent.category.BROWSABLE -d "$PAIRING_URL" "$APP_ID" >"$ARTIFACT_DIR/adb-openlink.log" 2>&1
  sleep 1
  adb -s "$DEVICE" shell am start -W -a android.intent.action.VIEW -c android.intent.category.BROWSABLE -d "$PAIRING_URL" "$APP_ID" >>"$ARTIFACT_DIR/adb-openlink.log" 2>&1
  sleep 2
  run_maestro_flow "$accept_flow" "$ARTIFACT_DIR/accept" "accept-junit.xml"
  exit $?
fi

run_maestro_flow "$rendered_flow" "$ARTIFACT_DIR" "junit.xml"
