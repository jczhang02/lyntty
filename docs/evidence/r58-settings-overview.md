# R58 Settings overview polish

## Task

Beads: `lyntty-d29`.

Scope confirmed by grill: replace the low-information large logo/profile header with a compact overview. This is not a Diagnostics replacement and must not expose Pi runtime/debug/service detail in the main APK UI.

## Implementation

Updated `packages/lyntty-app/sources/components/SettingsView.tsx`:

- Replaced the large top logo/profile card with a compact four-row overview.
- Rows:
  - Relay: compact server host, opens existing server settings route.
  - Account: account summary, opens existing account settings route.
  - Nodes: paired/online node count, no debug drilldown.
  - Version: app/runtime/build info and existing dev-mode multi-click affordance.
- Left existing connect-terminal, machines, features, and about sections intact.

Added pure helpers and tests in `settingsOverview.ts` / `settingsOverview.test.ts`.

## Verification

```bash
pnpm --filter ./packages/lyntty-app test -- sources/components/settingsOverview.test.ts
pnpm --filter ./packages/lyntty-app typecheck
git diff --check
```

Results:

- `packages/lyntty-app` Vitest: 77 files, 769 tests passed.
- `packages/lyntty-app` typecheck passed.
- `git diff --check` passed.

## Pending final R58 matrix

Release-style APK screenshot validation will be captured after typography and remaining visual changes land, so Settings is visually reviewed in the final combined state.
