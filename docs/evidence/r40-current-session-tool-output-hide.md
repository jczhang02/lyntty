# R40 Current-Session Mirrored Tool Output Hide

Date: 2026-07-03

Task: `lyntty-6oj`.

## Symptom

User screenshot `/home/jc/Downloads/Screenshot_20260703_193921_Lyntty (dev).jpg` showed the current Lyntty session rendering serialized Pi tool-output JSON such as:

- Beads issue JSON fields (`status`, `issue_type`, `close_reason`);
- `746cfbe gpg: Signature made ...`;
- `warning: beads.role not configured`.

It appeared instead of the assistant's final message because the app was rendering mirrored Pi tool-result payloads as visible `agent-text` thinking messages. Those entries came from the current session mirror/history state, not from the final user-facing assistant response.

## Root cause

R35/R36/R39 filtered only legacy historical ids like `pi-history-*-tool-output` and the disabled-grouping bypass. The new screenshot used a non-history/current-session id while still containing an escaped serialized tool-result payload (`content` + `details`), so the compatibility filter did not match it.

## Fix

`packages/lyntty-app/sources/hooks/useGroupedMessages.ts` now also hides `agent-text` thinking messages that look like serialized Pi tool-result payloads with `content` + `details` and known tool-output markers (`toolResult`, `tool_result`, `bd show`, `gpg: Signature made`, or `beads.role not configured`).

Regression added in `packages/lyntty-app/sources/hooks/useGroupedMessages.test.ts` for a current-session mirrored serialized tool-output message with a non-history id.

## Verification

```bash
pnpm --filter ./packages/lyntty-app exec vitest run sources/hooks/useGroupedMessages.test.ts
# ✓ sources/hooks/useGroupedMessages.test.ts (13 tests)

pnpm --filter ./packages/lyntty-app typecheck
# tsc --noEmit passed

git diff --check
# passed
```

## Note

This is an app-side compatibility filter for already-synced bad display rows. Longer-term, current-session Pi mirror producers should avoid creating text/thinking envelopes for tool results and should emit structured `tool-call-end.result` only.
