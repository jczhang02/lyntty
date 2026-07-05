# R58 Typography update

## Task

Beads: `lyntty-tqi`.

Goal: move APK/web typography toward an Anthropic-like editorial feel while keeping Lyntty readable on Android and web.

## Implementation

Updated active app typography:

- UI/default text: Source Sans 3 regular/semibold.
- Editorial headers: Source Serif 4 semibold.
- Chat/Markdown reading body: LXGW Neo ZhiSong Screen Full for Chinese-friendly serif reading.
- Code/tool output: retained IBM Plex Mono to avoid degrading dense terminal/tool output.
- Font loading updated in `packages/lyntty-app/sources/app/_layout.tsx` for native/web/Tauri paths.
- Markdown rendering now uses reading/body/header typography instead of plain IBM Plex Sans.

Bundled fonts:

```text
SourceSerif4-Regular.ttf          0.25 MiB
SourceSerif4-Semibold.ttf         0.26 MiB
SourceSans3-Regular.ttf           0.41 MiB
SourceSans3-Semibold.ttf          0.41 MiB
LXGWNeoZhiSongScreenFull.ttf     20.67 MiB
```

License check:

- Source Serif 4 / Source Sans 3: SIL Open Font License 1.1 from Adobe upstream LICENSE files.
- LXGW Neo ZhiSong Screen: IPA Font License v1.0 per upstream `lxgw/LxgwNeoXiZhi-Screen` repository; incorporated components documented by upstream.

Risk decision:

- The full LXGW Chinese font adds about 20.67 MiB before APK compression. This was kept because the user specifically supplied the full font source and requested Anthropic-like typography with Chinese readability; if release APK size becomes unacceptable, the next step is subsetting.

## Verification

```bash
pnpm --filter ./packages/lyntty-app test -- sources/constants/Typography.test.ts sources/components/markdown/parseMarkdown.test.ts sources/components/settingsOverview.test.ts
pnpm --filter ./packages/lyntty-app typecheck
git diff --check
```

Results:

- App Vitest: 78 files, 772 tests passed.
- App typecheck passed.
- `git diff --check` passed.

## Final R58 APK/web validation

Additional commands:

```bash
cd packages/lyntty-app/android && APP_ENV=preview EXPO_PUBLIC_LYNTTY_SERVER_URL=http://10.0.2.2:3005 CCACHE_DISABLE=1 CMAKE_C_COMPILER_LAUNCHER= CMAKE_CXX_COMPILER_LAUNCHER= ./gradlew assembleRelease --no-daemon
adb -s emulator-5554 install -r packages/lyntty-app/android/app/build/outputs/apk/release/app-release.apk
cd packages/lyntty-app && APP_ENV=preview EXPO_PUBLIC_LYNTTY_SERVER_URL=http://127.0.0.1:3005 npx expo export --platform web --output-dir /tmp/lyntty-r58-web-export
```

Artifacts:

- `docs/evidence/artifacts/r58-visual-polish/settings.png` — release-style APK visual check of updated UI font stack.
- `docs/evidence/artifacts/r58-visual-polish/apk-size-before.txt` / `apk-size-after.txt` — APK size moved from 291 MiB to 302 MiB after full Chinese font bundling.
- `docs/evidence/artifacts/r58-visual-polish/web-export.log` — web export includes `LXGWNeoZhiSongScreenFull` (22MB), Source Sans 3, and Source Serif 4 assets.

Results:

- Release-style APK build/install/launch passed.
- Maestro first-run account creation passed after the typography update.
- Web export passed.
- No artifact secrets found by sensitive-string scan.

Residual risk: the full LXGW font is intentionally large. If production APK size becomes a release blocker, subset the font before distribution.
