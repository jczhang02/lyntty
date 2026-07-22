# R106 — Launcher icon canonicalization

Date: 2026-07-22

Branch: `fix/remove-obsolete-icons`

Bead: `lyntty-70b`

## Result

The Stable Release Note now displays the current Android Launcher Icon, and every tracked obsolete neon-phone branding asset has been removed.

The canonical launcher sources remain:

- editable source: `packages/lyntty-app/sources/assets/images/icon-source.svg`
- Expo launcher input: `packages/lyntty-app/sources/assets/images/icon.png`
- current PNG SHA-256: `623c58fc79ca76c57eea042a1ec91ef51570ba05496039dfe3eda140b0b137db`

`app.config.js` still binds the top-level Expo icon to that PNG. Android adaptive, monochrome, notification, splash, and density-specific `mipmap`/`drawable` resources remain because they are current build inputs or generated native resources.

## Removed obsolete assets

The following old neon-phone assets were deleted:

- `logo.png`
- `packages/lyntty-app/logo.png`
- `.github/mascot.png`
- `.github/header.png`
- `.github/logotype-dark.png`
- `.github/logotype-light.png`

The first three were byte-identical 1024×1024 PNG files with SHA-256 `6bf41612ebe282a6813cc02fca02c92ae169c854ae285b0249d776fc0105dc17`. The removed header embedded the same obsolete phone artwork. Both removed GitHub logotypes contained a scaled copy of that artwork beside the Lyntty name. None of the six files was referenced by current app configuration, Gradle, Android Manifest, or production UI code.

A repository-hardening regression now requires all six paths to remain absent, loads `app.config.js` and verifies the resolved canonical launcher icon path, and reads every tracked PNG from the Git index to reject the obsolete neon PNG digest anywhere in the inventory.

Historical R11 evidence still names these files as artifacts that existed during that earlier branding pass. Those references are retained as historical records; the files themselves no longer exist, and the new hardening test prevents their restoration.

## Stable Release Note correction

GitHub Release `357552269` (`compat-v1.2.0_1.2.0_1.2.0_0.2.0-s1`) was edited in place to replace:

```text
packages/lyntty-app/logo.png
```

with the release-source-pinned canonical icon:

```text
https://raw.githubusercontent.com/jczhang02/lyntty/39745de8dc9d7b7bfa6706320abbabb05c6cc3e1/packages/lyntty-app/sources/assets/images/icon.png
```

Post-edit checks proved:

- title remains `V1.2.0 Local First 📡`;
- body is byte-for-byte equal to the reviewed Mole-style note with only the icon URL changed;
- the obsolete icon URL is absent from the API response and anonymous public Release page;
- tag, target source, Stable/Latest status, and immutable status are unchanged;
- all 36 asset IDs, names, sizes, and digests are unchanged;
- the bilingual physical-device validation warning remains visible.

## Verification

```text
bun test scripts/workflow-hardening.test.mjs --test-name-pattern 'current launcher icon'
1 pass, 0 fail

bun test scripts/workflow-hardening.test.mjs
29 pass, 0 fail

CI=true bun run ci:fast
pass (repo hardening, audit, Wire, CLI, Relay, app, Android bundle, development lifecycle, diff check)

git diff --check
pass
```

The focused regression was run before deletion and failed because the obsolete paths still existed; it passed after all six assets were removed.

## Not run and residual risk

- No Android source or native launcher resource changed, so no new APK was published.
- No physical Android device validation was run; the existing Stable owner waiver remains visible and authoritative.
- No Relay deployment or production rollback was run.
