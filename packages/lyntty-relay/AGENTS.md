# Lyntty Relay Agent Instructions

This package is the self-hosted relay API/socket server. It routes encrypted sync/RPC traffic between mobile clients and `lynttyd`, but it is not canonical Pi history.

## Product boundary

- Keep relay and `lynttyd` logically separate deployables even when local development starts both together.
- Relay should preserve core encrypted sync/RPC capabilities: auth, pairing, machine presence, session messages, artifacts, attachments, access keys, KV/settings, and push routing.
- Do not restore Happy SaaS/community/feed/friends/voice/vendor-token/analytics product surfaces.
- Naming in new code/docs should use Lyntty terms: relay, node/machine, session, `lynttyd`, `pi`.

## Security rules

- Bind socket operations to authenticated resource scope:
  - session-scoped sockets may operate only on their authenticated session;
  - machine-scoped sockets may operate only on their authenticated machine;
  - user-scoped sockets need explicit allowlists for any session/machine RPC.
- Do not expose generic shell/file methods through machine-scoped RPC.
- Enforce payload caps for REST, socket events, RPC params/responses, artifacts, and session-protocol messages.
- Same `localId` idempotency must conflict on changed encrypted content; do not silently accept divergent payloads.
- Auth requests must expire/consume safely and avoid cross-account rebinding.
- Token logs, request headers, pairing URLs, encryption keys, and auth public keys must be redacted.
- Machine offline/presence updates must avoid stale socket disconnect races.

## Data and migrations

- PGlite is used for self-hosted local relay data; default data can become unopenable. Keep recovery guidance actionable and non-destructive unless user approves.
- Migrations must be deterministic and testable. Avoid schema changes for app-only behavior unless justified.
- Relay session metadata may cache Pi state, but Pi JSONL on the node remains canonical history.

## Socket/RPC behavior

- v3 session message posts should bump parent session recency/activity where appropriate.
- Machine active state should persist on connect/keepalive and clear on graceful daemon offline when no other socket owns the machine.
- Access-key and artifact sockets are sensitive; keep resource scope checks explicit.
- Relay errors returned to clients should be actionable but not leak secrets.

## Tests

Preferred checks:

```bash
pnpm --filter ./packages/lyntty-relay test
pnpm --filter ./packages/lyntty-relay typecheck
```

Focus tests for socket authorization, payload caps, idempotency, auth request lifecycle, artifact conflict handling, and presence races.
