# R83 — Isolated Bun development workflow evidence

Date: 2026-07-18

Branch: `refactor/bun-migration`

Bead: `lyntty-6o0.8`

## Scope

This round adds one root development interface:

```bash
bun dev:up [--android] [--json]
bun dev:check [--json]
bun dev:verify [--json]
bun dev:down [--json]
```

The default path starts only a source Relay and foreground source `lynttyd`. State, HOME, `LYNTTY_HOME_DIR`, Pi agent directory, PGlite, logs, secrets, and verification evidence live under the canonical worktree's ignored `dist/dev/<hash>/` directory.

Port selection uses the canonical path hash, an atomic common-Git-directory coordination lock, aligned Relay/Metro blocks, and real socket probes. A bounded provisional allocation is durable before Relay spawn. Every detached supervisor also receives a pre-spawn launch intent and self-writes a PID/start-token receipt before starting children; the worktree lifecycle lock reconciles receipts after caller crashes. Runtime state is never shared between worktrees.

`dev:down` checks every live recorded or receipt-recovered process group before sending any signal. Linux proof uses exact `/proc` argv/environment/cwd; macOS uses exact `KERN_PROCARGS2` argv/environment plus `lsof` cwd. PID start tokens, instance id, worktree hash, command, role, and process-group ancestry must agree. One unowned live PID rejects all signals. SIGKILL is allowed only after every remaining member is proved again.

## Public command tests

```bash
bun test scripts/dev.test.ts
bun build scripts/dev.ts --target bun --outfile /tmp/lyntty-dev-check.js
git diff --check
```

Results:

- 13 tests passed with 88 assertions;
- unknown/duplicate arguments and `--android` on non-`up` commands failed;
- deterministic worktree identity and local state path passed;
- default supervisors were exactly Relay and daemon, with no Android/Metro request;
- a state record changed to an unrelated live test PID made `dev:down` fail closed; restoring state left the actual supervisors usable;
- concurrent `up`, provisional-lease recovery, partial-role refusal, stopped-label shutdown, orphan-child cleanup, stale daemon-state replacement, and caller-crash receipt recovery passed;
- a synthetic Darwin `KERN_PROCARGS2` fixture preserved argv/environment values containing spaces at exact NUL boundaries;
- real `up -> check -> verify -> down` passed against isolated PGlite and auth, followed by three additional repeat runs;
- Relay health, exactly one current authenticated machine id, current daemon child/control proof, source CLI daemon status/list, redacted evidence, shutdown, and mode-0600 sensitive files passed;
- Bun build/syntax and diff checks passed.

A post-acceptance repeat exposed one shutdown race: a child could exit between the process-group snapshot and identity proof, causing the first safe `down` to reject a member that no longer existed. The fix drops only snapshot members re-proved as no longer alive; every live member still requires exact ownership, and forced shutdown still re-enumerates and re-proves the group. The same 13-test/88-assertion suite passed after the fix.

## Simultaneous two-worktree verification

Two detached worktrees were created under the repository's required `worktrees/` directory. Each received its own `node_modules` and Bun cache. No dependencies, native output, PGlite directory, HOME, or `LYNTTY_HOME_DIR` were shared.

Both `bun dev:up --json` commands were launched concurrently, followed by `check` and `verify`:

- `dev-isolation-a`: worktree hash `cf2f33d7bb313e49`, Relay/Metro `57442/57443`;
- `dev-isolation-b`: worktree hash `c0e9bd986bfadd9e`, Relay/Metro `53796/53797`;
- state roots and both port blocks were distinct;
- each Relay was healthy and had exactly one registered isolated daemon;
- all four supervisor PIDs passed command/cwd/environment ownership proof;
- both source CLI status/list checks passed.

The normalized result is `docs/evidence/artifacts/r83-isolated-development/two-worktree-summary.json`.

A separate unrelated Bun process was substituted into one state record. `dev:down` returned status 1 with `command-mismatch`; the unrelated process and both original supervisors remained alive. After restoring the exact state, both environments shut down normally. All supervisor PIDs were dead and shared coordination metadata was removed before both temporary worktrees and their dependencies were deleted.

## Permissions and redaction

After shutdown, `state.json`, `access.key`, `settings.json`, and `evidence/verify.json` were mode `0600`; their parent state root was mode `0700`. Evidence contains only local paths/hash, ports, roles, health, counts, and boolean ownership/CLI results. It contains no token, encryption secret, auth public key, request header, pairing URL, or permanent signing material.

## Android boundary

Plain `dev:up` produced only `relay` and `daemon` supervisors in both worktrees. `--android` is the only accepted path that can start Metro or run Expo Android installation; other commands reject it. The implementation supplies the emulator-only `10.0.2.2` Relay URL and isolated development token/secret, and uses `--no-bundler` after worktree Metro is healthy.

The Android option was not executed in R83 because no new emulator/user-flow behavior was required after the guarded R81 APK/Maestro acceptance. This evidence does not claim a new APK, emulator, or physical-phone run.

The Linux ownership path ran locally. The exact Darwin parser has a synthetic NUL-boundary regression and the checked-in `dev-isolation` CI matrix runs the real lifecycle on `macos-15`, but that protected-PR job has not run yet; R83 does not claim local macOS execution.

## Safety

- No live `~/.pi`, `~/.lyntty`, global extension, daemon, Relay, tmux pane, or active Pi session was read, changed, reloaded, signaled, or controlled.
- No Node/npm/pnpm/npx/tsx command was executed.
- No fixed wait was used; lock/readiness/shutdown paths poll conditions with deadlines.
- Temporary worktrees, supervisors, local databases, dependency trees, coordination files, and test process were removed after verification.

## Review

Independent final process-isolation/safety re-review after provisional allocation, lifecycle locking, whole-group shutdown, durable atomic launch claims/receipts, current-daemon readiness, Android ownership retention, and exact Darwin identity fixes: `APPROVE — no P0/P1/P2 isolated-development blockers.`

Focused re-review of the post-acceptance snapshot/exit race fix confirmed that vanished members cannot be signalled, live unowned members still fail closed, tracked groups remain monitored, and SIGKILL still requires fresh whole-group proof: `APPROVE — no P0/P1/P2 shutdown-race blockers.`
