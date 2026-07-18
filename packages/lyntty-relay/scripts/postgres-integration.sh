#!/usr/bin/env bash
set -euo pipefail

PACKAGE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BINARY="$PACKAGE_DIR/dist/lyntty-relay"
GATE_BASE="$PACKAGE_DIR/dist/test-state"
mkdir -p "$GATE_BASE"
GATE_DIR="$(mktemp -d "$GATE_BASE/postgres-integration.XXXXXX")"
CONTAINER="lyntty-relay-postgres-integration-$$"
POSTGRES_IMAGE="docker.io/library/postgres:17-alpine@sha256:742f40ea20b9ff2ff31db5458d127452988a2164df9e17441e191f3b72252193"
SERVE_PID=""
MIGRATE_PID=""

cleanup() {
  if [[ -n "$MIGRATE_PID" ]]; then kill "$MIGRATE_PID" >/dev/null 2>&1 || true; fi
  if [[ -n "$SERVE_PID" ]]; then kill "$SERVE_PID" >/dev/null 2>&1 || true; fi
  podman rm -f "$CONTAINER" >/dev/null 2>&1 || true
  rm -rf "$GATE_DIR"
}
trap cleanup EXIT

if [[ ! -x "$BINARY" ]]; then
  echo "Missing compiled Relay: $BINARY" >&2
  exit 1
fi
command -v podman >/dev/null

podman run -d --name "$CONTAINER" \
  --tmpfs /var/lib/postgresql/data:rw,size=512m \
  -e POSTGRES_PASSWORD=local-only -e POSTGRES_DB=lyntty \
  -p 127.0.0.1::5432 "$POSTGRES_IMAGE" >/dev/null
PG_PORT="$(podman port "$CONTAINER" 5432/tcp | awk -F: '{print $NF}')"
deadline=$((SECONDS + 30))
until podman exec "$CONTAINER" pg_isready -U postgres -d lyntty >/dev/null 2>&1; do
  if (( SECONDS >= deadline )); then echo "PostgreSQL readiness timed out" >&2; exit 1; fi
  sleep 0.1
done

export DB_PROVIDER=postgres
export DATABASE_URL="postgresql://postgres:local-only@127.0.0.1:$PG_PORT/lyntty"
export LYNTTY_MASTER_SECRET="postgres-integration-local-only"

if "$BINARY" doctor --json >/dev/null 2>"$GATE_DIR/pending-doctor.err"; then
  echo "doctor accepted an unmigrated PostgreSQL database" >&2
  exit 1
fi
if "$BINARY" serve >/dev/null 2>"$GATE_DIR/pending-serve.err"; then
  echo "serve accepted an unmigrated PostgreSQL database" >&2
  exit 1
fi
"$BINARY" migrate >"$GATE_DIR/fresh-migrate.log"

# Simulate an old deployment: preserve an application row, remove compatibility
# metadata, and remove one legacy checksum. Only migrate may repair this state.
podman exec "$CONTAINER" psql -U postgres -d lyntty -v ON_ERROR_STOP=1 -c "
  INSERT INTO \"Account\" (id, \"publicKey\", \"updatedAt\")
  VALUES ('preserved-account', 'preserved-key', now());
  DROP TABLE \"_lyntty_schema_compatibility\";
  UPDATE \"_prisma_migrations\" SET checksum = NULL
  WHERE migration_name = (SELECT MIN(migration_name) FROM \"_prisma_migrations\");
" >/dev/null
if "$BINARY" doctor --json >/dev/null 2>"$GATE_DIR/old-doctor.err"; then
  echo "doctor accepted missing legacy checksums" >&2
  exit 1
fi
"$BINARY" migrate >"$GATE_DIR/old-migrate.log"
test "$(podman exec "$CONTAINER" psql -U postgres -d lyntty -Atc \
  "SELECT count(*) FROM \"Account\" WHERE id='preserved-account'")" = "1"
"$BINARY" doctor --json >"$GATE_DIR/old-doctor.json"
grep -Fq '"migrationAttestationValid":true' "$GATE_DIR/old-doctor.json"

# A prepended unknown migration must invalidate stale complete-set metadata even
# though the old attested head remains lexicographically greatest.
podman exec "$CONTAINER" psql -U postgres -d lyntty -v ON_ERROR_STOP=1 -c "
  INSERT INTO \"_prisma_migrations\"
    (id, checksum, migration_name, finished_at, applied_steps_count)
  VALUES ('prepended-future', repeat('0', 64), '000_future_expand', now(), 1);
" >/dev/null
if "$BINARY" doctor --json >/dev/null 2>"$GATE_DIR/stale-attestation.err"; then
  echo "doctor accepted stale complete-set metadata" >&2
  exit 1
fi
podman exec "$CONTAINER" psql -U postgres -d lyntty -At -c \
  "SELECT migration_name||':'||checksum FROM \"_prisma_migrations\"
   WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL
   ORDER BY migration_name, checksum" >"$GATE_DIR/migration-set.txt"
SET_SHA="$(sha256sum "$GATE_DIR/migration-set.txt" | awk '{print $1}')"
SET_COUNT="$(wc -l < "$GATE_DIR/migration-set.txt")"
HEAD="$(tail -n 1 "$GATE_DIR/migration-set.txt")"
HEAD_NAME="${HEAD%%:*}"
HEAD_SHA="${HEAD#*:}"
podman exec "$CONTAINER" psql -U postgres -d lyntty -v ON_ERROR_STOP=1 -c "
  UPDATE \"_lyntty_schema_compatibility\" SET
    current_relay_schema = 2,
    minimum_relay_schema = 1,
    attested_migration_head = '$HEAD_NAME',
    attested_migration_checksum = '$HEAD_SHA',
    attested_migration_count = $SET_COUNT,
    attested_migration_set_checksum = '$SET_SHA'
  WHERE id = 1;
" >/dev/null
"$BINARY" doctor --json >"$GATE_DIR/additive-doctor.json"
grep -Fq '"ok":true' "$GATE_DIR/additive-doctor.json"

podman exec "$CONTAINER" psql -U postgres -d lyntty -c \
  'UPDATE "_lyntty_schema_compatibility" SET minimum_relay_schema=2 WHERE id=1' >/dev/null
if "$BINARY" doctor --json >/dev/null 2>"$GATE_DIR/contract.err"; then
  echo "doctor accepted an incompatible contract schema" >&2
  exit 1
fi
podman exec "$CONTAINER" psql -U postgres -d lyntty -c \
  'UPDATE "_lyntty_schema_compatibility" SET minimum_relay_schema=1 WHERE id=1' >/dev/null

# Serving holds the shared schema lease for its lifetime; migrate must wait for
# the exclusive form until the server shuts down.
RELAY_PORT="$(bun -e 'const s=Bun.listen({hostname:"127.0.0.1",port:0,socket:{data(){}}});console.log(s.port);s.stop(true)')"
HOST=127.0.0.1 PORT="$RELAY_PORT" "$BINARY" serve >"$GATE_DIR/serve.log" 2>&1 &
SERVE_PID=$!
deadline=$((SECONDS + 30))
until curl -fsS "http://127.0.0.1:$RELAY_PORT/health" >/dev/null; do
  kill -0 "$SERVE_PID"
  if (( SECONDS >= deadline )); then echo "Relay readiness timed out" >&2; exit 1; fi
  sleep 0.1
done
"$BINARY" migrate >"$GATE_DIR/waiting-migrate.log" 2>&1 &
MIGRATE_PID=$!
deadline=$((SECONDS + 15))
until podman exec "$CONTAINER" psql -U postgres -d lyntty -Atc \
  "SELECT count(*) FROM pg_locks WHERE locktype='advisory' AND granted=false" | grep -Eq '^[1-9]'; do
  kill -0 "$MIGRATE_PID"
  if (( SECONDS >= deadline )); then echo "Migration lock wait was not observed" >&2; exit 1; fi
  sleep 0.1
done
kill -TERM "$SERVE_PID"
wait "$SERVE_PID"
SERVE_PID=""
wait "$MIGRATE_PID"
MIGRATE_PID=""

# A real unfinished migration row prevents serving.
podman exec "$CONTAINER" psql -U postgres -d lyntty -v ON_ERROR_STOP=1 -c "
  INSERT INTO \"_prisma_migrations\"
    (id, checksum, migration_name, started_at, applied_steps_count)
  VALUES ('unfinished', repeat('f', 64), '999_unfinished', now(), 0);
" >/dev/null
if "$BINARY" serve >/dev/null 2>"$GATE_DIR/unfinished-serve.err"; then
  echo "serve accepted an unfinished migration" >&2
  exit 1
fi

printf 'PostgreSQL fresh/old migration, preservation, attestation, contract, failure, and lease gate passed\n'
