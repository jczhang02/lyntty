# R58 Session animal icon generator

## Task

Beads: `lyntty-efr`.

Goal: replace only the visual session avatar generator while preserving existing session identity/seed/selection logic and surrounding Session Home/Session Remote status behavior.

## Design decision

Prototype decision recorded in Beads:

- Use `Pet Trio Buddies` as the default session-avatar direction.
- Sessions deterministically render as cat, pig, or dog.
- Cats use the cleaner `Mini Pet Stickers` cat treatment.
- Pigs and dogs use the soft buddy style.
- Keep existing avatar id/seed selection unchanged.

## Fix

- Added `AvatarPet` SVG avatar renderer.
- Added pure deterministic `resolvePetAvatarParts(id)` helper.
- Swapped the default generated-avatar renderer from gradient images to `AvatarPet`.
- Preserved existing `avatarStyle` selection logic:
  - `pixelated` still uses `AvatarSkia`.
  - `brutalist` still uses `AvatarBrutalist`.
  - stored compatibility style `gradient` now renders the pet avatar renderer.
- Changed the default `avatarStyle` from `brutalist` to `gradient`, making pet avatars the actual default for fresh installs.
- Updated the Appearance setting label for the compatibility `gradient` value to “Pet” (localized equivalents where available) so the UI no longer calls the pet renderer “Gradient”.
- Preserved existing status/flavor overlay behavior.

## Verification

```bash
pnpm --filter ./packages/lyntty-app test -- sources/components/AvatarPet.test.ts
pnpm --filter ./packages/lyntty-app typecheck
```

Results:

- `packages/lyntty-app` Vitest: 76 files, 767 tests passed.
- `packages/lyntty-app` typecheck passed.

## Final R58 APK validation

Final release-style APK artifacts:

- `docs/evidence/artifacts/r58-visual-polish/final-review/settings.png`
- `docs/evidence/artifacts/r58-visual-polish/final-review/settings.xml`

The Settings overview account row uses the shared `Avatar` component and shows the pet renderer in the release-style APK, validating the renderer at compact row size after the default change. Session-list specific 48/80px pet-avatar contexts remain covered by deterministic unit tests and TypeScript; no physical phone screenshot was captured.
