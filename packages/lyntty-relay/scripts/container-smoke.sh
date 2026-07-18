#!/usr/bin/env bash
set -euo pipefail

PACKAGE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REPO_ROOT="$(cd "$PACKAGE_DIR/../.." && pwd)"
IMAGE="${LYNTTY_RELAY_IMAGE:-localhost/lyntty-relay:verification}"
POSTGRES_IMAGE="docker.io/library/postgres:17-alpine@sha256:742f40ea20b9ff2ff31db5458d127452988a2164df9e17441e191f3b72252193"
GATE_BASE="$PACKAGE_DIR/dist/test-state"
mkdir -p "$GATE_BASE"
GATE_DIR="$(mktemp -d "$GATE_BASE/container-smoke.XXXXXX")"
POSTGRES_CONTAINER="lyntty-relay-container-postgres-$$"
RELAY_CONTAINER="lyntty-relay-container-serve-$$"

cleanup() {
  podman rm -f "$RELAY_CONTAINER" "$POSTGRES_CONTAINER" >/dev/null 2>&1 || true
  rm -rf "$GATE_DIR"
}
trap cleanup EXIT
command -v podman >/dev/null

if [[ "${LYNTTY_RELAY_SKIP_BUILD:-0}" != "1" ]]; then
  podman build -t "$IMAGE" -f "$REPO_ROOT/Dockerfile" "$REPO_ROOT"
fi

# Runtime image must contain only the compiled Relay plus native operational
# tools. Development JavaScript runtimes are forbidden.
podman run --rm --entrypoint sh "$IMAGE" -c '
  for executable in bun node npm pnpm npx tsx; do
    ! command -v "$executable" >/dev/null 2>&1 || exit 1
  done
  command -v flock >/dev/null
  test "$(pg_dump --version | awk "{print \$3}" | cut -d. -f1)" -ge 17
  test "$(pg_restore --version | awk "{print \$3}" | cut -d. -f1)" -ge 17
  test -x /usr/local/bin/lyntty-relay
  test -s /opt/lyntty-relay/pglite.wasm
  test -s /opt/lyntty-relay/pglite.data
  test -s /opt/lyntty-relay/prisma/migrations/20250713002718_initial/migration.sql
'

mkdir -p "$GATE_DIR/pglite" "$GATE_DIR/postgres-backup"
podman run --rm --userns=keep-id -v "$GATE_DIR/pglite:/work:Z" \
  -e PGLITE_DIR=/work/data -e LYNTTY_MASTER_SECRET=container-local-only \
  "$IMAGE" migrate >/dev/null
podman run --rm --userns=keep-id -v "$GATE_DIR/pglite:/work:Z" \
  -e PGLITE_DIR=/work/data "$IMAGE" backup /work/relay.tar.gz >/dev/null
podman run --rm --userns=keep-id -v "$GATE_DIR/pglite:/work:Z" \
  -e PGLITE_DIR=/work/restored "$IMAGE" restore /work/relay.tar.gz --force >/dev/null
podman run --rm --userns=keep-id -v "$GATE_DIR/pglite:/work:Z" \
  -e PGLITE_DIR=/work/restored -e LYNTTY_MASTER_SECRET=container-local-only \
  "$IMAGE" doctor --json | grep -Fq '"ok":true'

podman run -d --name "$POSTGRES_CONTAINER" \
  --tmpfs /var/lib/postgresql/data:rw,size=512m \
  -e POSTGRES_PASSWORD=local-only -e POSTGRES_DB=lyntty \
  -p 127.0.0.1::5432 "$POSTGRES_IMAGE" >/dev/null
PG_PORT="$(podman port "$POSTGRES_CONTAINER" 5432/tcp | awk -F: '{print $NF}')"
deadline=$((SECONDS + 30))
until podman exec "$POSTGRES_CONTAINER" pg_isready -U postgres -d lyntty >/dev/null 2>&1; do
  if (( SECONDS >= deadline )); then echo "PostgreSQL readiness timed out" >&2; exit 1; fi
  sleep 0.1
done
DATABASE_URL="postgresql://postgres:local-only@127.0.0.1:$PG_PORT/lyntty"
podman run --rm --network host \
  -e DB_PROVIDER=postgres -e DATABASE_URL="$DATABASE_URL" -e LYNTTY_MASTER_SECRET=container-local-only \
  "$IMAGE" migrate >/dev/null
podman exec "$POSTGRES_CONTAINER" psql -U postgres -d lyntty -c \
  "CREATE TABLE restore_probe(value TEXT); INSERT INTO restore_probe VALUES ('before-backup')" >/dev/null
podman run --rm --network host --userns=keep-id -v "$GATE_DIR/postgres-backup:/backup:Z" \
  -e DB_PROVIDER=postgres -e DATABASE_URL="$DATABASE_URL" \
  "$IMAGE" backup /backup/relay.dump >/dev/null
podman exec "$POSTGRES_CONTAINER" psql -U postgres -d lyntty -c \
  "UPDATE restore_probe SET value='after-backup'" >/dev/null
podman run --rm --network host --userns=keep-id -v "$GATE_DIR/postgres-backup:/backup:Z" \
  -e DB_PROVIDER=postgres -e DATABASE_URL="$DATABASE_URL" \
  "$IMAGE" restore /backup/relay.dump --force >/dev/null
test "$(podman exec "$POSTGRES_CONTAINER" psql -U postgres -d lyntty -Atc \
  'SELECT value FROM restore_probe')" = "before-backup"

podman run -d --name "$RELAY_CONTAINER" --userns=keep-id --tmpfs /data:rw,size=512m \
  -e LYNTTY_MASTER_SECRET=container-local-only -p 127.0.0.1::3005 "$IMAGE" >/dev/null
RELAY_PORT="$(podman port "$RELAY_CONTAINER" 3005/tcp | awk -F: '{print $NF}')"
deadline=$((SECONDS + 30))
until curl -fsS "http://127.0.0.1:$RELAY_PORT/health" >"$GATE_DIR/health.json"; do
  podman inspect -f '{{.State.Running}}' "$RELAY_CONTAINER" | grep -q true || {
    podman logs "$RELAY_CONTAINER" >&2
    exit 1
  }
  if (( SECONDS >= deadline )); then echo "Relay readiness timed out" >&2; exit 1; fi
  sleep 0.1
done
grep -Fq '"service":"lyntty-relay"' "$GATE_DIR/health.json"

IMAGE_ID="$(podman image inspect "$IMAGE" --format '{{.Id}}' | sed 's/^sha256://')"
printf 'Relay OCI runtime, sidecars, PGlite/PostgreSQL restore, and default serve passed\nimage_id=%s\n' "$IMAGE_ID"
