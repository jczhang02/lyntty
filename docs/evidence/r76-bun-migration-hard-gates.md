# R76 Bun migration hard-gate evidence

Date: 2026-07-15
Branch/worktree: `refactor/bun-migration` / `worktrees/bun-migration`
Bead: `lyntty-6o0.1`

## Result

**PASS** — the clean-install precondition and three product feasibility gates required before the repository-wide migration all passed:

1. A clean frozen Bun install completed with audited lifecycle scripts and no actual Node runtime.
2. Android release-style APK built through Bun with no Node-family executable available or executed.
3. Compiled `lyntty` and `lynttyd` ran without Bun or Node; the compiled CLI installed the Pi extension into an isolated temporary `HOME`.
4. Prisma 7 client-engine Relay worked with both the existing PGlite data format and PostgreSQL, including migrations, preserved seed data, compiled serving, health checks, and graceful shutdown.

All tests used temporary state and non-default ports. No live `~/.pi`, `~/.lyntty`, Pi pane, production Relay, production database, or production signing material was touched.

## Clean frozen install

A clean install was performed after moving the existing `node_modules` aside. It used the frozen `bun.lock`, normal audited lifecycle scripts, a temporary `HOME`, and a filtered path with no system `node`, `npm`, `pnpm`, `npx`, or `tsx`.

Outcome:

- `2410 packages installed`
- Root and workspace lifecycle scripts completed.
- `bun pm untrusted`: `0`
- Actual Node/npm/pnpm/npx/tsx runtime executions: `0`

Bun creates an internal temporary `node`-named compatibility symlink for trusted third-party lifecycle shebangs. The trace resolved that symlink to `/usr/bin/bun`, and its SHA-256 was identical to the pinned Bun executable. This is Bun executing Node-compatible JavaScript APIs, not a Node runtime or fallback.

## Gate 1: Android without Node

The final build started from that clean dependency tree. Project Gradle/native outputs, including `.cxx`, were removed. It used Bun `1.3.14`, Java 21, Android SDK `/opt/android-sdk`, a temporary `HOME`, a fresh isolated `GRADLE_USER_HOME`, Android home, cache, and a filtered `PATH`. The filtered path exposed Bun and required native shell/build tools but did not expose `node`, `npm`, `pnpm`, `npx`, or `tsx`.

Representative command:

```bash
APP_ENV=development \
BUN_EXECUTABLE=/usr/bin/bun \
HOME=<temporary-home> \
GRADLE_USER_HOME=<temporary-gradle-home> \
PATH=<filtered-no-node-path> \
strace -f -e trace=execve -o <exec-log> \
  packages/lyntty-app/android/gradlew \
  -p packages/lyntty-app/android \
  :app:assembleRelease --no-daemon --max-workers=2 \
  -PreactNativeArchitectures=arm64-v8a
```

Outcome:

- Gradle 9: `BUILD SUCCESSFUL in 15m 7s`
- Tasks: `1947 actionable tasks: 1911 executed, 36 up-to-date`
- APK SHA-256: `79fd5c189c79d7814820b63f486b40104c7a3e3e064228cf490467209e12c0ac`
- Actual Node/npm/pnpm/npx/tsx runtime `execve` matches: `0`
- Successful `node`-named Bun shim paths during Android build: `0`

The gate required Bun-targeted patches for Expo autolinking/constants/modules, React Native Reanimated/Worklets, the React Native Gradle plugin's Gradle 9 Foojay resolver, and Skia's lifecycle asset preparation. These patches are lockfile-controlled through `patchedDependencies`.

This APK used the existing development/preview signer. Production Android signing remains a release gate, not a feasibility-gate input.

## Gate 2: compiled CLI, daemon, and Pi extension

Representative commands:

```bash
bun build --compile packages/lyntty-cli/src/index.ts \
  --outfile <temporary-output>/lyntty
bun build --compile packages/lyntty-cli/src/daemon/entry.ts \
  --outfile <temporary-output>/lynttyd

HOME=<temporary-home> \
LYNTTY_HOME_DIR=<temporary-state> \
PATH=<empty-no-runtime-path> \
strace -f -e trace=execve -o <exec-log> \
  <temporary-output>/lyntty remote install
```

Outcome:

- `lyntty version: 1.1.10`
- `lynttyd version: 1.1.10`
- Pi extension installed under the temporary home only.
- Forbidden Bun/Node-family `execve` matches across CLI version, daemon version, and extension installation: `0`
- Linux x64 artifact hashes are recorded in `artifacts/r76-bun-hard-gates/artifact-hashes.txt`.

The CLI still contains legacy runtime probes at this intermediate gate. They did not execute Node-family runtimes and will be deleted in the approved Pi-only cleanup phase.

## Gate 3: Prisma 7 compiled Relay

### Data/runtime choice

The Relay now generates Prisma `7.8.0` with the `prisma-client` generator and `engineType = "client"`. It uses:

- `pglite-prisma-adapter` for PGlite
- `@prisma/adapter-pg` for PostgreSQL
- explicit generated-client imports

PGlite remains pinned to `0.3.15`. A direct experiment proved that PGlite `0.5.4` cannot open a `0.3.15` data directory. PGlite's official guidance requires `pg_dump`/restore across minor formats. Prisma 7 does not require that unrelated storage-format upgrade, because the adapter supports PGlite `>=0.2`. Keeping `0.3.15` therefore preserves deployed data while still completing the Prisma 7/Bun feasibility proof.

### Existing PGlite database

A database was created with the actual PGlite `0.3.15` package, the first 38 repository migrations, and a synthetic account. A compressed pre-upgrade snapshot was taken. The final compiled Relay then applied migration 39 to that same directory.

Representative command:

```bash
PGLITE_DIR=<old-0.3.15-data-copy> \
PATH=<empty-no-runtime-path> \
strace -f -e trace=execve -o <exec-log> \
  packages/lyntty-relay/dist/lyntty-relay migrate
```

Outcome:

- Applied `20260704062000_auth_request_expiry_consumption`
- Applied migrations after upgrade: `39`
- Synthetic account ID and public-key field remained unchanged.
- Prisma 7 client-engine readback succeeded.
- Compiled `/health` returned `status: ok`.
- Compiled Relay exited cleanly on `SIGTERM`.
- A runtime timeout-worker write remained present after the explicit close path ran and the database was reopened; this verifies readable persisted state in addition to a zero exit code.
- Forbidden Bun/Node-family `execve` matches for migrate and serve: `0`.

The shutdown test exposed and fixed an existing loop bug: the session timeout worker used `while (true)` and spun after the shared abort signal. It now exits when `shutdownSignal.aborted` becomes true. The database shutdown handler now disconnects Prisma and explicitly, idempotently closes the embedded PGlite instance.

### PostgreSQL adapter

An isolated rootless Podman PostgreSQL 17 container was bound to `127.0.0.1:35432` and removed after the test.

Image digest:

```text
sha256:742f40ea20b9ff2ff31db5458d127452988a2164df9e17441e191f3b72252193
```

The final compiled Relay:

- selected PostgreSQL when only `DATABASE_URL` was provided, using the same provider resolver as migration;
- failed closed before listening when that database URL was unreachable;
- serialized migration processes with a PostgreSQL advisory lock;
- applied all 39 SQL migrations transactionally and passed an idempotent second run;
- wrote and read a synthetic account through Prisma 7 and `@prisma/adapter-pg`;
- served `/health` on non-default port `33106`;
- exited cleanly on `SIGTERM`;
- executed no Bun/Node-family runtime during migrate or serve.

Database URLs and synthetic test credentials were intentionally excluded from tracked artifacts.

## Additional checks

```bash
bun install --frozen-lockfile
bun pm untrusted
bun run --filter lyntty-relay generate
bun run --filter lyntty-relay typecheck
bun run --filter lyntty-relay test
bun run --filter lyntty-relay build:standalone
git diff --check
```

Results:

- Clean frozen install with lifecycle scripts: pass
- Untrusted lifecycle scripts: `0`
- Prisma generation: pass
- Wire build/tests: `2` files, `19` tests passed
- App and CLI typecheck: pass
- Relay typecheck: pass
- Relay tests: `18` files, `105` tests passed, no unhandled rejection
- Compiled Relay build: pass

Prisma's old engine-level Prometheus metrics API is unavailable with the client engine. The Relay now exposes its existing application/database gauges only. A repository search found no in-repo alert or dashboard depending on the removed Prisma metric names; external operators must treat this as an observability compatibility note.

## Tracked artifacts

See `docs/evidence/artifacts/r76-bun-hard-gates/`:

- clean frozen-install output and Bun lifecycle-shim identity
- Android runtime check, clean Gradle release log, and APK hash
- CLI/daemon compile and version outputs
- isolated Pi extension installation result and hash
- PGlite/PostgreSQL migration, idempotency, provider-selection, and health outputs
- Relay data-preservation and explicit-close summary
- forbidden-runtime counts
- final artifact hashes
- Bun frozen-install and trusted-dependency output

Raw `strace` logs remain in isolated temporary directories because their environment blocks can contain synthetic connection strings. Only redacted counts and outcomes are tracked.

## Not yet claimed

These gates prove feasibility; they do not complete the migration. Remaining work includes:

- deleting legacy runtimes, Web/Tauri, EAS/OTA, Codium, and obsolete workspaces;
- migrating all tests to `bun:test`;
- supported-platform build/smoke matrices, including Linux arm64 and native macOS/Windows gates;
- release installers, service management, updater rollback, signed Compatibility BOM, SBOM/provenance, and GHCR publication;
- full Maestro acceptance and protected-PR integration;
- production PGlite rehearsal on an isolated VPS-local copy.
