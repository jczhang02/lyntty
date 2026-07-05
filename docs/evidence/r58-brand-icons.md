# R58 Lyntty brand/app icon replacement

## Task

Beads: `lyntty-wwd`.

Scope confirmed by grill: replace brand/app-level icons only through a unified generation/reference pipeline. Do not include Session-specific icons (`lyntty-efr`) or generic Ionicons.

## Source assets

Vector pack: `/home/jc/Downloads/lyntty_vector_pack`

Key inputs:

- `icons/lyntty_icon_1024.svg`
- `icons/lyntty_icon_maskable.svg`
- `marks/lyntty_mark_outline_dark_tight.svg`
- `marks/lyntty_mark_outline_inverse.svg`
- `wordmarks/lyntty_wordmark_mark_left.svg`

## Implementation

Added one reproducible pipeline:

```bash
pnpm --filter ./packages/lyntty-app generate-brand-assets /home/jc/Downloads/lyntty_vector_pack
```

The script writes Android/app/web brand assets referenced by `app.config.js` and active UI components:

- launcher/app icons: `icon.png`, `icon-adaptive.png`, `icon-monochrome.png`, `icon-tauri.png`
- notification icon: `icon-notification.png`
- splash images: `splash-android-light.png`, `splash-android-dark.png`
- header/settings marks: `logo-black.png`, `logo-white.png`, `logotype*.png`
- favicon assets: `favicon.png`, `favicon-active.png`, `public/favicon.ico`, `public/favicon-active.ico`

## Size notes

Selected size comparisons:

| Asset | Before bytes | After bytes |
| --- | ---: | ---: |
| `icon.png` | 852856 | 321292 |
| `icon-adaptive.png` | 852856 | 321292 |
| `icon-monochrome.png` | 852856 | 23149 |
| `icon-notification.png` | 10719 | 1539 |
| `logo-black.png` | 250025 | 9958 |
| `logo-white.png` | 250025 | 6867 |
| `logotype-dark.png` | 12742 | 13993 |
| `logotype-light.png` | 12725 | 13333 |
| `splash-android-light.png` | 7454 | 321292 |
| `splash-android-dark.png` | 7443 | 321292 |
| `public/favicon-active.ico` | 15406 | 9662 |
| `public/favicon.ico` | new | 9662 |

Splash images are intentionally larger because the new pack supplies full 1024px branded icon artwork instead of the prior tiny splash raster.

## Visual artifacts

- `docs/evidence/artifacts/r58-brand-icons/icon-contact-sheet.png`
- `docs/evidence/artifacts/r58-brand-icons/wordmark-contact-sheet.png`

## Verification

```bash
packages/lyntty-app/scripts/generate-brand-assets.sh /home/jc/Downloads/lyntty_vector_pack
pnpm --filter ./packages/lyntty-app typecheck
git diff --check
```

Results:

- brand asset generation succeeded
- generated PNG/ICO dimensions were inspected with `file`
- `packages/lyntty-app` typecheck passed
- `git diff --check` passed

## Final R58 APK/web validation

```bash
cd packages/lyntty-app/android && APP_ENV=preview EXPO_PUBLIC_LYNTTY_SERVER_URL=http://10.0.2.2:3005 CCACHE_DISABLE=1 CMAKE_C_COMPILER_LAUNCHER= CMAKE_CXX_COMPILER_LAUNCHER= ./gradlew assembleRelease --no-daemon
adb -s emulator-5554 install -r packages/lyntty-app/android/app/build/outputs/apk/release/app-release.apk
LYNTTY_MAESTRO_DEVICE=emulator-5554 LYNTTY_MAESTRO_SERVER_URL=http://10.0.2.2:3005 scripts/e2e/run-maestro.sh e2e/maestro/01_first_run.yml
cd packages/lyntty-app && APP_ENV=preview EXPO_PUBLIC_LYNTTY_SERVER_URL=http://127.0.0.1:3005 npx expo export --platform web --output-dir /tmp/lyntty-r58-web-export
```

Artifacts:

- `docs/evidence/artifacts/r58-visual-polish/final-review/launch.png` — release APK launched with updated app branding.
- `docs/evidence/artifacts/r58-visual-polish/final-review/after-first-run.png` — release APK first-run / onboarding state.
- `docs/evidence/artifacts/r58-visual-polish/final-review/settings.png` — Settings with updated brand marks, larger optical header mark, pet avatar, and compact overview.
- `docs/evidence/artifacts/r58-visual-polish/final-review/web-export.log` — web export completed and included new brand/font assets.

Results:

- Release-style APK `assembleRelease` passed.
- APK installed and launched on emulator `emulator-5554`.
- Maestro first-run account creation passed against a fresh local relay on `:3005`; `relay.log` shows server startup without `EADDRINUSE`.
- Web export passed.
- Artifact sensitive-string scan found no actual pairing URLs, data-encryption keys, authorization headers, bearer tokens, public keys, or secrets. Generic stale-token log lines were summarized out of `relay.log`.
