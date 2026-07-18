#!/usr/bin/env bash
set -euo pipefail

summary="${1:?usage: gradle-runtime-audit.sh <summary-path> -- <command> [args...]}"
shift
if [[ "${1:-}" != "--" ]]; then echo "missing -- before audited command" >&2; exit 1; fi
shift
if [[ "$#" -eq 0 ]]; then echo "audited command is required" >&2; exit 1; fi
command -v strace >/dev/null
bun_executable="${BUN_EXECUTABLE:-$(command -v bun)}"
package_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
audit_base="${LYNTTY_ANDROID_AUDIT_ROOT:-$package_dir/dist/test-state/runtime-audit}"
mkdir -p "$audit_base"
audit_dir="$(mktemp -d "$audit_base/run.XXXXXX")"
sentinel_dir="$audit_dir/forbidden-js-runtimes"
sentinel_log="$audit_dir/forbidden-js-runtimes.log"
trace_log="$audit_dir/android-execve.log"
cleanup() { rm -rf "$audit_dir"; }
trap cleanup EXIT
mkdir -p "$sentinel_dir" "$(dirname "$summary")"
for executable in node npm pnpm npx tsx; do
  cat > "$sentinel_dir/$executable" <<'SH'
#!/bin/sh
printf '%s\n' "$(basename "$0")" >> "${LYNTTY_RUNTIME_SENTINEL_LOG:?}"
exit 97
SH
  chmod 755 "$sentinel_dir/$executable"
done

export LYNTTY_RUNTIME_SENTINEL_LOG="$sentinel_log"
export BUN_EXECUTABLE="$bun_executable"
export PATH="$sentinel_dir:$PATH"
set +e
strace -f -qq -e trace=execve -o "$trace_log" "$@"
build_status=$?
set -e
TRACE_LOG="$trace_log" SENTINEL_LOG="$sentinel_log" AUDIT_SUMMARY="$summary" "$bun_executable" - <<'BUN'
import { basename } from 'node:path';
const forbidden = new Set(['node', 'npm', 'pnpm', 'npx', 'tsx']);
const trace = await Bun.file(process.env.TRACE_LOG).text();
const hits = new Set();
for (const line of trace.split('\n')) {
    const match = line.match(/execve\("([^"]+)"/);
    if (!match) continue;
    const executable = basename(match[1]).toLowerCase();
    if (forbidden.has(executable)) hits.add(executable);
}
const sentinel = await Bun.file(process.env.SENTINEL_LOG).exists()
    ? (await Bun.file(process.env.SENTINEL_LOG).text()).trim()
    : '';
if (hits.size || sentinel) {
    throw new Error(`Forbidden JavaScript runtime executed: ${[...hits, sentinel].filter(Boolean).join(', ')}`);
}
await Bun.write(process.env.AUDIT_SUMMARY,
    `Node-family execve matches: 0\nSentinel invocations: 0\nTrace source: strace -f -e execve\n`);
BUN
if [[ "$build_status" -ne 0 ]]; then
  echo "Audited command failed with status $build_status" >&2
  exit "$build_status"
fi
