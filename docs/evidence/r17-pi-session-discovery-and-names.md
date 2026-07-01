# R17 Pi Session Discovery and Names

## User-reported gaps

1. Lyntty could not fetch historical `pi` sessions or machine-local sessions, so it did not satisfy the Lyntty contract that `pi` JSONL is canonical history on the node.
2. Session title in mobile UI did not match the `pi` session name.

## Changes

### Machine-local Pi session discovery

- Added machine RPC `list-pi-sessions`.
- `lynttyd` now scans local Pi history with `SessionManager.listAll()` for machine-wide discovery.
- Existing cwd-scoped discovery remains supported.
- Results include Lyntty recovery states: `discovered_local`, `registered`, `active_runtime`, `stale_local`, `missing_local_history`, `history_gap`, and `import_failed`.
- Results are redacted before crossing relay/client boundary.

### Open historical Pi sessions

- `spawn-lyntty-session` now forwards `sessionId` as `LYNTTY_PI_SESSION_ID` for `pi`.
- `runPi` opens the matching local Pi JSONL via `SessionManager.open(...)` when `LYNTTY_PI_SESSION_ID` is set.
- Mobile Node Management can start a Lyntty runtime from a discovered local Pi session.

### Mobile Node Management UI

- Machine detail page now has `Pi sessions on this machine`.
- It calls `machineListPiSessions({ scope: 'machine' })`.
- Registered/active rows navigate to the existing relay session when available.
- Discovered local rows spawn a `pi` runtime from that Pi JSONL session.

### Pi session name alignment

- Session metadata now stores `piSessionId` and `name` from `piRuntime.session.sessionName ?? sessionId`.
- `session_info_changed` updates relay metadata when Pi session name changes.
- Mobile `getSessionName()` now uses `metadata.name` before generated summary text, so visible session title follows Pi session name.

## Verification

```bash
pnpm --filter ./packages/lyntty-cli run typecheck
pnpm --filter ./packages/lyntty-cli exec vitest run \
  src/pi/runPiRecovery.test.ts \
  src/api/apiMachine.codexFork.test.ts

pnpm --filter ./packages/lyntty-app run typecheck
pnpm --filter ./packages/lyntty-app exec vitest run \
  sources/sync/piSessionOps.test.ts \
  sources/utils/sessionUtils.test.ts

git diff --check
```

Results:

- CLI typecheck passed.
- CLI focused tests: 18 passed.
- App typecheck passed.
- App focused tests: 4 passed.
- `git diff --check` passed.

## Local Pi history smoke

Direct Pi SDK smoke:

```bash
node --input-type=module - <<'NODE'
import { SessionManager } from './node_modules/@earendil-works/pi-coding-agent/dist/core/session-manager.js';
const rows = await SessionManager.listAll();
console.log(JSON.stringify({ count: rows.length, first: rows[0] && { id: rows[0].id, name: rows[0].name, cwd: rows[0].cwd, messageCount: rows[0].messageCount } }, null, 2));
NODE
```

Observed:

```json
{
  "count": 363,
  "first": {
    "id": "019f17bb-4492-73cd-b28f-61f993c92089",
    "name": "lyntty: happy fork pi agent support research",
    "cwd": "/home/jc/dev/lyntty",
    "messageCount": 3298
  }
}
```

## Remaining risk

- This adds discovery/opening path and mobile Node Management listing. Full Android human-style retest still needed after reinstall/reload.
- Backfill/import of all historical messages into relay cache is still separate from discovery/opening; opening the Pi JSONL gives runtime continuity, but relay-side bulk import remains future work if the product requires offline preview before opening.
