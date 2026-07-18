#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 1 ]]; then
  echo "usage: gradle-production-guard-test.sh <output-summary>" >&2
  exit 64
fi

summary="$1"
gradle="${LYNTTY_ANDROID_GRADLEW:-./gradlew}"
mkdir -p "$(dirname "$summary")"
: > "$summary"

for task in :app:assembleDebug :app:build; do
  log="${summary}.${task//:/_}.log"
  if APP_ENV=production "$gradle" "$task" --dry-run --no-daemon >"$log" 2>&1; then
    echo "Production guard unexpectedly allowed $task" >&2
    exit 1
  fi
  grep -Fq 'APP_ENV=production permits explicit Release tasks only' "$log"
  printf '%s=blocked\n' "$task" >> "$summary"
  rm -f "$log"
done
