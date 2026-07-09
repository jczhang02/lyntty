# r74 — Android launcher icon mark scale

Date: 2026-07-09
Bead: `lyntty-884`
Branch: `fix/android-icon-scale`

## Scope

Reduced the visible `Ly` launcher mark so it has more breathing room on Samsung One UI, closer to the adjacent Happy icon shown in the user's screenshot `/home/jc/Downloads/Screenshot_20260709_190421_One UI Home.jpg`.

## Changes

- Kept the existing dark blue/near-black gradient background.
- Reduced the vector mark scale in `packages/lyntty-app/sources/assets/images/icon-source.svg` from `0.673418` to `0.538734`.
- Regenerated shared Expo assets used by dev, preview, and production app configs:
  - `packages/lyntty-app/sources/assets/images/icon.png`
  - `packages/lyntty-app/sources/assets/images/icon-adaptive.png`
  - `packages/lyntty-app/sources/assets/images/icon-monochrome.png`
- Regenerated native Android launcher resources for all densities:
  - `packages/lyntty-app/android/app/src/main/res/mipmap-*/ic_launcher*.webp`
- Left adaptive background XML unchanged: `#111A33 -> #050914` gradient.

Preview artifact:

- `docs/evidence/r74-android-launcher-icon-scale-preview.png`

## Visual/resource measurements

Before source asset white-mark bounding box:

- `icon.png`: `0.518w x 0.595h`
- `icon-adaptive.png`: `0.520w x 0.597h`
- `mipmap-xxxhdpi/ic_launcher.webp`: `0.516w x 0.594h`

After source/APK asset white-mark bounding box:

- `icon.png`: `0.415w x 0.477h`
- `icon-adaptive.png`: `0.416w x 0.479h`
- `mipmap-xxxhdpi/ic_launcher.webp`: `0.406w x 0.474h`
- APK `mipmap-xxxhdpi/ic_launcher_foreground.webp`: `0.426w x 0.491h`

## Verification commands

```bash
pnpm install --frozen-lockfile
# pass

python3 - <<'PY'
from pathlib import Path
import xml.etree.ElementTree as ET
from PIL import Image
for p in [
 Path('packages/lyntty-app/android/app/src/main/res/drawable/ic_launcher_background.xml'),
 Path('packages/lyntty-app/android/app/src/main/res/mipmap-anydpi-v26/ic_launcher.xml'),
 Path('packages/lyntty-app/android/app/src/main/res/mipmap-anydpi-v26/ic_launcher_round.xml'),
 Path('packages/lyntty-app/sources/assets/images/icon-source.svg'),
]:
 ET.parse(p)
 print('xml ok', p)
expected = {'mipmap-mdpi': (48,108), 'mipmap-hdpi': (72,162), 'mipmap-xhdpi': (96,216), 'mipmap-xxhdpi': (144,324), 'mipmap-xxxhdpi': (192,432)}
for density, (legacy, fg) in expected.items():
 base=Path('packages/lyntty-app/android/app/src/main/res')/density
 checks = {'ic_launcher.webp':legacy, 'ic_launcher_round.webp':legacy, 'ic_launcher_foreground.webp':fg, 'ic_launcher_monochrome.webp':fg}
 for name, size in checks.items():
  im=Image.open(base/name)
  assert im.size == (size,size), (base/name, im.size)
print('density dimensions ok')
PY
# pass

APP_ENV=development pnpm --filter ./packages/lyntty-app exec expo config --type public --json > /tmp/lyntty-icon-scale-expo-dev.json
APP_ENV=production pnpm --filter ./packages/lyntty-app exec expo config --type public --json > /tmp/lyntty-icon-scale-expo-prod.json
node - <<'NODE'
const fs = require('fs')
for (const [label, file] of [['dev','/tmp/lyntty-icon-scale-expo-dev.json'], ['prod','/tmp/lyntty-icon-scale-expo-prod.json']]) {
  const cfg = JSON.parse(fs.readFileSync(file, 'utf8'))
  console.log(label, cfg.android.package, cfg.icon, cfg.android.adaptiveIcon.foregroundImage, cfg.android.adaptiveIcon.monochromeImage)
  if (cfg.icon !== './sources/assets/images/icon.png') throw new Error('bad icon')
  if (cfg.android.adaptiveIcon.foregroundImage !== './sources/assets/images/icon-adaptive.png') throw new Error('bad foreground')
  if (cfg.android.adaptiveIcon.monochromeImage !== './sources/assets/images/icon-monochrome.png') throw new Error('bad mono')
}
NODE
# pass: dev package dev.jczhang.lyntty.dev and prod package dev.jczhang.lyntty both use the regenerated shared icon assets.

pnpm --filter ./packages/lyntty-app typecheck
# pass

cd packages/lyntty-app/android
CCACHE_DIR=/tmp/lyntty-icon-scale-ccache APP_ENV=development ./gradlew :app:assembleDebugOptimized
# pass: app/build/outputs/apk/debugOptimized/app-debugOptimized.apk

CCACHE_DIR=/tmp/lyntty-icon-scale-ccache APP_ENV=production ./gradlew :app:assembleRelease \
  -PlynttyKeystoreFile=debug.keystore \
  -PlynttyKeystorePassword=android \
  -PlynttyKeyAlias=androiddebugkey \
  -PlynttyKeyPassword=android
# pass: app/build/outputs/apk/release/app-release.apk

# APK resource check
# debugOptimized and release xxxhdpi launcher/foreground WebP SHA-256 hashes matched source native resources.
# debugOptimized/release ic_launcher.webp mark bbox: 0.406w x 0.474h.
# debugOptimized/release ic_launcher_foreground.webp mark bbox: 0.426w x 0.491h.

git diff --check
# pass
```

## Notes

- The release-style local APK was debug-signed and used ignored local placeholder `google-services.json` only to satisfy the production release build guard. No production signing key or Firebase secret was used or inspected.
- Temporary ignored local credential/build helper files were removed after verification; generated APK build outputs remain under ignored Gradle output directories.

## Not run

- Physical-phone install/screenshot after this scale adjustment.
- Production-signed GitHub Android release workflow.

## Residual risk

- Final One UI launcher result still needs a real phone screenshot to confirm the optical size feels right after Samsung launcher masking/caching.
