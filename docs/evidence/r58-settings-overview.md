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
  - Node Management: paired/online node count, no debug drilldown.
  - Version: app version only plus the existing hidden multi-click developer-mode affordance.
- Localized the new overview strings through the existing text system.
- Removed commit/runtime/build detail from the main Settings UI after review because those are developer/runtime details, not ordinary APK surface content.
- Left existing connect-terminal, machine list, features, and about sections intact.

Added pure helpers and tests in `settingsOverview.ts` / `settingsOverview.test.ts`.

## Verification

```bash
pnpm --filter ./packages/lyntty-app test -- sources/components/settingsOverview.test.ts
pnpm --filter ./packages/lyntty-app typecheck
git diff --check
```

Results:

- `packages/lyntty-app` Vitest: 77 files, 769 tests passed for the initial slice; post-review focused app verification passed 78 files / 773 tests.
- `packages/lyntty-app` typecheck passed.
- `git diff --check` passed.

## Final R58 APK validation

Release-style APK validation was rerun after icon, typography, and post-review Settings fixes landed.

Artifacts:

- `docs/evidence/artifacts/r58-visual-polish/final-review/settings-clean.png`
- `docs/evidence/artifacts/r58-visual-polish/final-review/settings-clean.xml`
- `docs/evidence/artifacts/r58-visual-polish/final-review/ui-assertions-clean.txt`

Evidence from final `settings.xml` / assertions:

- `Relay` visible with `10.0.2.2:3005`.
- `Account` visible with `Signed in`.
- `Node Management` visible with `No nodes paired`.
- `Version` visible with app version `1.7.0`.
- `Commit` and `runtime` strings are absent from the Settings overview.

This validates that the large low-information logo/profile header was replaced by a compact overview and that no Review Evidence, Diagnostics, or Pi runtime debug surface was added.
