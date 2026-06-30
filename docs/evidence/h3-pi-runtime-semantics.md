# H3 Pi Runtime Semantics Evidence

日期：2026-06-30

## Scope

Added first runtime-control semantics on top of the Lyntty-based Pi SDK adapter.

## Implemented

- `packages/lyntty-cli/src/pi/runPiControl.ts`
  - deep module for remote command interpretation.
  - idle text -> `prompt`.
  - running text -> `followUp` by default.
  - `/redirect ...` and `/steer ...` -> `steer`.
  - `/stop`, `/abort`, `/interrupt` -> Pi `abort()`.
  - local-only slash commands (`/model`, `/settings`, `/session`, `/theme`, `/help`) are blocked from remote delivery.
  - unknown slash commands are blocked until Pi declares support.
  - `PiCommandLedger` dedupes command `localKey` values for idempotent remote delivery.
- `packages/lyntty-cli/src/pi/runPiEvents.ts`
  - maps Pi `AgentSessionEvent` to Lyntty ACP-style messages.
  - text deltas -> `message`.
  - thinking deltas -> `reasoning`.
  - tool start/update/end -> `tool-call`, `terminal-output`, `tool-result`.
  - agent lifecycle -> `task_started` / `task_complete`.
  - queue/compaction/retry -> status messages.
- `packages/lyntty-cli/src/pi/runPi.ts`
  - uses command interpreter and command ledger before touching Pi runtime.
  - sends `prompt`, `followUp`, `steer`, or `abort` explicitly.
  - blocks computer-side-only slash commands from `Session Remote`.
  - uses event mapper instead of ad-hoc status strings.

## Commands run

```bash
pnpm --filter ./packages/lyntty-cli run typecheck
pnpm --filter ./packages/lyntty-cli exec vitest run src/pi/runPiControl.test.ts src/pi/runPiEvents.test.ts
pnpm --filter ./packages/lyntty-agent run typecheck
pnpm --filter ./packages/lyntty-app run typecheck
pnpm --filter ./packages/lyntty-cli run build
git diff --check -- packages/lyntty-cli/src/pi/runPi.ts packages/lyntty-cli/src/pi/runPiControl.ts packages/lyntty-cli/src/pi/runPiControl.test.ts packages/lyntty-cli/src/pi/runPiEvents.ts packages/lyntty-cli/src/pi/runPiEvents.test.ts
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

- `lyntty-cli` typecheck: passed.
- `runPiControl` + `runPiEvents` tests: 12 passed.
- `lyntty-agent` typecheck: passed.
- `lyntty-app` typecheck: passed.
- `lyntty-cli` build: passed.
- focused `git diff --check`: passed.
- standalone Pi SDK runtime creation smoke: passed; output included `{ "sessionId": "019f17f4-1981-7d2f-917f-8996aec9fb9d", "hasSessionFile": false, "diagnostics": 0 }`.
- Pi SDK smoke warning: `[codex-sse-timeout] Codex SSE timeout extension disabled: could not locate installed Codex provider file or bundled pi executable`.
- Vitest triggered the existing `lyntty-cli` package build as part of project setup; build completed with existing pkgroll warnings about bin entries outside dist and empty chunks.

## Still missing

- Activation lock not ported into Lyntty daemon/session layer yet.
- stop/wait/interrupt UI contract not fully surfaced; current command slice supports stop/abort and redirect/steer through slash text.
- `pi.getCommands()` discovery not wired; supported command list is static (`/lyntty`) for now.
- Full Lyntty structured event envelope (`seq`, `history_gap`, redaction fields) not implemented in Lyntty wire yet.
- Reconnect/backfill, node-local canonical cache, and Review Evidence remain future slices.
