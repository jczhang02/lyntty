#!/usr/bin/env bash
set -euo pipefail

PACKAGE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BINARY="$PACKAGE_DIR/dist/lyntty-relay"

if [[ ! -x "$BINARY" ]]; then
  echo "Compiled Relay missing: run bun run build:standalone first" >&2
  exit 1
fi

GATE_DIR="$(mktemp -d "${TMPDIR:-/tmp}/lyntty-relay-compiled-smoke.XXXXXX")"
RELAY_PID=""
cleanup() {
  if [[ -n "$RELAY_PID" ]] && kill -0 "$RELAY_PID" 2>/dev/null; then
    kill -TERM "$RELAY_PID" 2>/dev/null || true
    wait "$RELAY_PID" 2>/dev/null || true
  fi
  rm -rf "$GATE_DIR"
}
trap cleanup EXIT

"$BINARY" --help > "$GATE_DIR/help.txt"
grep -Fq "lyntty-relay migrate" "$GATE_DIR/help.txt"
grep -Fq "lyntty-relay serve" "$GATE_DIR/help.txt"

PORT="$(bun -e 'const server = Bun.listen({ hostname: "127.0.0.1", port: 0, socket: { data() {} } }); console.log(server.port); server.stop(true);')"
export HOME="$GATE_DIR/home"
export DATA_DIR="$GATE_DIR/data"
export PGLITE_DIR="$DATA_DIR/pglite"
export DB_PROVIDER="pglite"
export LYNTTY_MASTER_SECRET="compiled-smoke-local-only"
export HOST="127.0.0.1"
export PORT

"$BINARY" migrate > "$GATE_DIR/migrate.log" 2>&1
grep -Eq "Applied [1-9][0-9]* migration\(s\)\." "$GATE_DIR/migrate.log"
test -n "$(find "$PGLITE_DIR" -type f -print -quit)"

"$BINARY" serve > "$GATE_DIR/serve.log" 2>&1 &
RELAY_PID=$!
deadline=$((SECONDS + 30))
until curl --fail --silent "http://127.0.0.1:$PORT/health" > "$GATE_DIR/health.json"; do
  if ! kill -0 "$RELAY_PID" 2>/dev/null; then
    cat "$GATE_DIR/serve.log" >&2
    exit 1
  fi
  if (( SECONDS >= deadline )); then
    cat "$GATE_DIR/serve.log" >&2
    exit 1
  fi
  sleep 0.1
done

grep -Fq '"status":"ok"' "$GATE_DIR/health.json"
grep -Fq '"service":"lyntty-relay"' "$GATE_DIR/health.json"

kill -TERM "$RELAY_PID"
wait "$RELAY_PID"
RELAY_PID=""
grep -Fq "shutdown handlers completed" "$GATE_DIR/serve.log"

printf 'compiled Relay help, migration, health, and shutdown smoke passed\n'
