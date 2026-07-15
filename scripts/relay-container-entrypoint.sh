#!/bin/sh
set -eu

provider="${DB_PROVIDER:-}"
if [ -z "$provider" ]; then
  if [ -n "${DATABASE_URL:-}" ]; then
    provider="postgres"
  else
    provider="pglite"
  fi
fi

# Embedded PGlite is migrated automatically. External PostgreSQL migrations are
# an explicit operator job and must complete before the container is started.
if [ "$provider" = "pglite" ]; then
  lyntty-relay migrate
fi

exec lyntty-relay serve "$@"
