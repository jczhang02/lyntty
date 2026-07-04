#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
APP_DIR="$ROOT/packages/lyntty-app"
APK_PATH="${LYNTTY_RELEASE_APK:-$APP_DIR/android/app/build/outputs/apk/release/app-release.apk}"
MODE="${LYNTTY_RELEASE_MATRIX_MODE:-local}"
BUILD_APP_ENV="$MODE"
APP_ID="${LYNTTY_MAESTRO_APP_ID:-dev.jczhang.lyntty.dev}"
DEVICE="${LYNTTY_MAESTRO_DEVICE:-$(adb devices 2>/dev/null | awk 'NR==2 {print $1}') }"
DEVICE="${DEVICE%% }"
ARTIFACT_DIR="${LYNTTY_RELEASE_MATRIX_ARTIFACT_DIR:-$ROOT/docs/evidence/artifacts/release-matrix}"
SERVER_URL="${LYNTTY_SERVER_URL:-http://10.0.2.2:3005}"
NODE_HOME="${LYNTTY_RELEASE_MATRIX_NODE_HOME:-$(mktemp -d /tmp/lyntty-release-node.XXXXXX)}"
HISTORY_TITLE="${LYNTTY_MAESTRO_HISTORY_TITLE:-lyntty: happy fork pi agent support research}"
PLUGIN_TOKEN="${LYNTTY_RELEASE_MATRIX_PLUGIN_TOKEN:-RELEASE_MATRIX_PLUGIN_$(date +%H%M%S)}"
HISTORY_PONG="${LYNTTY_MAESTRO_PONG:-RELEASE_MATRIX_HISTORY_$(date +%H%M%S)}"

mkdir -p "$ARTIFACT_DIR"

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || { echo "$1 not found" >&2; exit 127; }
}

require_cmd adb
require_cmd maestro
require_cmd lyntty

if [[ -z "$DEVICE" ]]; then
  echo "No adb device. Start emulator or set LYNTTY_MAESTRO_DEVICE." >&2
  exit 69
fi

case "$MODE" in
  local)
    BUILD_APP_ENV="preview"
    if [[ "$SERVER_URL" != http://10.0.2.2:* && "$SERVER_URL" != http://* ]]; then
      echo "local mode expects emulator-reachable HTTP server URL; got $SERVER_URL" >&2
      exit 64
    fi
    ;;
  production)
    if [[ "$SERVER_URL" != https://* ]]; then
      echo "production mode requires HTTPS LYNTTY_SERVER_URL; got $SERVER_URL" >&2
      exit 64
    fi
    ;;
  *)
    echo "LYNTTY_RELEASE_MATRIX_MODE must be local or production" >&2
    exit 64
    ;;
esac

if [[ "${LYNTTY_RELEASE_MATRIX_BUILD:-1}" == "1" ]]; then
  (cd "$APP_DIR/android" && APP_ENV="$BUILD_APP_ENV" EXPO_PUBLIC_LYNTTY_SERVER_URL="$SERVER_URL" CCACHE_DISABLE=1 CMAKE_C_COMPILER_LAUNCHER= CMAKE_CXX_COMPILER_LAUNCHER= ./gradlew assembleRelease --no-daemon)
fi

adb -s "$DEVICE" install -r "$APK_PATH" >"$ARTIFACT_DIR/install.log"
adb -s "$DEVICE" shell pm clear "$APP_ID" >"$ARTIFACT_DIR/pm-clear.log" || true

if [[ "$MODE" == "local" ]]; then
  LYNTTY_SERVER_URL="http://127.0.0.1:3005" lyntty server --host 0.0.0.0 --port 3005 --no-persist >"$ARTIFACT_DIR/relay.log" 2>&1 &
  RELAY_PID=$!
  cleanup() {
    kill "$RELAY_PID" >/dev/null 2>&1 || true
  }
  trap cleanup EXIT
  sleep 3
else
  RELAY_PID=""
fi

LYNTTY_MAESTRO_DEVICE="$DEVICE" \
LYNTTY_MAESTRO_ARTIFACT_DIR="$ARTIFACT_DIR/01_first_run" \
LYNTTY_MAESTRO_SERVER_URL="$SERVER_URL" \
"$ROOT/scripts/e2e/run-maestro.sh" "$ROOT/e2e/maestro/01_first_run.yml"

PAIR_LOG="$ARTIFACT_DIR/auth-login.log"
CLI_SERVER_URL="$SERVER_URL"
if [[ "$MODE" == "local" ]]; then
  CLI_SERVER_URL="http://127.0.0.1:3005"
fi
LYNTTY_HOME_DIR="$NODE_HOME" LYNTTY_SERVER_URL="$CLI_SERVER_URL" lyntty auth login --force --method mobile >"$PAIR_LOG" 2>&1 &
AUTH_PID=$!
PAIRING_URL=""
for _ in {1..60}; do
  PAIRING_URL="$(grep -Eo 'lyntty://terminal\?[^[:space:]]+' "$PAIR_LOG" | tail -1 || true)"
  [[ -n "$PAIRING_URL" ]] && break
  sleep 1
done
if [[ -z "$PAIRING_URL" ]]; then
  echo "Pairing URL not produced" >&2
  exit 70
fi

LYNTTY_MAESTRO_DEVICE="$DEVICE" \
LYNTTY_MAESTRO_PAIRING_URL="$PAIRING_URL" \
LYNTTY_MAESTRO_NODE_HOME="$NODE_HOME" \
LYNTTY_MAESTRO_SERVER_URL="$CLI_SERVER_URL" \
LYNTTY_MAESTRO_ARTIFACT_DIR="$ARTIFACT_DIR/02_pair_node" \
"$ROOT/scripts/e2e/run-maestro.sh" "$ROOT/e2e/maestro/02_pair_node.yml"
wait "$AUTH_PID" || true
LYNTTY_HOME_DIR="$NODE_HOME" LYNTTY_SERVER_URL="$CLI_SERVER_URL" lyntty daemon start

LYNTTY_HOME_DIR="$NODE_HOME" LYNTTY_SERVER_URL="$CLI_SERVER_URL" pi -p --no-tools "Reply exactly: $PLUGIN_TOKEN" >"$ARTIFACT_DIR/plugin-pi.log" 2>&1
sleep 5
adb -s "$DEVICE" shell uiautomator dump /sdcard/window.xml >/dev/null 2>&1 || true
adb -s "$DEVICE" pull /sdcard/window.xml "$ARTIFACT_DIR/plugin-home.xml" >/dev/null 2>&1 || true

LYNTTY_MAESTRO_DEVICE="$DEVICE" \
LYNTTY_MAESTRO_HISTORY_TITLE="$HISTORY_TITLE" \
LYNTTY_MAESTRO_PONG="$HISTORY_PONG" \
LYNTTY_MAESTRO_PROMPT="Reply exactly: $HISTORY_PONG" \
LYNTTY_MAESTRO_ARTIFACT_DIR="$ARTIFACT_DIR/03_history_send_reply" \
"$ROOT/scripts/e2e/run-maestro.sh" "$ROOT/e2e/maestro/03_history_send_reply.yml"

LYNTTY_MAESTRO_DEVICE="$DEVICE" \
LYNTTY_MAESTRO_ARTIFACT_DIR="$ARTIFACT_DIR/04_reconnect_smoke" \
"$ROOT/scripts/e2e/run-maestro.sh" "$ROOT/e2e/maestro/04_reconnect_smoke.yml"

find "$ARTIFACT_DIR" -type f \( -name '*.log' -o -name '*.xml' -o -name '*.txt' \) | while read -r artifact; do
  python3 - "$artifact" <<'PY'
import re
import sys
from pathlib import Path
path = Path(sys.argv[1])
try:
    text = path.read_text(errors='ignore')
except Exception:
    raise SystemExit(0)
text = re.sub(r'lyntty://terminal\?\S+', 'lyntty://terminal?<redacted-public-key>', text)
text = re.sub(r'"dataEncryptionKey"\s*:\s*"[^"]+"', '"dataEncryptionKey":"<redacted>"', text)
path.write_text(text)
PY
done
if grep -R "lyntty://terminal?\|dataEncryptionKey" -n "$ARTIFACT_DIR"; then
  echo "release matrix artifacts still contain sensitive strings" >&2
  exit 71
fi

echo "Release matrix completed. Artifacts: $ARTIFACT_DIR"
