# R13 Pi Streaming Reply Coalescing

## User-reported failure

A phone screenshot showed Pi agent output rendered as fragmented lines, for example path text split across many separate visible messages. This means the reply reached the phone, but each Pi streaming `text_delta` was rendered as an independent agent message.

## Root cause

`packages/lyntty-cli/src/pi/runPiEvents.ts` mapped Pi SDK `message_update` events directly to ACP messages:

```ts
{ type: 'message', message: delta }
```

The relay/app path then stored each delta as its own message. `packages/lyntty-app` normalized and reduced these as separate `agent-text` messages, so the mobile UI displayed fragmented output.

## Fix

- `packages/lyntty-cli/src/pi/runPiEvents.ts`
  - Mark Pi `text_delta` and `thinking_delta` ACP messages with `streaming: true`.
- `packages/lyntty-cli/src/api/apiSession.ts`
  - Extend `ACPMessageData` message/reasoning/thinking variants with optional `streaming`.
- `packages/lyntty-app/sources/sync/typesRaw.ts`
  - Preserve ACP `streaming` through raw-message validation and normalization.
- `packages/lyntty-app/sources/sync/reducer/reducer.ts`
  - Coalesce consecutive streaming text/thinking deltas into the current streaming agent message instead of creating one visible message per delta.
- `packages/lyntty-app/sources/sync/piReplyVisibility.e2e.test.ts`
  - Add regression coverage for Pi streaming deltas: `当前` + `目录` + `是 /home/jc/dev/lyntty` renders as one readable agent reply.

## Red evidence

Before the reducer fix, the regression test failed:

```text
expected [...] to have a length of 1 but got 3
```

This matches the screenshot symptom: one Pi reply displayed as multiple fragments.

## Verification

Commands:

```bash
pnpm --filter ./packages/lyntty-app run test:e2e:pi-reply
pnpm --filter ./packages/lyntty-cli exec vitest run src/pi/runPiEvents.test.ts src/pi/runPiPathSmoke.test.ts
pnpm --filter ./packages/lyntty-app run typecheck
pnpm --filter ./packages/lyntty-cli run typecheck
```

Results:

- App Pi reply E2E smoke: 3 tests passed.
- CLI Pi event/path tests: 6 tests passed.
- `lyntty-app` typecheck passed.
- `lyntty-cli` typecheck passed.

## Manual retest notes

This change touches both CLI and app JS. To manually verify with a phone/dev-client APK:

1. Reinstall/relink local CLI so `lyntty` sends `streaming: true`:

```bash
pnpm --filter ./packages/lyntty-cli run cli:install
```

2. Restart `lyntty server` and the `lyntty` runtime process.
3. Restart or reload Expo with cache clear:

```bash
cd packages/lyntty-app
EXPO_PUBLIC_LYNTTY_SERVER_URL=http://<computer-ip>:3005 pnpm expo start --host lan -c
```

4. Phone app reloads from Expo. Reinstalling the APK is not required unless native/config changed.
