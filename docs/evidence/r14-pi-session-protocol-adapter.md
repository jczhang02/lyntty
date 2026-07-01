# R14 Pi Session Protocol Adapter

## Decision

Pi runtime output should not continue through the ACP shim. Pi is now routed as a first-class Lyntty runtime path:

```text
Pi SDK event -> PiSessionProtocolMapper -> lyntty-wire SessionEnvelope -> relay -> app reducer/UI
```

The Pi path no longer emits `sendAgentMessage('pi', ...)` ACP messages.

## Changes

### CLI

- Added `packages/lyntty-cli/src/pi/runPiSessionProtocol.ts`.
  - Coalesces Pi SDK `text_delta` / `thinking_delta` into session-protocol `text` envelopes.
  - Emits `turn-start` / `turn-end` envelopes for agent lifecycle.
  - Emits `tool-call-start` / `tool-call-end` envelopes for Pi tool lifecycle.
  - Wraps status/local-only/error messages as session-protocol service-message turns.
- Updated `packages/lyntty-cli/src/pi/runPi.ts`.
  - Replaced `mapPiSessionEventToAgentMessages()` + `sendAgentMessage('pi', ...)` with `PiSessionProtocolMapper` + `sendSessionProtocolMessage()`.
- Removed the old Pi ACP mapper:
  - `packages/lyntty-cli/src/pi/runPiEvents.ts`
  - `packages/lyntty-cli/src/pi/runPiEvents.test.ts`
- Updated `packages/lyntty-cli/src/api/apiSession.ts`.
  - Removed `pi` from ACP provider types.

### App

- Updated `packages/lyntty-app/sources/sync/typesRaw.ts`.
  - Removed `pi` from ACP provider schema.
  - Pi replies are covered through `role: 'session'` / session envelope normalization.
- Updated `packages/lyntty-app/sources/sync/piReplyVisibility.e2e.test.ts`.
  - Regression now exercises relay-delivered session-protocol envelopes, not ACP Pi messages.
  - Covers text reply, tool start/end, and coalesced Pi output rendering as one readable reply.
- Removed the previous app-side streaming-delta coalescing workaround from the reducer because coalescing now happens at the Pi session-protocol adapter boundary.

## Guardrail scan

Command:

```bash
grep -R "runPiEvents\|mapPiSessionEventToAgentMessages\|sendAgentMessage('pi'\|provider: 'pi'" packages
```

Result: no active Pi ACP path remains. Remaining `| 'pi'` hits are runtime flavor metadata/daemon types, not ACP providers.

## Verification

Commands:

```bash
pnpm --filter ./packages/lyntty-cli exec vitest run src/pi/runPiSessionProtocol.test.ts src/pi/runPiPathSmoke.test.ts src/pi/runPiControl.test.ts src/pi/runPiFeatures.test.ts src/pi/runPiRecovery.test.ts
pnpm --filter ./packages/lyntty-app exec vitest run sources/sync/piReplyVisibility.e2e.test.ts sources/sync/reviewEvidence.test.ts sources/utils/previewSecurity.test.ts sources/utils/notificationRouting.test.ts
pnpm --filter ./packages/lyntty-cli run typecheck
pnpm --filter ./packages/lyntty-app run typecheck
```

Results:

- CLI Pi tests: 28 tests passed across 5 files.
- App focused tests: 21 tests passed across 4 files.
- `lyntty-cli` typecheck passed.
- `lyntty-app` typecheck passed.
- `git diff --check` passed.

## Manual retest notes

This changes CLI runtime code and app JS, but not native Android config.

Required after pulling this commit:

```bash
cd /home/jc/dev/lyntty
pnpm --filter ./packages/lyntty-cli run cli:install
```

Then restart:

1. `lyntty server`
2. active `lyntty` runtime process
3. Expo dev server with cache clear:

```bash
cd packages/lyntty-app
EXPO_PUBLIC_LYNTTY_SERVER_URL=http://<computer-ip>:3005 pnpm expo start --host lan -c
```

Phone APK reinstall is not required for this change.
