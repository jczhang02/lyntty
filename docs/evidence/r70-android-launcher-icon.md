# r70 — Android launcher icon refresh

Date: 2026-07-08
Bead: `lyntty-6ky`

## Scope

Improved Android launcher icon visual quality while preserving the `Ly` brand mark.

## Changes

- Replaced nested light-card launcher art with a dark-blue gradient icon and white `Ly` mark.
- Updated Expo/source launcher assets:
  - `packages/lyntty-app/sources/assets/images/icon.png`
  - `packages/lyntty-app/sources/assets/images/icon-adaptive.png`
  - `packages/lyntty-app/sources/assets/images/icon-monochrome.png`
  - `packages/lyntty-app/sources/assets/images/icon-source.svg`
- Updated Android native launcher resources:
  - adaptive background now uses `@drawable/ic_launcher_background` gradient.
  - foreground and monochrome WebP density assets are transparent mark layers.
  - legacy `ic_launcher.webp` and `ic_launcher_round.webp` density assets were regenerated.
- Removed `packages/lyntty-app/scripts/generate-brand-assets.sh` and the `generate-brand-assets` package script. Committed assets are now the source of truth, with `icon-source.svg` as editable source.
- Did not change splash, favicon, Tauri icons, logo, or wordmark.

Preview artifact:

- `docs/evidence/r70-android-launcher-icon-preview.png`

## Verification commands

```bash
node -e "JSON.parse(require('fs').readFileSync('packages/lyntty-app/package.json','utf8')); console.log('package json ok')"
# pass

python3 - <<'PY'
from pathlib import Path
import xml.etree.ElementTree as ET
for p in [
 Path('packages/lyntty-app/android/app/src/main/res/drawable/ic_launcher_background.xml'),
 Path('packages/lyntty-app/android/app/src/main/res/mipmap-anydpi-v26/ic_launcher.xml'),
 Path('packages/lyntty-app/android/app/src/main/res/mipmap-anydpi-v26/ic_launcher_round.xml'),
 Path('packages/lyntty-app/sources/assets/images/icon-source.svg'),
]:
    ET.parse(p)
    print('xml ok', p)
PY
# pass

pnpm --filter ./packages/lyntty-app typecheck
# pass

pnpm --filter ./packages/lyntty-app exec expo config --type introspect --json > /tmp/lyntty-6ky-expo-config-final.json
# pass

cd packages/lyntty-app/android && APP_ENV=development ./gradlew :app:assembleRelease \
  -PlynttyKeystoreFile=debug.keystore \
  -PlynttyKeystorePassword=android \
  -PlynttyKeyAlias=androiddebugkey \
  -PlynttyKeyPassword=android
# pass: BUILD SUCCESSFUL; output app/build/outputs/apk/release/app-release.apk

AAPT=$(find ~/.gradle/caches -path '*aapt2-8.12.0*' -name aapt2 -type f | head -1)
APK=packages/lyntty-app/android/app/build/outputs/apk/release/app-release.apk
"$AAPT" dump resources "$APK" | grep -A8 -E 'drawable/ic_launcher_background|mipmap/ic_launcher($|_)|color/iconBackground'
"$AAPT" dump xmltree --file res/BW.xml "$APK"
"$AAPT" dump xmltree --file res/0w.xml "$APK"
# pass: APK contains adaptive icon XML, foreground/monochrome mipmaps, and gradient background #111A33 -> #050914 angle 315.

git diff --check
# pass
```

## Notes

- A first unsigned `assembleRelease` attempt failed with `Production release builds require Lyntty release signing properties`; this is expected guard behavior. The successful validation used the local debug keystore to produce a release-style, debug-signed APK. No production signing secret was used or inspected.
- Existing local `google-services.json` presence allowed the release Gradle build to proceed; contents were not read or recorded.

## Not run

- APK was not installed on a physical phone or emulator.
- Production-signed Android release workflow was not run.

## Residual risk

- Visual validation is preview/resource-inspection based, not a real One UI launcher screenshot after install.
- `app.config.js` still has a solid `adaptiveIcon.backgroundColor` fallback because Expo config supports a single color there; checked-in Android native resources carry the gradient for release APKs.
