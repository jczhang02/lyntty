# R6 Pi Runtime Path Evidence

Date: 2026-06-30

## Scope

Roadmap phase R6 / Beads `lyntty-ekv.6`: verify current repo has the imported Pi runtime path, Pi command/event mapping, and product CLI guard preventing legacy runtimes.

## Relevant files

- `packages/lyntty-cli/src/pi/runPi.ts`
- `packages/lyntty-cli/src/pi/runPiControl.ts`
- `packages/lyntty-cli/src/pi/runPiControl.test.ts`
- `packages/lyntty-cli/src/pi/runPiEvents.ts`
- `packages/lyntty-cli/src/pi/runPiEvents.test.ts`
- `packages/lyntty-cli/src/index.ts`
- `packages/lyntty-cli/package.json`

## Implemented behavior verified

Pi runtime adapter:

- uses `createAgentSessionRuntime()`.
- creates cwd-bound services with `createAgentSessionServices()`.
- creates sessions via `createAgentSessionFromServices()` and `SessionManager.create(cwd)`.
- subscribes to Pi session events.
- forwards remote Lyntty/Lyntty user messages to Pi SDK actions.

Command semantics:

- idle text -> `prompt`.
- streaming text -> `followUp`.
- `/redirect` / `/steer` while streaming -> `steer`.
- `/stop` / `/abort` / `/interrupt` -> `abort`.
- local-only slash commands blocked.
- unsupported slash commands blocked.
- duplicate remote commands with same `localKey` dropped through `PiCommandLedger`.

Event semantics:

- Pi text deltas -> message events.
- Pi thinking deltas -> reasoning events.
- tool start/update/end -> tool-call / terminal-output / tool-result events.
- lifecycle start/end -> task_started / task_complete.
- queue/compaction/retry -> status messages.

CLI product guard:

- package bin exposes `lyntty`.
- bare `lyntty` defaults to Pi runtime path.
- legacy runtime subcommands `claude`, `codex`, `gemini`, `acp`, and `openclaw` are rejected before dispatch.

## Commands run

Pi control/event tests:

```bash
pnpm --filter ./packages/lyntty-cli exec vitest run src/pi/runPiControl.test.ts src/pi/runPiEvents.test.ts
```

Result:

- 2 test files passed.
- 12 tests passed.
- Vitest setup built `lyntty-cli`; existing pkgroll warnings: bin outside dist and empty chunks.

Standalone Pi SDK runtime smoke:

```bash
node --input-type=module - <<'NODE'
import { createAgentSessionRuntime, createAgentSessionServices, createAgentSessionFromServices, SessionManager, getAgentDir } from '@earendil-works/pi-coding-agent';
const createRuntime = async ({ cwd, agentDir, sessionManager, sessionStartEvent }) => {
  const services = await createAgentSessionServices({ cwd, agentDir });
  return {
    ...(await createAgentSessionFromServices({ services, sessionManager, sessionStartEvent })),
    services,
    diagnostics: services.diagnostics,
  };
};
const runtime = await createAgentSessionRuntime(createRuntime, {
  cwd: process.cwd(),
  agentDir: getAgentDir(),
  sessionManager: SessionManager.create(process.cwd()),
});
console.log(JSON.stringify({ sessionId: runtime.session.sessionId, hasSessionFile: Boolean(runtime.session.sessionFile), diagnostics: runtime.diagnostics?.length ?? 0 }));
runtime.dispose();
NODE
```

Output:

```json
{"sessionId":"019f18aa-2a4b-77c1-be2a-06a25f69e1e6","hasSessionFile":true,"diagnostics":0}
```

Warning:

```text
[codex-sse-timeout] Codex SSE timeout extension disabled: could not locate installed Codex provider file or bundled pi executable
```

Legacy runtime guard smoke:

```bash
node packages/lyntty-cli/bin/lyntty.mjs codex
```

Result:

- exit code `1`.
- stderr: `Lyntty supports only pi. The 'codex' runtime is not supported.`

Typecheck/build:

```bash
pnpm --filter ./packages/lyntty-cli run typecheck
pnpm --filter ./packages/lyntty-cli run build
```

Result:

- typecheck passed.
- build passed with existing pkgroll warnings.

## Not run

- Full live daemon/server/mobile command path was not run.
- Real model prompt was not sent.
- Android device/emulator was not used.

## Risks / next work

- R7 must add dynamic Pi command/plugin discovery instead of the current static `/lyntty` remote allowlist.
- R8 must connect historical session discovery/recovery and `history_gap` semantics.
- Full mobile -> relay -> daemon -> Pi live smoke still required later.
