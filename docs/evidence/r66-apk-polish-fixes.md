# R66 APK polish fixes

Date: 2026-07-07
Status: implementation in progress, local app tests passing

## Scope

Fix user-reported Android APK polish regressions before the next production APK release:

1. Lyntty launcher icon and native splash still used stale Happy-era Android resources.
2. Settings showed stale Expo config version instead of native APK version/build.
3. In-app changelog showed inherited Happy release text instead of Lyntty release information.
4. Session transcript prose used the wrong CJK font scope.

## Changes

### Android branding assets

Synced checked-in Android native resources from the existing Lyntty source assets under `packages/lyntty-app/sources/assets/images/`:

- launcher icons: `android/app/src/main/res/mipmap-*/ic_launcher.webp`
- adaptive foreground icons: `android/app/src/main/res/mipmap-*/ic_launcher_foreground.webp`
- monochrome adaptive icons: `android/app/src/main/res/mipmap-*/ic_launcher_monochrome.webp`
- round launcher icons: `android/app/src/main/res/mipmap-*/ic_launcher_round.webp`
- splash icons: `android/app/src/main/res/drawable-*/splashscreen_logo.png`
- night splash icons: `android/app/src/main/res/drawable-night-*/splashscreen_logo.png`
- notification icons: `android/app/src/main/res/drawable-*/notification_icon.png`

Generated visual contact sheet:

- `/tmp/lyntty-branding-after.png`

### Version display and update version source

Settings now formats the native app version as:

```text
<nativeApplicationVersion> (<nativeBuildVersion>)
```

with Expo config fallback only when native metadata is unavailable.

The native update check now sends `Application.nativeApplicationVersion` when available, plus Android `Application.nativeBuildVersion` as `version_code`.

Default app/Gradle version names were reset to `1.0.0`; production release workflow inputs still remain authoritative for signed APK builds.

### Fixed release changelog format

Replaced inherited Happy changelog entries with a fixed Lyntty release format:

```text
# Lyntty Android <versionName> (<versionCode>) — <YYYY-MM-DD>

<one-line summary>

## Highlights
- ...

## Fixed
- ...

## Known gaps
- ...
```

Current top entry:

```text
Lyntty Android 1.0.0 (4) — 2026-07-07
```

Generated `packages/lyntty-app/sources/changelog/changelog.json` from `packages/lyntty-app/CHANGELOG.md`.

The Android release workflow now validates the top changelog title against `version_name` and `version_code`, writes GitHub Release notes from that entry, and writes `latest.json.notes` from the one-line summary.

### Session transcript font rule

Implemented the agreed Session transcript rule:

- English/Latin session prose: Source Serif 4.
- Chinese/CJK session prose: LXGW Neo ZhiSong.
- Code and tool output: IBM Plex Mono.
- General UI font discussion is out of scope for this fix.

Added official LXGW Neo ZhiSong Regular TTF from `lxgw/LxgwNeoZhiSong` v1.063:

```text
packages/lyntty-app/sources/assets/fonts/LXGWNeoZhiSong-Regular.ttf
sha256 bfd54d7899976bd6f8dede885ed69e4ce89a5b6d95221d0451cf3ab8a84ce97b
```

Included upstream IPA Font License 1.0 text:

```text
packages/lyntty-app/sources/assets/fonts/LICENSE-LXGWNeoZhiSong-IPA.txt
```

Removed old LXGW WenKai subset and license assets from the app bundle.

`MarkdownView` now splits non-code session text by script so mixed English/Chinese paragraphs can use Source Serif 4 and LXGW Neo ZhiSong in separate text runs. Inline code and fenced code remain monospace.

## Verification

Commands run:

```bash
pnpm --filter ./packages/lyntty-app exec tsx sources/scripts/parseChangelog.ts
RUNNER_TEMP=$(mktemp -d) VERSION_NAME=1.0.0 VERSION_CODE=4 node <android-release metadata parser smoke>
pnpm --filter ./packages/lyntty-app test -- sources/constants/Typography.test.ts sources/components/markdown/sessionTextRuns.test.ts --runInBand
pnpm --filter ./packages/lyntty-app typecheck
cd packages/lyntty-app/android && ./gradlew :app:processDebugResources --no-daemon --max-workers=2 --console=plain
# workflow YAML parse smoke
python - <<'PY'
import yaml
for path in ['.github/workflows/android-release.yml', '.github/workflows/typecheck.yml', '.github/workflows/docs.yml', '.github/workflows/relay-deploy.yml', '.github/workflows/relay-image.yml']:
    with open(path, 'r', encoding='utf-8') as f:
        yaml.safe_load(f)
PY
git diff --check
/tmp/gitleaks-8.30.1/gitleaks detect --source . --report-path /tmp/lyntty-gitleaks-report-r66.json --redact --no-banner
# candidate tracked/untracked-to-commit scan, excluding ignored local build/google-services files
tmp=$(mktemp -d)
while IFS= read -r -d '' f; do
  [ -e "$f" ] && printf '%s\0' "$f"
done < <(git ls-files -z --cached --modified --others --exclude-standard) | rsync -a --files-from=- --from0 ./ "$tmp"/
/tmp/gitleaks-8.30.1/gitleaks dir "$tmp" --report-path /tmp/lyntty-gitleaks-report-r66-candidate-final.json --redact --no-banner
```

Results:

- Changelog parser generated one entry with latest title `Lyntty Android 1.0.0 (4) — 2026-07-07`.
- Release metadata parser smoke extracted summary `First clean Lyntty Android release line.`.
- App test command completed successfully; Vitest ran 80 files / 788 tests, all passing.
- App typecheck completed successfully.
- Android debug resource processing completed successfully (`BUILD SUCCESSFUL in 21s`).
- Workflow YAML parse smoke passed for Android release, CI, docs, relay deploy, and relay image workflows.
- `git diff --check` passed.
- Final full-history gitleaks detect after the signed commit completed with no leaks (`/tmp/lyntty-gitleaks-report-r66-final.json`).
- Candidate tracked/untracked-to-commit gitleaks dir scan covered 21.92 MB with no leaks.
- Full working-tree gitleaks dir scan reported 30 findings only in ignored local Android build outputs and ignored local `google-services.json` files; these are not candidate commit files.

## Not yet run

- Full Android APK build / APK install
- Physical phone validation of launcher icon, splash, Settings version, changelog page, and Session transcript fonts

## Residual risks

- LXGW Neo ZhiSong adds about 10 MiB source TTF payload before APK compression.
- React Native text selection with nested script-split `Text` runs needs device validation.
- Next production release should use `version_name=1.0.0` and `version_code=4` unless the workflow run number or retry plan changes.
