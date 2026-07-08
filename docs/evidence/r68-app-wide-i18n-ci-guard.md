# r68 — App-wide i18n CI guard

Date: 2026-07-08
Bead: `lyntty-br3`

## Scope

Added app-wide hardcoded user-visible string guard for `packages/lyntty-app` and removed current lint-detected hardcoded UI copy from app source.

## Changes validated

- Added `packages/lyntty-app/eslint.i18n.config.mjs` and local rule `scripts/eslint-rules/no-hardcoded-user-strings.mjs`.
- Added i18n guard tests:
  - `sources/i18n/noHardcodedUserStrings.test.ts`
  - `sources/i18n/translationCoverage.test.ts`
- Added `lint:i18n` package script and CI step in `.github/workflows/typecheck.yml`.
- Added `appWide` translation keys to English plus Simplified/Traditional Chinese; other locale files keep complete fallback structure.
- Replaced lint-detected app UI copy with `t(...)` or explicit technical allowlist.

## Commands

```bash
pnpm --filter ./packages/lyntty-app lint:i18n
# pass

pnpm --filter ./packages/lyntty-app typecheck
# pass

pnpm --filter ./packages/lyntty-app exec vitest run sources/i18n/translationCoverage.test.ts sources/i18n/noHardcodedUserStrings.test.ts
# 2 files, 5 tests passed

pnpm --filter ./packages/lyntty-app test -- --run
# 82 files, 793 tests passed

git diff --check
# pass
```

## Residual risk

- Static lint cannot prove every runtime string produced by remote data is localized; it guards common app UI patterns and known modal/notification/object-copy surfaces.
- No Android release-style APK visual pass was run for translated screens in this change.
