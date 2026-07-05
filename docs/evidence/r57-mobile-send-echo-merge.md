# R57 — mobile send echo merge and mobile context

Date: 2026-07-06

## Scope

Fix the Session Remote path where a phone-sent message to an ordinary computer-side `pi` session could appear twice: once as the optimistic mobile user bubble and again when Pi wrote the same user message to JSONL and Lyntty mirrored it back. Also make phone/computer user messages share the same bubble style and add a default-on mobile context side channel that can be disabled from Settings.

Pi extension safety rule was followed: validation used temporary `HOME`, temporary `LYNTTY_HOME_DIR`, an explicitly loaded isolated Lyntty Pi extension file, and an isolated local relay. The live global Pi extension was not installed, overwritten, or reloaded.

## Changes

- App send metadata now includes `remoteCommandLocalKey`, optional `remoteCommandState: queued`, and `sendMobileContextToPi`.
- The app reducer merges canonical Pi user echoes carrying the same `remoteCommandLocalKey` back into the optimistic phone bubble and marks it `accepted_by_pi` instead of rendering a duplicate user message.
- `/goal`, `/context`, and unsupported slash commands are result/notice-only from mobile, so they do not show an indefinite `Sending…` label; `/skill:*` and ordinary text still show queued state until Pi echo confirms delivery.
- Computer-origin user messages use the same phone-style bubble frame with a `Computer` source label; phone queued sends show `Sending…` only while awaiting Pi echo.
- Pi extension command envelopes now carry local key and mobile-context preference; the extension injects hidden `lyntty-mobile-context` custom context before phone-origin prompts when enabled, without prefixing the visible prompt text.
- Settings > Features > Session Remote adds default-on `sendMobileContextToPi`.

## Automated verification

Artifacts: `docs/evidence/artifacts/r57-mobile-send-echo-merge/final-verification.log`

- `pnpm --filter ./packages/lyntty-app test` — 74 files / 763 tests passed.
- `pnpm --filter ./packages/lyntty-app typecheck` — passed.
- `pnpm --filter ./packages/lyntty-cli test` — 90 files / 780 tests passed.
- `pnpm --filter ./packages/lyntty-relay test` — 14 files / 93 tests passed.
- `pnpm --filter ./packages/lyntty-wire test` — 2 files / 19 tests passed.
- `pnpm --filter ./packages/lyntty-agent test` — 9 files / 227 tests passed.
- `pnpm --filter ./packages/lyntty-relay typecheck` — passed.
- `pnpm --filter ./packages/lyntty-wire build` — passed.
- `pnpm --filter ./packages/lyntty-agent typecheck` — passed.
- `git diff --check` — passed.

Focused checks also passed for the new echo/status behavior:

- `pnpm --filter ./packages/lyntty-app test -- sources/sync/syncRemoteCommandState.test.ts sources/components/userMessagePresentation.test.ts`
- Reviewer reran focused app/CLI checks for reducer/user presentation/Pi extension/mirror paths and found no remaining blocker after the `/goal`/`/context` stuck-label fix.

## Release-style APK / isolated E2E

Artifacts under `docs/evidence/artifacts/r57-mobile-send-echo-merge/`.

Setup:

- Built release-style APK with `EXPO_PUBLIC_LYNTTY_SERVER_URL=http://10.0.2.2:3015`:
  - `packages/lyntty-app/android/app/build/outputs/apk/release/app-release.apk`
  - `assembleRelease` passed (`assemble-release-final.log`).
- Started isolated relay on `127.0.0.1:3015` with temporary `LYNTTY_HOME_DIR`.
- Installed APK on emulator `emulator-5554`.
- Created a fresh app account via Maestro first-run flow.
- Authenticated a temporary node through terminal deep link pairing; pairing URLs were redacted in artifacts.
- Installed the generated Lyntty Pi extension only into a temporary `HOME` and started an ordinary tmux `pi` with `--no-extensions --extension <temp-extension> --session-dir <temp-session-dir>`.

Validated path:

- Opened the ordinary Pi session from Sessions Home by id `019f3370-7aac-7b3c-a98f-f69d26c25b6e`.
- Sent from the phone: `Please reply exactly R57_ECHO_OK_020220`.
- Maestro flow passed and waited for `R57_ECHO_OK_020220` in Session Remote (`03_mobile_send_echo_by_id.log`).
- Tmux Pi pane captured the clean prompt text and reply (`pi-tmux-after-send.txt`) with no `[lyntty]` prompt prefix.
- UI XML after send contained the prompt once and the reply once; there was no joined duplicate token and no `• •` placeholder (`post-send-ui.xml`).

## Artifact hygiene

- Pairing URLs were redacted to `lyntty://terminal?<redacted-public-key>`.
- Sensitive scan over R57 artifacts found no unredacted pairing URLs, `dataEncryptionKey`, `piExtensionToken`, or bearer tokens.
- Isolated relay/daemon/tmux Pi session were stopped; `ports-after-cleanup.txt` shows no listener on `:3015`.

## Known limitations / not run

- Physical phone validation was not run; release-style emulator APK was used.
- The isolated `pi -p` print-mode smoke could not run because the temporary HOME had no provider API key; interactive tmux `pi` with the isolated extension was used for the E2E send path instead.
- Existing live Pi sessions still need manual `/reload` or restart to pick up any future installed extension changes; this R57 validation did not touch the live global extension.
