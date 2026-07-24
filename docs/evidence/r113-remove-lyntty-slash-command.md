# R113 — Remove the `/lyntty` slash command

Date: 2026-07-24
Bead: `lyntty-7ro`

## Result

- The generated Lyntty Pi extension no longer registers or advertises `/lyntty`.
- `/remote` remains registered and keeps its existing status and enable/disable behavior.
- Managed-runtime capability discovery no longer inserts `/lyntty`; it reports only commands, prompt templates, and skills declared by Pi.
- The installer recognizes the last shipped managed extension hash, so an existing Lyntty extension can be upgraded atomically without `--replace-extension`.
- Current English and Chinese product requirements now describe ordinary computer-running `pi` sessions without requiring `/lyntty`. Historical evidence retains its original references.

## Verification

All commands ran in `worktrees/remove-lyntty-command` with isolated temporary `HOME` and `LYNTTY_HOME_DIR` values where the CLI or extension could write runtime state.

```bash
cd packages/lyntty-cli
home_dir="$(mktemp -d)"
state_dir="$(mktemp -d)"
HOME="$home_dir" LYNTTY_HOME_DIR="$state_dir" bun test \
  src/pi/piExtensionInstall.test.ts \
  src/pi/piExtensionEvent.test.ts \
  src/pi/runPiFeatures.test.ts \
  src/pi/runPiControl.test.ts \
  src/pi/runPiPathSmoke.test.ts
```

Result: passed, 25 tests and 109 assertions.

```bash
home_dir="$(mktemp -d)"
state_dir="$(mktemp -d)"
HOME="$home_dir" LYNTTY_HOME_DIR="$state_dir" bun run ci:cli
```

Result: passed; CLI typecheck, distributable build, and full unit test suite completed successfully.

```bash
home_dir="$(mktemp -d)"
state_dir="$(mktemp -d)"
HOME="$home_dir" LYNTTY_HOME_DIR="$state_dir" bun run ci:daemon-integration
```

Result: passed; compiled `lyntty`, `lynttyd`, and standalone relay integration completed successfully.

The first focused invocation was run from the repository root and failed only because the extension test fixture links `process.cwd()/node_modules`, which did not expose the package-local `@types/node` under the isolated Bun workspace layout. Running the same test from its package directory, as the package test script does, passed.

## Artifacts

- Generated extension source and upgrade hash: `packages/lyntty-cli/src/pi/piExtensionInstall.ts`
- Installer and generated-source coverage: `packages/lyntty-cli/src/pi/piExtensionInstall.test.ts`, `packages/lyntty-cli/src/pi/piExtensionEvent.test.ts`
- Runtime capability discovery and tests: `packages/lyntty-cli/src/pi/runPiFeatures.ts`, `packages/lyntty-cli/src/pi/runPiFeatures.test.ts`
- Updated command-policy fixtures: `packages/lyntty-cli/src/pi/runPiControl.test.ts`, `packages/lyntty-cli/src/pi/runPiPathSmoke.test.ts`
- Current requirements: `docs/prds/lyntty-product.md`, `docs/prds/lyntty-product.zh.md`

## Not run

- No live global extension install, Pi `/reload`, or current-session manipulation was performed; project safety policy requires user-triggered upgrade or reload.
- Android APK and physical-phone validation were not run because this change removes a local Pi extension command and does not change the mobile UI or wire protocol.

## Residual risk

An already-running Pi process can retain the old in-memory `/lyntty` registration until the managed extension is upgraded and the user starts a new Pi process or explicitly reloads it. The change intentionally does not force reload the user's current session.
