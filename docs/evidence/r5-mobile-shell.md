# R5 Mobile Shell Evidence

Date: 2026-06-30

## Scope

Roadmap phase R5 / Beads `lyntty-ekv.5`: preserve Lyntty's mobile vibe while shaping active product navigation into Lyntty mobile-only IA.

## Changed files

- `docs/architecture/mobile-shell.md`
- `docs/evidence/r5-mobile-shell.md`

R5 relies on R4 mobile shell changes already recorded in `docs/evidence/r4-product-surface-cut.md`:

- `packages/lyntty-app/sources/components/MainView.tsx`
- `packages/lyntty-app/sources/components/TabBar.tsx`
- `packages/lyntty-app/sources/app/(app)/_layout.tsx`
- `packages/lyntty-app/sources/components/SettingsView.tsx`
- deleted inbox/friends/voice/usage/Claude-connect routes

## Static mobile IA proof

`docs/architecture/mobile-shell.md` defines:

- main tabs: `Sessions Home` and `Settings`.
- `Sessions Home` responsibilities.
- `Node Management` responsibilities.
- `Session Remote` responsibilities.
- `Review Evidence` placement inside `Session Remote`.
- removed product surfaces: inbox/friends/social, voice, usage/paywall, Claude connect, multi-agent picker, web/SaaS/community.

Static source checks:

```bash
grep -n "InboxView\|VoiceAssistantStatusBar\|useFriendRequests\|useRealtimeStatus\|sessions\|settings" packages/lyntty-app/sources/components/MainView.tsx
grep -n "TabType\|inbox\|sessions\|settings" packages/lyntty-app/sources/components/TabBar.tsx
grep -n "inbox\|friends\|settings/voice\|settings/usage\|connect/claude\|session/\[id\]\|machine\|new/index" packages/lyntty-app/sources/app/'(app)'/_layout.tsx
```

Observed results:

- `MainView.tsx` active tab type is `sessions | settings`.
- `TabBar.tsx` active tabs are only `sessions` and `settings`.
- `_layout.tsx` no longer registers inbox/friends/voice/usage/Claude-connect screens.
- `SessionView` route remains active as the `Session Remote` base.
- `machine/[id]` file remains as `Node Management` base even though it is not manually registered in `_layout.tsx` after route cleanup.

## Verification commands

```bash
pnpm --filter ./packages/lyntty-app run typecheck
pnpm --filter ./packages/lyntty-cli run typecheck
pnpm --filter ./packages/lyntty-relay run typecheck
pnpm --filter ./packages/lyntty-agent run typecheck
```

Results:

- `lyntty-app` typecheck passed.
- `lyntty-cli` typecheck passed.
- `lyntty-relay` typecheck passed.
- `lyntty-agent` typecheck passed.

## Android build status

Android build not run.

Reason:

- No native `packages/lyntty-app/android/` directory exists in the imported Expo app tree.
- `adb devices` showed no connected Android device/emulator.
- Running `expo run:android` would require native prebuild/device setup and can create large generated native projects; R5 records this as an explicit not-run reason.

Command evidence:

```bash
ls -d packages/lyntty-app/android packages/lyntty-app/ios
adb devices
pnpm --filter ./packages/lyntty-app run android --help
```

Observed:

- `packages/lyntty-app/android` absent.
- no connected devices listed by `adb devices`.
- `expo run:android --help` works, confirming command availability.

## Not run

- Android emulator/device smoke.
- Screenshot capture.
- Maestro flows.
- Native prebuild.

## Risks / next work

- Need actual Android build/smoke after native project/device/emulator setup.
- R6 must connect `Session Remote` controls to the Pi runtime path.
- R8 must add historical session discovery states to `Sessions Home`.
- R9 must implement `Review Evidence` content, not just placement.
