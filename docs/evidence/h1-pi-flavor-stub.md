# H1 Pi Flavor Stub Evidence

日期：2026-06-30

## Scope

Added first-class `pi` flavor to Lyntty migration worktree. Runtime is intentionally a stub; real Pi SDK adapter belongs to H2.

## Changed areas

CLI / daemon:

- `packages/lyntty-cli/src/index.ts` — adds `lyntty pi` command route.
- `packages/lyntty-cli/src/pi/runPi.ts` — creates Pi-flavored session, registers with daemon, emits ready/stub messages, handles kill session, keepalive.
- `packages/lyntty-cli/src/daemon/run.ts` — daemon spawn supports `pi` in tmux and regular process paths; avoids treating Pi token as Claude OAuth token.
- `packages/lyntty-cli/src/daemon/controlServer.ts` — spawn RPC schema accepts `pi`.
- `packages/lyntty-cli/src/modules/common/registerCommonHandlers.ts` — spawn option type accepts `pi`.
- `packages/lyntty-cli/src/utils/createSessionMetadata.ts` — backend flavor includes `pi`.
- `packages/lyntty-cli/src/utils/detectCLI.ts` and `packages/lyntty-cli/src/api/types.ts` — machine CLI availability includes `pi`.
- `packages/lyntty-cli/src/agent/core/AgentBackend.ts` and `packages/lyntty-cli/src/api/apiSession.ts` — provider/id type seams include `pi`.

Controller:

- `packages/lyntty-agent/src/machineRpc.ts` and `packages/lyntty-agent/src/index.ts` — remote spawn supports `pi`.

App:

- `packages/lyntty-app/sources/sync/persistence.ts` — new session draft supports `pi`, defaults unknown/old agents to `pi`.
- `packages/lyntty-app/sources/sync/agentDefaults.ts` — `pi` defaults and hidden seam for old agents.
- `packages/lyntty-app/sources/components/modelModeOptions.ts` — Pi model/permission/effort options.
- `packages/lyntty-app/sources/app/(app)/new/index.tsx` — New Session picker is Pi-only.
- `packages/lyntty-app/sources/app/(app)/settings/agents.tsx` — Agent Defaults settings show Pi-only.
- `packages/lyntty-app/sources/app/(app)/machine/[id].tsx` — CLI availability shows Pi-only.
- `packages/lyntty-app/sources/components/AgentInput.tsx` — Pi label/type support.
- `packages/lyntty-app/sources/sync/storageTypes.ts` and `settings.ts` — app schemas accept Pi availability/settings.
- `packages/lyntty-app/sources/sync/ops.ts` — spawn RPC payload accepts `pi`.

## Commands run

```bash
pnpm --filter ./packages/lyntty-cli run typecheck
pnpm --filter ./packages/lyntty-agent run typecheck
pnpm --filter ./packages/lyntty-app run typecheck
pnpm --filter ./packages/lyntty-app exec vitest run sources/sync/settings.spec.ts sources/utils/newSessionPickerItems.test.ts
pnpm --filter ./packages/lyntty-cli exec vitest run src/commands/codexCommand.test.ts
```

## Results

- `lyntty-cli` typecheck: passed.
- `lyntty-agent` typecheck: passed.
- `lyntty-app` typecheck: passed.
- `lyntty-app` targeted tests: 36 passed.
- `lyntty-cli` targeted test: 4 passed.
- `lyntty-cli` test command also built CLI package via `pnpm run build`; build completed with existing pkgroll warnings about bin entries outside dist and empty chunks.

## Known limitations

- `pi` runtime is stub only.
- No real `createAgentSessionRuntime()` adapter yet.
- No Android/emulator/Maestro smoke yet.
- No real server/daemon spawn smoke yet.
- Non-Pi flavor code remains in source but is hidden from primary New Session and settings UI.

## Next slice

H2: replace stub with Pi SDK runtime adapter and prove command/event path through daemon/session.
