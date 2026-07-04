# R52 daemon start invalid-token recovery

Date: 2026-07-04

## User report

`lyntty daemon start` could not start and printed only:

```text
Failed to start daemon
```

## Reproduction

With local relay listening on `0.0.0.0:3005`, `lyntty daemon start` spawned `daemon start-sync`, then timed out waiting for daemon state.

Latest daemon log showed relay machine registration failed with 401:

```text
data: { error: 'Invalid token' }
status: 401
[DAEMON RUN] Process exiting with code: 1
```

Root cause: after local self-hosted relay DB reset/recovery, CLI still had stale credentials in `$LYNTTY_HOME_DIR/access.key`. The daemon child hit `/v1/machines` with an invalid token, exited, and the parent process hid the real cause behind generic `Failed to start daemon`.

## Fix

- `lyntty daemon start` now performs foreground auth/machine preflight before spawning detached `start-sync`.
- Relay 401 on machine registration now throws an actionable message:

```text
Lyntty authentication expired or the relay data was reset. Run `lyntty auth login --force --method mobile`, then `lyntty daemon start`.
```

- Daemon fatal exception logging no longer logs the full Axios error object, avoiding accidental bearer-token/header leakage in daemon logs.

## Validation

After rebuilding/installing CLI:

```bash
pnpm --filter ./packages/lyntty-cli run cli:install
lyntty daemon start
```

Result:

```text
Failed to start daemon: Lyntty authentication expired or the relay data was reset. Run `lyntty auth login --force --method mobile`, then `lyntty daemon start`.
```

This is the expected state for stale credentials after local relay DB reset.

## Verification

- `pnpm --filter ./packages/lyntty-cli exec vitest run src/api/api.test.ts` — pass, 10 tests.
- `pnpm --filter ./packages/lyntty-cli typecheck` — pass.

## User recovery

Run:

```bash
lyntty auth login --force --method mobile
lyntty daemon start
```

Then re-pair the phone if needed, because the local relay DB was recreated.
