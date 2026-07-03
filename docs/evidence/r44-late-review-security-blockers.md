# R44 late review security blockers

Date: 2026-07-04
Task: `lyntty-idd`.

## Trigger

Late R43 subagent outputs arrived after commit `9c429fa` and reported unresolved blockers in relay/socket security and E2E coverage. R44 addresses local code blockers and records remaining E2E automation gaps.

## Fixes

- Socket resource binding:
  - session-scoped sockets can mutate only their bound session.
  - machine-scoped sockets cannot mutate session messages/state.
  - machine daemon state/alive updates require the bound machine.
  - user-scoped sockets remain allowed for app-driven machine metadata edits.
  - access-key socket reads are restricted by caller scope.
- Socket handshake now verifies claimed session/machine ids belong to the token account before accepting scoped sockets.
- Auth request approval is now atomic and rejects cross-account overwrite of already-authorized terminal/account requests.
- Artifact REST and socket updates now use atomic `seq: { increment: 1 }` and reject seq-only/no-op REST updates.
- v3 message idempotency retries unique-localId races with a bounded retry loop.
- JSON parse errors no longer log raw request bodies; logs record body length only.
- R43 evidence doc records late-review coverage limitations and artifact hygiene.

## Verification

```bash
pnpm --filter ./packages/lyntty-relay exec vitest run \
  sources/app/api/socket/scopeGuards.spec.ts \
  sources/app/api/socket/rpcHandler.spec.ts \
  sources/app/api/routes/artifactsRoutes.test.ts \
  sources/app/api/routes/v3SessionRoutes.test.ts \
  sources/app/api/routes/machinesRoutes.spec.ts

pnpm --filter ./packages/lyntty-relay typecheck
pnpm --filter ./packages/lyntty-app typecheck
pnpm --filter ./packages/lyntty-cli typecheck
pnpm --filter ./packages/lyntty-relay test -- --run
git diff --check
```

Results:

- Focused relay tests: 5 files / 25 tests passed.
- Full relay suite: 14 files / 92 tests passed.
- relay/app/cli typechecks passed.
- diff check passed.

## Remaining non-blocking gaps

- Full committed Maestro matrix still needs more flows: server config, manual URL pairing, stale-token release E2E, relay restart, archive action, machine management, and security-negative pairing/token cases.
- Access-key socket scope intentionally binds to whichever resource the caller owns (`sessionId` for session sockets, `machineId` for machine sockets); stricter double-binding would need product design.
- v3 localId concurrency has bounded retry logic but no deterministic parallel race test yet.
