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

## Pending final R58 matrix

Release-style APK build/screenshot validation and web/dev visual validation will be run after the remaining R58 visual changes land, so typography is checked in the final combined UI state.
