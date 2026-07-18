#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
: "${LYNTTY_E2E_NODE_HOME:?set isolated LYNTTY_E2E_NODE_HOME}"
: "${LYNTTY_E2E_PI_HOME:?set isolated LYNTTY_E2E_PI_HOME}"
: "${LYNTTY_E2E_TMUX_SESSION:?set isolated LYNTTY_E2E_TMUX_SESSION}"
: "${LYNTTY_E2E_RELAY_LOG:?set LYNTTY_E2E_RELAY_LOG}"
: "${LYNTTY_E2E_RELAY_SESSION_ID:?set the exact target relay session id}"
[[ "$LYNTTY_E2E_RELAY_SESSION_ID" =~ ^[A-Za-z0-9_-]+$ ]]
: "${LYNTTY_MAESTRO_DEVICE:?set LYNTTY_MAESTRO_DEVICE}"
: "${LYNTTY_MAESTRO_HISTORY_TITLE:?set LYNTTY_MAESTRO_HISTORY_TITLE}"
: "${LYNTTY_MAESTRO_PROMPT:?set a prompt that does not contain the expected reply token}"
: "${LYNTTY_MAESTRO_PONG:?set unique LYNTTY_MAESTRO_PONG}"
[[ "$LYNTTY_MAESTRO_PROMPT" != *"$LYNTTY_MAESTRO_PONG"* ]]

APP_ID="${LYNTTY_MAESTRO_APP_ID:-dev.jczhang.lyntty.dev}"
SERVER_URL="${LYNTTY_SERVER_URL:-http://127.0.0.1:3005}"
ARTIFACT_DIR="${LYNTTY_MAESTRO_ARTIFACT_DIR:-$ROOT/docs/evidence/artifacts/maestro-daemon-restart}"
if [[ -n "${LYNTTY_E2E_CLI_EXECUTABLE:-}" ]]; then
  CLI=("$LYNTTY_E2E_CLI_EXECUTABLE")
elif [[ -x "$ROOT/packages/lyntty-cli/dist/compiled/lyntty" ]]; then
  CLI=("$ROOT/packages/lyntty-cli/dist/compiled/lyntty")
else
  CLI=(bun "$ROOT/packages/lyntty-cli/src/index.ts")
fi
mkdir -p "$ARTIFACT_DIR"

real_home="$(cd "$HOME" && pwd -P)"
node_home="$(cd "$LYNTTY_E2E_NODE_HOME" && pwd -P)"
pi_home="$(cd "$LYNTTY_E2E_PI_HOME" && pwd -P)"
is_isolated_state() {
  [[ "$1" == /tmp/lyntty-* || "$1" == "$ROOT"/dist/test-state/* ]]
}
is_isolated_state "$node_home"
is_isolated_state "$pi_home"
[[ "$node_home" != "$real_home" && "$pi_home" != "$real_home" && "$node_home" != "$pi_home" ]]

read -r pane_id pane_pid < <(tmux list-panes -t "$LYNTTY_E2E_TMUX_SESSION" -F '#{pane_id} #{pane_pid}' | head -1)
[[ "$(readlink "/proc/$pane_pid/cwd")" == "$ROOT" ]]
[[ "$(ps -o comm= -p "$pane_pid" | xargs)" == "pi" ]]
tr '\0' '\n' < "/proc/$pane_pid/environ" | grep -Fqx "HOME=$pi_home"
tr '\0' '\n' < "/proc/$pane_pid/environ" | grep -Fqx "LYNTTY_HOME_DIR=$node_home"
tr '\0' ' ' < "/proc/$pane_pid/cmdline" | grep -Eq 'pi .*--session(-id)? '
baseline_occurrences="$(tmux capture-pane -p -S -1200 -t "$pane_id" | grep -F -c "$LYNTTY_MAESTRO_PONG" || true)"
[[ "$baseline_occurrences" -eq 0 ]]

daemon_pid="$(bun -e 'const p = await Bun.file(process.argv[1]).json(); process.stdout.write(String(p.pid))' "$node_home/daemon.state.json")"
tr '\0' '\n' < "/proc/$daemon_pid/environ" | grep -Fqx "HOME=$pi_home"
tr '\0' '\n' < "/proc/$daemon_pid/environ" | grep -Fqx "LYNTTY_HOME_DIR=$node_home"

start_isolated_daemon() {
  if [[ -n "${LYNTTY_E2E_DAEMON_EXECUTABLE:-}" ]]; then
    HOME="$pi_home" LYNTTY_HOME_DIR="$node_home" LYNTTY_SERVER_URL="$SERVER_URL" \
      "$LYNTTY_E2E_DAEMON_EXECUTABLE" >>"$ARTIFACT_DIR/direct-daemon.log" 2>&1 &
    local deadline=$((SECONDS + 30))
    until [[ -s "$node_home/daemon.state.json" ]] && {
      local pid
      pid="$(bun -e 'const p=await Bun.file(process.argv[1]).json(); process.stdout.write(String(p.pid))' "$node_home/daemon.state.json" 2>/dev/null || true)"
      [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null
    }; do
      (( SECONDS < deadline )) || return 1
      read -r -t 1 _ || true
    done
  else
    HOME="$pi_home" LYNTTY_HOME_DIR="$node_home" LYNTTY_SERVER_URL="$SERVER_URL" "${CLI[@]}" daemon start
  fi
}

stop_isolated_daemon() {
  if [[ -n "${LYNTTY_E2E_DAEMON_EXECUTABLE:-}" ]]; then
    local pid="$1"
    kill -TERM "$pid"
    local deadline=$((SECONDS + 30))
    while kill -0 "$pid" 2>/dev/null; do
      (( SECONDS < deadline )) || return 1
      read -r -t 1 _ || true
    done
  else
    HOME="$pi_home" LYNTTY_HOME_DIR="$node_home" LYNTTY_SERVER_URL="$SERVER_URL" "${CLI[@]}" daemon stop
  fi
}

maestro_pid=''
daemon_stopped=false
cleanup() {
  if [[ -n "$maestro_pid" ]] && kill -0 "$maestro_pid" 2>/dev/null; then kill "$maestro_pid" 2>/dev/null || true; fi
  if [[ "$daemon_stopped" == true ]]; then start_isolated_daemon >/dev/null 2>&1 || true; fi
}
trap cleanup EXIT

stop_isolated_daemon "$daemon_pid" >"$ARTIFACT_DIR/daemon-stop.log"
daemon_stopped=true
message_post_pattern="\"url\": \"/v3/sessions/$LYNTTY_E2E_RELAY_SESSION_ID/messages\""
baseline_posts="$(grep -E -c "$message_post_pattern" "$LYNTTY_E2E_RELAY_LOG" || true)"

maestro test "$ROOT/e2e/maestro/05_daemon_restart_replay.yml" \
  --device "$LYNTTY_MAESTRO_DEVICE" --no-reinstall-driver \
  --format JUNIT --output "$ARTIFACT_DIR/junit.xml" \
  -e APP_ID="$APP_ID" \
  -e HISTORY_TITLE="$LYNTTY_MAESTRO_HISTORY_TITLE" \
  -e PROMPT="$LYNTTY_MAESTRO_PROMPT" \
  -e PONG="$LYNTTY_MAESTRO_PONG" >"$ARTIFACT_DIR/maestro.log" 2>&1 &
maestro_pid=$!

deadline=$((SECONDS + 120))
until (( $(grep -E -c "$message_post_pattern" "$LYNTTY_E2E_RELAY_LOG" || true) > baseline_posts )); do
  kill -0 "$maestro_pid" 2>/dev/null || { cat "$ARTIFACT_DIR/maestro.log"; exit 1; }
  (( SECONDS < deadline )) || { kill "$maestro_pid" 2>/dev/null || true; exit 1; }
  read -r -t 1 _ || true
done
printf 'target_relay_session=%s\nbaseline_pane_occurrences=0\nphone_command_persisted_before_daemon_restart=true\n' "$LYNTTY_E2E_RELAY_SESSION_ID" >"$ARTIFACT_DIR/restart-checkpoint.txt"

start_isolated_daemon >"$ARTIFACT_DIR/daemon-start.log"
daemon_stopped=false
wait "$maestro_pid"
maestro_pid=''

occurrences="$(tmux capture-pane -p -S -1200 -t "$pane_id" | grep -F -c "$LYNTTY_MAESTRO_PONG" || true)"
printf 'token=%s\npane_occurrences=%s\n' "$LYNTTY_MAESTRO_PONG" "$occurrences" >"$ARTIFACT_DIR/pi-token-count.txt"
[[ "$occurrences" -eq 1 ]]
