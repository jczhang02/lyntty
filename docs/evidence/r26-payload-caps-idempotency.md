# R26 Payload caps and idempotent imports

Date: 2026-07-02
Task: `lyntty-9o5` — Add payload caps and idempotent history/artifact imports.

## Problem

Protocol/security review and pagination review found these remaining issues:

- Pi history replay generated stable `SessionEnvelope.id` values, but `ApiSessionClient` wrapped every encrypted relay post with a random `localId`; reopening/importing the same Pi JSONL history could duplicate relay messages because relay dedupe is `sessionId + localId` based.
- `/v3/sessions/:sessionId/messages` capped batch count but not encrypted message string size or `localId` size.
- RPC calls/responses over Socket.IO had no string payload cap, so huge encrypted params or daemon responses could be forwarded through relay.
- Artifact create was idempotent by id only. Same-account id reuse with different encrypted header/body/key returned the existing artifact as if it matched.
- Artifact REST/socket payload fields were not size-capped.

## Fix

- CLI history/session-protocol idempotency:
  - `ApiSessionClient.enqueueMessage()` now accepts an optional `localId`.
  - session-protocol envelopes use deterministic `localId: session:<envelope.id>`.
  - Pi history envelope ids are already deterministic, so replaying the same imported history now maps to the same relay dedupe keys.
- Relay v3 message caps:
  - encrypted content max: `1_000_000` chars per message,
  - `localId` max: `240` chars,
  - existing batch max of 100 remains.
- Relay RPC caps:
  - request param string max: `1_000_000` chars,
  - response string max: `2_000_000` chars,
  - oversize requests/responses return explicit RPC errors rather than being forwarded.
- Artifact REST hardening:
  - create/update base64 field max: `5_000_000` chars,
  - same-account artifact id reuse compares decoded header/body/dataEncryptionKey bytes,
  - identical payload remains idempotent,
  - different payload now returns 409 conflict.
- Artifact socket hardening:
  - create/update base64 fields use the same 5M cap,
  - same-account id reuse rejects different encrypted content instead of silently returning the old artifact.

## Verification

```text
pnpm --filter ./packages/lyntty-cli run typecheck
pnpm --filter ./packages/lyntty-cli exec vitest run src/api/apiSession.test.ts
# 1 file, 28 tests passed

pnpm --filter ./packages/lyntty-relay run typecheck
pnpm --filter ./packages/lyntty-relay exec vitest run \
  sources/app/api/routes/v3SessionRoutes.test.ts \
  sources/app/api/routes/artifactsRoutes.test.ts \
  sources/app/api/socket/rpcHandler.spec.ts \
  sources/app/api/socket/artifactUpdateHandler.spec.ts
# 4 files, 19 tests passed

pnpm --filter ./packages/lyntty-relay test
# 13 files, 88 tests passed
```

## Regression coverage added

- CLI session protocol posts use deterministic `localId` from envelope id.
- v3 message route rejects oversized encrypted content and oversized localId.
- artifact create returns existing only for identical payloads and 409s on same-id different encrypted content.
- artifact create rejects oversized fields.
- RPC helper detects oversized request/response strings.
- socket artifact helper detects oversized base64 fields.

## Remaining limitations

- v3 message GET responses remain bounded by page size and stored per-message caps, but there is no aggregate response-byte budget yet.
- RPC caps currently apply to string wire payloads. Non-string payloads are not rejected here to avoid breaking existing internal compatibility.
- Artifact REST update still uses existing version-check flow; socket update already uses `updateMany` optimistic concurrency. A deeper REST atomicity refactor can be handled separately if needed.
