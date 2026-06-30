# Command/Event Path Smoke Evidence

Date: 2026-06-30

## Scope

Follow-up Beads task `lyntty-u4r`: close the remaining R6 evidence gap for command path and event path.

## Changed files

- `packages/lyntty-cli/src/pi/runPiPathSmoke.test.ts`
- `docs/evidence/r6-command-event-path-smoke.md`

## Deterministic smoke coverage

`runPiPathSmoke.test.ts` composes the same command and event helpers used by the Pi runner:

- `PiCommandLedger`
- `resolvePiRemoteAction()`
- `mapPiSessionEventToAgentMessages()`

It verifies simulated `Session Remote` input becomes Pi SDK actions:

- idle text -> `prompt`.
- running text -> `followUp`.
- `/redirect ...` while running -> `steer`.
- local-only `/model` -> blocked as `local_only`.
- duplicate `localKey` -> dropped.

It verifies simulated Pi SDK events become Session Remote agent messages:

- text delta -> message.
- tool start -> tool-call.
- tool end -> tool-result.

## Command run

```bash
pnpm --filter ./packages/lyntty-cli exec vitest run src/pi/runPiPathSmoke.test.ts
pnpm --filter ./packages/lyntty-cli run typecheck
```

Result:

- 1 test file passed.
- 2 tests passed.
- `lyntty-cli` typecheck passed.

## Full live relay note

A full live mobile -> relay -> daemon -> Pi -> relay -> mobile smoke still requires local relay credentials/state and a client/device session. Current deterministic smoke verifies the command/event semantics at the Pi runner boundary without requiring external auth or a device.
