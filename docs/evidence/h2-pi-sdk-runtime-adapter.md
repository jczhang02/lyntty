# H2 Pi SDK Runtime Adapter Evidence

日期：2026-06-30

## Scope

Replaced H1 Pi stub with a real Pi SDK runtime adapter inside the Lyntty migration worktree.

## Changed areas

- `packages/lyntty-cli/package.json` / `pnpm-lock.yaml`
  - added `@earendil-works/pi-coding-agent@0.80.2` to `lyntty-cli`.
- `packages/lyntty-cli/src/pi/runPi.ts`
  - creates `AgentSessionRuntime` through `createAgentSessionRuntime()`.
  - builds cwd-bound services via `createAgentSessionServices()`.
  - creates sessions via `createAgentSessionFromServices()`.
  - uses `SessionManager.create(cwd)` and `getAgentDir()`.
  - subscribes to `AgentSessionEvent` stream.
  - maps Pi lifecycle/text/tool/queue/compaction/retry events to Lyntty session messages.
  - forwards Lyntty user messages to `piRuntime.session.prompt()`.
  - uses `streamingBehavior: 'followUp'` when Pi is already streaming.
  - aborts active Pi runtime through Lyntty kill-session RPC.
  - disposes runtime on shutdown.

## Commands run

```bash
pnpm --filter ./packages/lyntty-cli add @earendil-works/pi-coding-agent@0.80.2
pnpm --filter ./packages/lyntty-cli run typecheck
pnpm --filter ./packages/lyntty-agent run typecheck
pnpm --filter ./packages/lyntty-app run typecheck
pnpm --filter ./packages/lyntty-cli run build
node --input-type=module <<'NODE'
import { createAgentSessionRuntime, createAgentSessionFromServices, createAgentSessionServices, getAgentDir, SessionManager } from '@earendil-works/pi-coding-agent';
const createRuntime = async ({ cwd, agentDir, sessionManager, sessionStartEvent }) => {
  const services = await createAgentSessionServices({ cwd, agentDir });
  return { ...(await createAgentSessionFromServices({ services, sessionManager, sessionStartEvent })), services, diagnostics: services.diagnostics };
};
const runtime = await createAgentSessionRuntime(createRuntime, { cwd: process.cwd(), agentDir: getAgentDir(), sessionManager: SessionManager.inMemory(process.cwd()) });
console.log(JSON.stringify({ sessionId: runtime.session.sessionId, hasSessionFile: !!runtime.session.sessionFile, diagnostics: runtime.diagnostics.length }));
await runtime.dispose();
NODE
```

## Results

- dependency install: passed.
  - Warnings: legacy root `pnpm` config ignored by pnpm 10, deprecated transitive packages, peer dependency warnings, one transient `ECONNRESET` retry for optional esbuild artifact.
- `lyntty-cli` typecheck: passed.
- `lyntty-agent` typecheck: passed.
- `lyntty-app` typecheck: passed.
- `lyntty-cli` build: passed.
  - Existing pkgroll warnings: bin files outside dist and empty chunks.
- standalone Pi SDK runtime creation smoke: passed.
  - Output included: `{ "sessionId": "019f17e7-88bb-7d66-8cd8-2e3063a0ed29", "hasSessionFile": false, "diagnostics": 0 }`.
  - Warning: `[codex-sse-timeout] Codex SSE timeout extension disabled: could not locate installed Codex provider file or bundled pi executable`.

## Not run

- Full Lyntty daemon/server/client live spawn not run.
- Android/emulator/Maestro not run.
- Real model prompt not run; no API-authenticated Pi prompt smoke was executed.
- Native `/lyntty` extension rebind not wired yet.

## Current limitations

- Event mapping is coarse; it forwards Pi event summaries into Lyntty ACP/session messages, not final Lyntty structured event contract.
- `steer` vs `followUp` is not yet exposed from UI; active streaming currently defaults to follow-up.
- Slash command discovery still only advertises `/lyntty`; full `pi.getCommands()` capability bridge remains undone.
- Activation lock, `history_gap`, node-local backfill, and Review Evidence semantics are not yet ported into Lyntty base.

## Next slice

H3: add Lyntty runtime-control semantics on top of the Pi adapter: explicit follow-up vs redirect/steer, stop/interrupt, activation lock, command idempotency, local-only slash command marking, redaction, and structured event envelope mapping.
