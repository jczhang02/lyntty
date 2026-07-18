#!/usr/bin/env bash
set -euo pipefail

PACKAGE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BINARY="$PACKAGE_DIR/dist/lyntty-relay"

if [[ ! -x "$BINARY" ]]; then
  echo "Compiled Relay missing: run bun run build:standalone first" >&2
  exit 1
fi

GATE_BASE="$PACKAGE_DIR/dist/test-state"
mkdir -p "$GATE_BASE"
GATE_DIR="$(mktemp -d "$GATE_BASE/compiled-smoke.XXXXXX")"
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
grep -Fq "lyntty-relay doctor" "$GATE_DIR/help.txt"
grep -Fq "lyntty-relay backup" "$GATE_DIR/help.txt"
grep -Fq "lyntty-relay restore" "$GATE_DIR/help.txt"
grep -Fq "lyntty-relay serve" "$GATE_DIR/help.txt"

PORT="$(bun -e 'const server = Bun.listen({ hostname: "127.0.0.1", port: 0, socket: { data() {} } }); console.log(server.port); server.stop(true);')"
export HOME="$GATE_DIR/home"
export DATA_DIR="$GATE_DIR/data"
export PGLITE_DIR="$DATA_DIR/pglite"
export DB_PROVIDER="pglite"
export LYNTTY_MASTER_SECRET="compiled-smoke-local-only"
export HOST="127.0.0.1"
export PORT

SENTINEL_DIR="$GATE_DIR/sentinel"
SENTINEL_LOG="$GATE_DIR/runtime-sentinel.log"
mkdir -p "$SENTINEL_DIR"
for executable in bun node npm pnpm npx tsx; do
  printf '#!/bin/sh\nprintf "%%s\\n" "%s" >> "$LYNTTY_SENTINEL_LOG"\nexit 97\n' "$executable" > "$SENTINEL_DIR/$executable"
  chmod 755 "$SENTINEL_DIR/$executable"
done
export LYNTTY_SENTINEL_LOG="$SENTINEL_LOG"
export PATH="$SENTINEL_DIR:$PATH"

"$BINARY" migrate > "$GATE_DIR/migrate.log" 2>&1
grep -Eq "Applied [1-9][0-9]* migration\(s\)\." "$GATE_DIR/migrate.log"
test -n "$(find "$PGLITE_DIR" -type f -print -quit)"
"$BINARY" doctor --json > "$GATE_DIR/doctor.json"
grep -Fq '"ok":true' "$GATE_DIR/doctor.json"
grep -Fq '"provider":"pglite"' "$GATE_DIR/doctor.json"
"$BINARY" backup "$GATE_DIR/relay-backup.tar.gz" > "$GATE_DIR/backup.json"
test -s "$GATE_DIR/relay-backup.tar.gz"
test -s "$GATE_DIR/relay-backup.tar.gz.sha256"
grep -Fq '"provider":"pglite"' "$GATE_DIR/backup.json"
RESTORED_PGLITE_DIR="$DATA_DIR/restored-pglite"
PGLITE_DIR="$RESTORED_PGLITE_DIR" "$BINARY" restore "$GATE_DIR/relay-backup.tar.gz" --force > "$GATE_DIR/restore.json"
PGLITE_DIR="$RESTORED_PGLITE_DIR" "$BINARY" doctor --json > "$GATE_DIR/restored-doctor.json"
grep -Fq '"ok":true' "$GATE_DIR/restored-doctor.json"

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
if "$BINARY" backup "$GATE_DIR/live-backup.tar.gz" > "$GATE_DIR/live-backup.out" 2> "$GATE_DIR/live-backup.err"; then
  echo "PGlite backup unexpectedly succeeded while Relay held the lifecycle lease" >&2
  exit 1
fi
grep -Fq "PGlite is busy" "$GATE_DIR/live-backup.err"

kill -TERM "$RELAY_PID"
wait "$RELAY_PID"
RELAY_PID=""
grep -Fq "shutdown handlers completed" "$GATE_DIR/serve.log"
test ! -e "$SENTINEL_LOG"

printf 'compiled Relay help, migration, doctor, backup/restore, health, shutdown, and runtime-sentinel smoke passed\n'
