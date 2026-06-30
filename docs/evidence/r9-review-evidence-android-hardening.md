# R9 Review Evidence and Android Hardening Evidence

Date: 2026-06-30

## Scope

Roadmap phase R9 / Beads `lyntty-ekv.9`: add `Review Evidence` inside `Session Remote`, preview security helpers, notification routing evidence, and Android build/smoke status.

## Changed files

- `packages/lyntty-app/sources/sync/reviewEvidence.ts`
- `packages/lyntty-app/sources/sync/reviewEvidence.test.ts`
- `packages/lyntty-app/sources/components/ReviewEvidencePanel.tsx`
- `packages/lyntty-app/sources/-session/SessionView.tsx`
- `packages/lyntty-app/sources/utils/previewSecurity.ts`
- `packages/lyntty-app/sources/utils/previewSecurity.test.ts`
- `docs/evidence/r9-review-evidence-android-hardening.md`

## Implemented behavior

### Review Evidence reducer

`buildReviewEvidence(messages)` now derives a mobile-safe summary from Session Remote messages:

- changed files.
- commands.
- check/test commands.
- tool count.
- failed tool count.
- errors.
- recovery states including `history_gap`, `missing_local_history`, `import_failed`, `active_runtime`, `stale_local`, `registered`, and `discovered_local`.
- severity: `info`, `warning`, or `error`.

### Review Evidence panel in Session Remote

`ReviewEvidencePanel` is mounted inside `SessionViewLoaded`, above the chat list:

- shows a compact card only when evidence exists.
- displays changed-file preview.
- displays tabular numeric pills for files/checks/tools/errors.
- surfaces checks and recovery states.
- uses Lyntty-style mobile card spacing/shadow while keeping Lyntty vocabulary (`Review Evidence`).

### Preview security hardening

`previewSecurity.ts` adds safe preview configuration:

- allows only `http:` and `https:` preview URIs.
- rejects `javascript:`, `data:`, `file:`, malformed URLs, and credential-bearing URLs.
- strips URL fragments.
- returns WebView-style hardening defaults:
  - `javaScriptEnabled: false`
  - `allowFileAccess: false`
  - `allowUniversalAccessFromFileURLs: false`
  - `allowsInlineMediaPlayback: false`
  - `originWhitelist: ['http://*', 'https://*']`

### Notifications evidence

Existing notification routing tests were run to verify notification-to-session route behavior remains intact after shell changes.

## Commands run

Review Evidence and preview tests:

```bash
pnpm --filter ./packages/lyntty-app exec vitest run sources/sync/reviewEvidence.test.ts sources/utils/previewSecurity.test.ts
```

Result:

- 2 test files passed.
- 7 tests passed.

Notification routing tests:

```bash
pnpm --filter ./packages/lyntty-app exec vitest run sources/utils/notificationRouting.test.ts
```

Result:

- 1 test file passed.
- 7 tests passed.

App typecheck:

```bash
pnpm --filter ./packages/lyntty-app run typecheck
```

Result:

- `lyntty-app` typecheck passed.

## Android build/smoke status

Android build not run.

Reason:

- Imported Expo app has no native `packages/lyntty-app/android/` directory.
- `adb devices` listed no connected Android device/emulator.
- Running `expo run:android` would require native prebuild/device setup and create large generated native projects.

Command evidence:

```bash
ls -d packages/lyntty-app/android packages/lyntty-app/ios
adb devices
pnpm --filter ./packages/lyntty-app run android --help
```

Observed:

- no native Android/iOS directories printed.
- no devices listed.
- `expo run:android --help` printed normally.

## Not run

- Android emulator/device smoke.
- Maestro flows.
- Screenshot capture.
- Live preview WebView render.
- Full mobile -> relay -> daemon -> Pi Review Evidence flow.

## Risks / next work

- Native Android project/device setup remains required for final device acceptance.
- Preview hardening helper exists, but any future WebView preview screen must call it.
- Full end-to-end Review Evidence needs live relay/daemon/Pi event traffic.
