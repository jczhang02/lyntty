#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
: "${LYNTTY_E2E_NODE_HOME:?set isolated LYNTTY_E2E_NODE_HOME}"
: "${LYNTTY_E2E_PI_HOME:?set isolated LYNTTY_E2E_PI_HOME}"
: "${LYNTTY_E2E_TMUX_SESSION:?set isolated LYNTTY_E2E_TMUX_SESSION}"
: "${LYNTTY_MAESTRO_DEVICE:?set LYNTTY_MAESTRO_DEVICE}"
: "${LYNTTY_MAESTRO_HISTORY_TITLE:?set LYNTTY_MAESTRO_HISTORY_TITLE}"
: "${LYNTTY_MAESTRO_PROMPT:?set a prompt that does not contain the expected reply token}"
: "${LYNTTY_MAESTRO_PONG:?set unique LYNTTY_MAESTRO_PONG}"
[[ "$LYNTTY_MAESTRO_PROMPT" != *"$LYNTTY_MAESTRO_PONG"* ]]

APP_ID="${LYNTTY_MAESTRO_APP_ID:-dev.jczhang.lyntty.dev}"
ARTIFACT_DIR="${LYNTTY_MAESTRO_ARTIFACT_DIR:-$ROOT/docs/evidence/artifacts/maestro-reload-ownership}"
mkdir -p "$ARTIFACT_DIR"

real_home="$(cd "$HOME" && pwd -P)"
node_home="$(cd "$LYNTTY_E2E_NODE_HOME" && pwd -P)"
pi_home="$(cd "$LYNTTY_E2E_PI_HOME" && pwd -P)"
[[ "$node_home" == /tmp/* && "$pi_home" == /tmp/* ]]
[[ "$node_home" != "$real_home" && "$pi_home" != "$real_home" && "$node_home" != "$pi_home" ]]

read -r pane_id pane_pid < <(tmux list-panes -t "$LYNTTY_E2E_TMUX_SESSION" -F '#{pane_id} #{pane_pid}' | head -1)
[[ "$(readlink "/proc/$pane_pid/cwd")" == "$ROOT" ]]
[[ "$(ps -o comm= -p "$pane_pid" | xargs)" == "pi" ]]
tr '\0' '\n' < "/proc/$pane_pid/environ" | grep -Fqx "HOME=$pi_home"
tr '\0' '\n' < "/proc/$pane_pid/environ" | grep -Fqx "LYNTTY_HOME_DIR=$node_home"
tr '\0' ' ' < "/proc/$pane_pid/cmdline" | grep -Eq 'pi .*--session '
baseline_occurrences="$(tmux capture-pane -p -S -1200 -t "$pane_id" | grep -F -c "$LYNTTY_MAESTRO_PONG" || true)"
[[ "$baseline_occurrences" -eq 0 ]]

daemon_pid="$(bun -e 'const p = await Bun.file(process.argv[1]).json(); process.stdout.write(String(p.pid))' "$node_home/daemon.state.json")"
tr '\0' '\n' < "/proc/$daemon_pid/environ" | grep -Fqx "HOME=$pi_home"
tr '\0' '\n' < "/proc/$daemon_pid/environ" | grep -Fqx "LYNTTY_HOME_DIR=$node_home"
daemon_log="$(bun -e 'const p = await Bun.file(process.argv[1]).json(); process.stdout.write(p.daemonLogPath)' "$node_home/daemon.state.json")"
baseline_lines="$(wc -l < "$daemon_log")"
baseline_instance="$(grep "activeExtensionInstanceId:" "$daemon_log" | tail -1 | cut -d"'" -f2)"
[[ -n "$baseline_instance" ]]
# /reload is a Pi TUI command, not an ordinary remote user message. The
# validated isolated pane is the only safe place to drive that command.
tmux send-keys -t "$pane_id" -l -- '/reload'
tmux send-keys -t "$pane_id" Enter
deadline=$((SECONDS + 60))
until tail -n "+$((baseline_lines + 1))" "$daemon_log" | grep -q "eventReason: 'reload'"; do
  (( SECONDS < deadline )) || exit 1
  read -r -t 1 _ || true
done

maestro test "$ROOT/e2e/maestro/07_reload_ownership.yml" \
  --device "$LYNTTY_MAESTRO_DEVICE" --no-reinstall-driver \
  --format JUNIT --output "$ARTIFACT_DIR/junit.xml" \
  -e APP_ID="$APP_ID" \
  -e HISTORY_TITLE="$LYNTTY_MAESTRO_HISTORY_TITLE" \
  -e PROMPT="$LYNTTY_MAESTRO_PROMPT" \
  -e PONG="$LYNTTY_MAESTRO_PONG" >"$ARTIFACT_DIR/maestro.log" 2>&1

tail -n "+$((baseline_lines + 1))" "$daemon_log" >"$ARTIFACT_DIR/daemon-reload-window.log"
reload_claim_block="$(awk -v RS='}\n' '/eventReason: '\''reload'\''/ && /ownership: '\''claimed'\''/ { print; exit }' "$ARTIFACT_DIR/daemon-reload-window.log")"
[[ -n "$reload_claim_block" ]]
printf '%s}\n' "$reload_claim_block" >"$ARTIFACT_DIR/reload-owner-claim.log"
reload_instance="$(printf '%s\n' "$reload_claim_block" | grep "extensionInstanceId:" | head -1 | cut -d"'" -f2)"
[[ -n "$reload_instance" && "$reload_instance" != "$baseline_instance" ]]
occurrences="$(tmux capture-pane -p -S -1200 -t "$pane_id" | grep -F -c "$LYNTTY_MAESTRO_PONG" || true)"
printf 'flow=e2e/maestro/07_reload_ownership.yml\ninteractive_reload_reason_observed=true\nnew_owner_claimed=true\nowner_epoch_changed=true\nbaseline_occurrences=0\npane_occurrences=%s\n' "$occurrences" >"$ARTIFACT_DIR/ownership-check.txt"
[[ "$occurrences" -eq 1 ]]
