# R12 Pi Reply Visibility E2E Smoke

## User-reported failure

Phone can pair with the computer and send messages through the relay. The computer-side `pi` runtime appears to receive the prompt, but the phone does not display `pi` replies.

## Root cause

`packages/lyntty-cli` sends Pi runtime replies as ACP messages with `provider: 'pi'`:

```ts
session.sendAgentMessage('pi', { type: 'message', message: ... })
```

`packages/lyntty-app/sources/sync/typesRaw.ts` accepted ACP providers only from the legacy set:

```ts
gemini | codex | claude | opencode
```

So relay-delivered Pi ACP messages failed raw-message validation and normalized to `null`. The app silently dropped them, which matches the phone-visible symptom.

## New E2E/regression smoke

Added:

- `packages/lyntty-app/sources/sync/piReplyVisibility.e2e.test.ts`
- `packages/lyntty-app/package.json` script `test:e2e:pi-reply`

The test constructs the relay-delivered raw message shape after decrypting sync payloads:

```ts
{
  role: 'agent',
  content: {
    type: 'acp',
    provider: 'pi',
    data: { type: 'message', message: 'hello from pi' }
  }
}
```

It asserts this normalizes into an app-visible agent text message. It also covers Pi tool-call visibility.

## Red evidence before fix

Command:

```bash
pnpm --filter ./packages/lyntty-app exec vitest run sources/sync/piReplyVisibility.e2e.test.ts
```

Observed failure:

```text
Unrecognized message type: message (id: server-msg-1)
Unrecognized message type: tool-call (id: server-msg-2)
expected null to match object
```

## Fix

Updated ACP provider schema in `packages/lyntty-app/sources/sync/typesRaw.ts` to accept:

```ts
gemini | codex | claude | opencode | openclaw | pi
```

## Verification

Commands:

```bash
pnpm --filter ./packages/lyntty-app run test:e2e:pi-reply
pnpm --filter ./packages/lyntty-cli exec vitest run src/pi/runPiPathSmoke.test.ts
pnpm --filter ./packages/lyntty-app exec vitest run sources/sync/piReplyVisibility.e2e.test.ts sources/sync/reviewEvidence.test.ts sources/utils/previewSecurity.test.ts sources/utils/notificationRouting.test.ts
pnpm --filter ./packages/lyntty-app run typecheck
```

Results:

- Pi reply visibility E2E smoke: 2 tests passed.
- CLI Pi command/event path smoke: 2 tests passed.
- App focused tests: 20 tests passed across 4 files.
- App typecheck passed.

## Remaining live validation

This fixes and locks the message parsing failure that explains missing phone replies. A physical/emulator UI live run should still be repeated to verify the full user flow with relay, `lynttyd`, and real Pi runtime active.
