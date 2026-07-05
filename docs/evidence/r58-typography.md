# R58 Typography update

## Task

Beads: `lyntty-tqi`.

Goal: move APK/web typography toward an Anthropic-like editorial feel while keeping Lyntty readable on Android and web.

## Implementation

Updated active app typography:

- UI/default text: Source Sans 3 regular/semibold.
- Editorial headers and Markdown reading body: Source Serif 4.
- CJK fallback: platform serif/CJK fallback. The full LXGW Neo ZhiSong Screen font was evaluated but removed from the boot-loaded bundle after review because it added about 20.67 MiB source / about 10 MiB compressed APK payload and hard-gated startup font loading.
- Code/tool output: retained IBM Plex Mono to avoid degrading dense terminal/tool output.
- Font loading updated in `packages/lyntty-app/sources/app/_layout.tsx` for native/web/Tauri paths.
- Markdown rendering now uses reading/body/header typography instead of plain IBM Plex Sans, while preserving mono code blocks.

Bundled new fonts:

```text
SourceSerif4-Regular.ttf          0.25 MiB
SourceSerif4-Semibold.ttf         0.26 MiB
SourceSans3-Regular.ttf           0.41 MiB
SourceSans3-Semibold.ttf          0.41 MiB
```

License check:

- Source Serif 4 / Source Sans 3: SIL Open Font License 1.1 from Adobe upstream LICENSE files.
- Bundled license text is stored at `packages/lyntty-app/sources/assets/fonts/LICENSE-SourceSans3-SourceSerif4-OFL.txt`.
- LXGW Neo ZhiSong Screen was not shipped in the final bundle. If future Chinese typography requires it, use a subset or lazy-load strategy and include the upstream IPA Font License v1.0 text.

Risk decision:

- Full LXGW was not kept in the app bundle because the R58 review identified startup and web-export performance risk. Chinese text falls back to platform CJK serif fonts until a subset is prepared.

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

- `docs/evidence/artifacts/r58-visual-polish/final-review/settings.png` — release-style APK visual check of updated UI font stack.
- `docs/evidence/artifacts/r58-visual-polish/final-review/apk-size-before-final.txt` / `apk-size-after-final.txt` — final post-review APK size artifacts.
- `docs/evidence/artifacts/r58-visual-polish/apk-size-before.txt` / `apk-size-after.txt` — earlier full-LXGW build measured the unacceptable 291 MiB → 302 MiB APK growth that led to removing LXGW from the final active font bundle.
- `docs/evidence/artifacts/r58-visual-polish/final-review/web-export.log` and `web-export-size.txt` — final web export passed without LXGW, with output size `39M` instead of the earlier full-LXGW `60M` export.

Results:

- Release-style APK build/install/launch passed.
- Maestro first-run account creation passed after the typography update.
- Web export passed.
- Final web export log includes Source Sans 3 and Source Serif 4 assets and no LXGW asset.
- No actual artifact secrets were found by sensitive-string scan.

Residual risk: production Chinese typography can be improved later with a subsetted CJK font. The full font should not be boot-loaded as-is.
