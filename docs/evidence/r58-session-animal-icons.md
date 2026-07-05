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
  - default style now uses the pet avatar renderer.
- Preserved existing status/flavor overlay behavior.

## Verification

```bash
pnpm --filter ./packages/lyntty-app test -- sources/components/AvatarPet.test.ts
pnpm --filter ./packages/lyntty-app typecheck
```

Results:

- `packages/lyntty-app` Vitest: 76 files, 767 tests passed.
- `packages/lyntty-app` typecheck passed.

## Not run

- Release-style APK screenshot validation not run in this per-task slice. Final R58 E2E/visual matrix will capture app screenshots after remaining visual tasks land.

## Residual risk

`react-native-svg` rendering is covered by TypeScript compile but not by a device screenshot in this slice. Final E2E should visually inspect Sessions Home and Session Remote at 24/48/80px-equivalent contexts.
