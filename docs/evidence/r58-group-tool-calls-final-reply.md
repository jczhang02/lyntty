# R58 Group Tool Calls final reply folding fix

## Issue

Beads: `lyntty-0oj`.

User screenshots:

- `/home/jc/Downloads/Screenshot_20260706_034748_Lyntty (dev).jpg`
- `/home/jc/Downloads/Screenshot_20260706_034745_Lyntty (dev).jpg`

User narrowed the scope: current Group Tool Calls UX is otherwise acceptable; the bug is that the agent final reply can be partially folded into the tool/work group.

## Root cause

`packages/lyntty-app/sources/hooks/useGroupedMessages.ts` treats the newest visible `agent-text` in a turn as the final answer boundary. When the final answer is split into multiple adjacent `agent-text` messages, only the newest part stays visible. Older adjacent final text is treated as prior work and folded into the agent work group.

## Fix

- Preserve existing Group Tool Calls design.
- Extend the final-answer boundary across adjacent non-thinking `agent-text` messages before tool/progress activity.
- Keep those split final reply parts visible outside the work group.
- Continue folding older progress/thinking/tool activity as before.

## Verification

```bash
pnpm --filter ./packages/lyntty-app test -- sources/hooks/useGroupedMessages.test.ts
pnpm --filter ./packages/lyntty-app typecheck
```

Results:

- `packages/lyntty-app` Vitest: 75 files, 765 tests passed.
- `packages/lyntty-app` typecheck passed.

## Not run

- Release-style APK visual check not run for this focused reducer/grouping fix. Final R58 matrix will cover APK/E2E after the remaining tasks.

## Residual risk

This fix intentionally does not redesign Group Tool Calls. It only prevents split final agent reply text from being folded into the work group.
