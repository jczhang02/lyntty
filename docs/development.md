# Isolated local development

Run development commands from the root of a Git worktree. Bun is the only JavaScript runtime used by project commands. On macOS, install the OS locking utility once with `brew install flock`; Linux distributions normally provide it with util-linux.

```bash
bun install --frozen-lockfile
bun dev:up
bun dev:check
bun dev:verify
bun dev:down
```

`dev:up` starts a source Relay and foreground `lynttyd`. It creates an isolated auth identity and uses only the current worktree's state:

```text
<worktree>/dist/dev/<worktree-hash>/
├── home/
├── lyntty/
├── relay/pglite/
├── logs/
├── evidence/
├── secrets/
└── state.json
```

It does not read or write live `~/.pi` or `~/.lyntty`. The worktree hash deterministically selects a candidate Relay/Metro port block. Allocation is serialized under Git's common directory and probes actual port availability, so two worktrees can start concurrently without sharing runtime state or ports.

## Commands

- `bun dev:up` — start or reuse the worktree's owned Relay and daemon.
- `bun dev:check` — verify state, Relay health, and every supervisor's PID ownership.
- `bun dev:verify` — additionally verify authenticated machine registration plus source CLI `daemon status`/`daemon list`; writes redacted reusable evidence to `dist/dev/<hash>/evidence/verify.json`.
- `bun dev:down` — stop only process groups whose PID, command, cwd, instance marker, and role all match the recorded worktree state.

Add `--json` to any command for machine-readable output.

If any live PID cannot be proven owned, `dev:down` refuses **all** signals. Inspect `bun dev:check --json`; do not delete or rewrite state until the process identity is understood. A dead recorded PID is treated as stale and is never signaled.

## Android emulator

Android is opt-in:

```bash
bun dev:up --android
```

Only this form starts worktree-local Metro and runs the development APK install with `--no-bundler`. The app receives `http://10.0.2.2:<relay-port>` and the isolated development credentials. Plain `bun dev:up` never starts Metro, Gradle, ADB, or an emulator. Stop the backend and Metro with `bun dev:down`.

The Android option targets a locally available Android emulator. It does not install production/preview identities or use permanent signing material.

## Supported hosts and safety

The process-ownership guard supports Linux (`/proc`) and macOS (`ps` plus `lsof`) and fails clearly elsewhere. The commands never send keys or lifecycle controls to tmux/Pi panes. Development secrets, logs, databases, and evidence remain ignored under the worktree's `dist/` directory.
