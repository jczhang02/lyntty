# R51 self-host server PGlite recovery

Date: 2026-07-04

## User report

`lyntty server --host 0.0.0.0 --port 3005` failed during local PGlite migrations:

```text
RuntimeError: Aborted(). Build with -sASSERTIONS for more info.
      at abort (/$bunfs/root/lyntty-relay:3291:18)
      at <anonymous> (/$bunfs/root/lyntty-relay:7397:26)
      at async _checkReady (/$bunfs/root/lyntty-relay:7217:33)
      at async exec (/$bunfs/root/lyntty-relay:1789:34)
      at async runMigrations (/$bunfs/root/lyntty-relay:184589:16)
```

## Diagnosis

Fresh isolated `lyntty server` data migrated successfully, so the packaged relay and migrations were not globally broken.

Copying the user's existing `/home/jc/.lyntty/server-data` to a temp directory reproduced the exact abort before any SQL migration output:

```bash
TMP=$(mktemp -d /tmp/lyntty-server-usercopy-XXXXXX)
cp -a /home/jc/.lyntty/server-data "$TMP/server-data"
LYNTTY_HOME_DIR="$TMP" lyntty server --host 127.0.0.1 --port 3016 --no-persist
```

Result: PGlite aborted during `_checkReady` while opening the existing database.

Root cause: local PGlite data directory was unopenable/corrupt/incompatible. The relay migration code had no recovery path, so `lyntty server` failed with a raw Bun/PGlite abort.

## Fix

`packages/lyntty-cli/src/commands/server.ts` now:

- captures migration child process output while still streaming it to stdout/stderr;
- detects PGlite open aborts (`RuntimeError: Aborted()` + `_checkReady`);
- in interactive runs, asks whether to move the unopenable PGlite directory aside;
- renames the old DB to `pglite.unopenable-<timestamp>` instead of deleting it;
- creates a fresh PGlite directory and reruns migrations;
- in non-interactive runs, prints an actionable error and preserves the original failure.

## Regression

Added `packages/lyntty-cli/src/commands/server.test.ts` for bundled PGlite abort detection.

## Recovery validation

After rebuilding/installing the CLI, copied the user's existing server data and ran the recovery path through a pseudo-TTY:

```bash
pnpm --filter ./packages/lyntty-cli run cli:install
TMP=$(mktemp -d /tmp/lyntty-server-usercopy-recover-XXXXXX)
cp -a /home/jc/.lyntty/server-data "$TMP/server-data"
printf 'y\n' | script -qfec "env LYNTTY_HOME_DIR=$TMP timeout 45s lyntty server --host 127.0.0.1 --port 3018 --no-persist" /dev/null
```

Observed:

- original copied `pglite` produced the same `RuntimeError: Aborted()`;
- recovery prompt appeared;
- copied DB moved to `server-data/pglite.unopenable-2026-07-04T12-39-01-368Z`;
- fresh migrations applied successfully (`Applied 38 migration(s).`);
- relay started and listened on `http://127.0.0.1:3018`.

The command exited with timeout `124` only because the validation intentionally stopped the running server after 45 seconds.

## Verification

- `pnpm --filter ./packages/lyntty-cli exec vitest run src/commands/server.test.ts` — pass, 2 tests.
- `pnpm --filter ./packages/lyntty-cli typecheck` — pass.
- Recovery validation against copied user server data — pass.

## User-facing recovery

Run the original command again:

```bash
lyntty server --host 0.0.0.0 --port 3005
```

If prompted to move the unopenable PGlite database aside, answer `y`. Existing local relay DB is preserved under `/home/jc/.lyntty/server-data/pglite.unopenable-<timestamp>`; the fresh local relay DB will require account/node pairing again.
