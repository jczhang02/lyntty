# R67 Pi extension stale ctx crash

Date: 2026-07-08
Status: source fix validated, live global extension re-enabled on disk; running Pi sessions still need user-triggered reload or restart

## Scope

Fix Pi process exits caused by the Lyntty Pi extension keeping stale `ExtensionContext` references in interval callbacks after Pi session replacement or reload.

## Diagnosis

Exit recorder evidence:

- Record: `/home/jc/.pi/agent/exit-records/2026-07-08-pid-756611.jsonl`
- Process cwd: `/home/jc/dev/lyntty`
- Session file: `/home/jc/.pi/agent/sessions/--home-jc-dev-lyntty--/2026-07-08T05-19-48-312Z_019f402b-0258-706f-a0af-549833ab8957.jsonl`
- Error: `This extension ctx is stale after session replacement or reload. Do not use a captured pi or command ctx after ctx.newSession(), ctx.fork(), ctx.switchSession(), or ctx.reload().`
- Repeated `unhandledRejection` stack: `~/.pi/agent/extensions/lyntty/index.ts:102 sessionSnapshot -> :414 pollCommands -> :453 setInterval`
- Final `uncaughtExceptionMonitor` stack: `~/.pi/agent/extensions/lyntty/index.ts:102 sessionSnapshot -> :160 send -> :178 setInterval`
- Exit: code `1`

Verdict: session exits were caused by the installed Lyntty Pi extension timers using stale command context. This diagnosis proves the extension crash chain; it does not prove which user action triggered the prior session replacement/reload.

## Changes

- `packages/lyntty-cli/src/pi/piExtensionInstall.ts`
  - Generated extension now tracks active Pi session id.
  - Heartbeat interval no longer calls `send(ctx, ...)`; it sends from a captured plain session snapshot.
  - Command polling interval now catches stale-context failures and stops affected timers instead of producing unhandled rejections.
  - Remote `reload` and `internal_shutdown` stop extension timers before invalidating the current context.
  - Session snapshot reads go through `safeSessionSnapshot()` at timer/command boundaries.
- `packages/lyntty-cli/src/pi/piExtensionEvent.test.ts`
  - Installer regression assertions cover stale-context guards and reject the old direct timer patterns.

## Verification

Commands run:

```bash
pnpm --filter ./packages/lyntty-cli exec vitest run --project unit src/pi/piExtensionEvent.test.ts
pnpm --filter ./packages/lyntty-cli typecheck
pnpm --filter ./packages/lyntty-cli test
```

Results:

- Targeted Pi extension test passed: 1 file / 6 tests.
- CLI typecheck passed.
- Full `lyntty-cli` unit suite passed: 91 files / 785 tests.

## Live extension re-enable

After explicit user approval, installed the fixed extension source to the live Pi extension path:

```bash
pnpm --filter ./packages/lyntty-cli exec tsx -e "import { installLynttyPiExtension } from './src/pi/piExtensionInstall.ts'; void (async () => { const result = await installLynttyPiExtension('/home/jc'); console.log(JSON.stringify(result)); })();"
```

Result:

```json
{"path":"/home/jc/.pi/agent/extensions/lyntty/index.ts","changed":true}
```

Live install verification:

```bash
stat -c '%n %s bytes %y' /home/jc/.pi/agent/extensions/lyntty/index.ts /home/jc/.pi/agent/extensions/lyntty/index.ts.disabled-2026-07-08-stale-ctx
# guard presence/absence smoke
```

Results:

- Fixed live file present: `/home/jc/.pi/agent/extensions/lyntty/index.ts`.
- Previous disabled copy retained: `/home/jc/.pi/agent/extensions/lyntty/index.ts.disabled-2026-07-08-stale-ctx`.
- Live file contains `function isStaleContextError`, `safeSessionSnapshot(ctx`, and `void pollCommands(pi, ctx, session).catch`.
- Live file does not contain old unsafe patterns `void pollCommands(pi, ctx);` or `send(ctx, { type: "remote_heartbeat" });`.

## Not run

- Did not force reload the user's current Pi session. Project safety policy prefers a new Pi session or user-triggered `/reload` after extension updates.
- Live reload/switch/fork reproduction was not run against the user's active Pi environment.

## Residual risk

- Source fix and installed file are validated. Current running Pi processes may still have old extension state until user-triggered `/reload` or restart. Live confirmation across reload/switch/fork/newSession remains pending after reload/restart.
