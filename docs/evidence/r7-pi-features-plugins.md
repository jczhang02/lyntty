# R7 Pi Features and Plugins Evidence

Date: 2026-06-30

## Scope

Roadmap phase R7 / Beads `lyntty-ekv.7`: support Pi commands/features/plugins through the Lyntty-based Lyntty runtime path without exposing legacy agent products.

## Changed files

- `packages/lyntty-cli/src/pi/runPiFeatures.ts`
- `packages/lyntty-cli/src/pi/runPiFeatures.test.ts`
- `packages/lyntty-cli/src/pi/runPi.ts`
- `packages/lyntty-cli/src/daemon/run.ts`
- `docs/evidence/r7-pi-features-plugins.md`

## Implemented behavior

### Pi extension/session binding

`runPi.ts` now binds Pi extensions in RPC mode before exposing the remote session:

- calls `runtime.session.bindExtensions({ mode: 'rpc', ... })`.
- provides command-context actions for `waitForIdle`, `newSession`, `fork`, `navigateTree`, `switchSession`, and `reload`.
- re-binds extensions after runtime session replacement.
- records extension errors through the local debug logger.
- allows extension shutdown to trigger the Pi runner shutdown path.

### Dynamic remote slash command discovery

`runPiFeatures.ts` now derives remote-visible Pi commands from the active Pi runtime:

- always includes `/lyntty`.
- includes extension commands registered with `pi.registerCommand()`.
- includes prompt template commands from `session.promptTemplates`.
- includes skill commands from Pi resource loader as `/skill:<name>`.
- deduplicates command names and normalizes leading `/`.

`runPi.ts` now:

- writes discovered commands into session metadata `slashCommands`.
- recalculates the command list per incoming remote message.
- updates metadata after runtime session replacement.
- announces connected command/tool capabilities in the first Pi status message.

### Tool/plugin capability summary

`getPiPluginFeatureSummary()` records:

- remote slash commands.
- active tools.
- configured tools.

This keeps plugin/tool visibility attached to the current Pi runtime instead of a hard-coded Lyntty agent list.

### Daemon Pi-only spawn cleanup

`daemon/run.ts` is now typed and routed as Pi-only for product spawn:

- tmux spawn command uses `pi`.
- regular spawn command uses `pi`.
- tracked sessions record `agent: 'pi'`.
- external legacy agent tokens are rejected with `Lyntty pi runtime does not accept external agent tokens.`
- legacy Claude/Codex/Gemini/OpenClaw spawn branch comparisons were removed from the product path.

## Commands run

Unit tests:

```bash
pnpm --filter ./packages/lyntty-cli exec vitest run src/pi/runPiControl.test.ts src/pi/runPiEvents.test.ts src/pi/runPiFeatures.test.ts
```

Result:

- 3 test files passed.
- 16 tests passed.

CLI typecheck/build:

```bash
pnpm --filter ./packages/lyntty-cli run typecheck
pnpm --filter ./packages/lyntty-cli run build
```

Result:

- typecheck passed.
- build passed.
- existing pkgroll warnings remain: bin outside dist directories and empty chunks.

Core workspace typechecks:

```bash
pnpm --filter ./packages/lyntty-relay run typecheck
pnpm --filter ./packages/lyntty-agent run typecheck
pnpm --filter ./packages/lyntty-app run typecheck
```

Result:

- `lyntty-relay` typecheck passed.
- `lyntty-agent` typecheck passed.
- `lyntty-app` typecheck passed.

## Real Pi SDK plugin discovery smoke

Created a temporary project-local Pi extension:

```typescript
export default function(pi) {
  pi.registerCommand('smoke', {
    description: 'Smoke command for Lyntty remote discovery',
    handler: async (_args, ctx) => {
      ctx.ui.notify('smoke ok', 'info');
    },
  });
}
```

Then created a Pi SDK runtime for that temp cwd, bound extensions with `mode: 'rpc'`, and inspected registered commands.

Command output:

```json
{"cwd":"/tmp/lyntty-pi-plugin-smoke-FIYItf","commands":["smoke","codex-iq","fork-pane","fp","cloak-status","notify","om:status","om:view","goal","todos","google-account","search","mcp","mcp-auth","rtk","caveman","loadout","autoresearch","agents","workflows","codex","context","release","cache","auto-rename","rewind","fff-mode","fff-health","fff-rescan","tps-export","session-export","simplify","btw","powerline","editor-decorators","vibe","plannotator","plannotator-review","plannotator-annotate","plannotator-last"],"diagnostics":0}
```

This proves Pi SDK command registration is discoverable after extension binding. The local smoke command `smoke` appeared in the command list.

Warning observed and accepted:

```text
[codex-sse-timeout] Codex SSE timeout extension disabled: could not locate installed Codex provider file or bundled pi executable
```

## Not run

- Full mobile -> relay -> daemon -> Pi plugin command execution.
- Android device/emulator smoke.
- Remote UI autocomplete rendering of the dynamic command list.

## Risks / next work

- R8 must add historical Pi session discovery/recovery states and `history_gap`.
- R9 must convert runtime events into `Review Evidence` UX.
- Full live relay/mobile smoke still required before final roadmap completion.
