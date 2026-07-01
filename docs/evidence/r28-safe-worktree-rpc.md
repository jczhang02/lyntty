# R28 Safe worktree RPC

Date: 2026-07-02
Task: `lyntty-h4d` — Replace machine worktree bash with safe RPC.

## Problem

R22 blocked generic machine-scope shell/file RPC, but app worktree helpers still depended on machine-level `bash` for:

- `git rev-parse --git-dir`
- `git worktree add -b ...`
- `git worktree list --porcelain`
- `git worktree remove ... --force`
- `git status --porcelain`

This meant the worktree UI either failed after machine `bash` denial or required re-exposing a broad machine shell surface.

## Fix

- Added narrow daemon-side worktree RPC helpers in `packages/lyntty-cli/src/modules/worktree/worktreeRpc.ts`:
  - `worktree-create`
  - `worktree-list`
  - `worktree-remove`
  - `worktree-status`
- The daemon uses `execFile('git', args, ...)` with argv arrays rather than shell command strings.
- Worktree branch names are restricted to a simple generated-safe character set with no `/` or `..`.
- Remove/status only accept paths under the managed marker `/.dev/worktree/`.
- Machine RPC registration now exposes only those narrow worktree methods; it still does not register `registerCommonHandlers()` or generic `bash` at machine scope.
- Relay machine RPC allowlist includes only the new worktree methods, while machine/user calls to generic `bash`/file/ripgrep/difftastic remain denied.
- App worktree helpers now call typed ops wrappers instead of `machineBash`:
  - `machineWorktreeCreate`
  - `machineWorktreeList`
  - `machineWorktreeRemove`
  - `machineWorktreeStatus`
- Worktree cleanup still keeps existing UX: skip silently on offline/error/dirty, ask confirmation only when status is clean.

## Verification

```text
pnpm --filter ./packages/lyntty-cli run typecheck
pnpm --filter ./packages/lyntty-cli exec vitest run \
  src/api/apiMachine.test.ts \
  src/modules/worktree/worktreeRpc.test.ts
# 2 files, 6 tests passed

pnpm --filter ./packages/lyntty-app run typecheck
pnpm --filter ./packages/lyntty-app exec vitest run \
  sources/sync/piSessionOps.test.ts \
  sources/utils/worktree.test.ts
# 2 files, 8 tests passed

pnpm --filter ./packages/lyntty-relay run typecheck
pnpm --filter ./packages/lyntty-relay exec vitest run \
  sources/app/api/socket/rpcHandler.spec.ts
# 1 file, 5 tests passed

grep -R "machineBash" -n packages/lyntty-app/sources --include='*.ts' --include='*.tsx'
# only packages/lyntty-app/sources/sync/ops.ts exports legacy compatibility function
```

## Regression coverage

- Machine RPC registers worktree methods and still does not register generic `bash`.
- Relay allows worktree methods but continues denying machine-scope shell/file/ripgrep/difftastic calls.
- App ops wrappers call the narrow worktree RPC method names.
- App worktree helpers create/list/remove through narrow RPC and reject non-managed paths before remove RPC.
- Daemon worktree helper rejects branch names that could escape the managed worktree directory.

## Remaining limitations

- This keeps the existing worktree feature but does not add new worktree UX or Maestro coverage.
- `machineBash()` remains exported in app ops as legacy compatibility, but active app sources no longer call it except for that export definition.
