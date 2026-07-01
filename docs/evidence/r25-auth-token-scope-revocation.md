# R25 Auth token scope and revocation hardening

Date: 2026-07-02
Task: `lyntty-1ct` — Harden auth token scope and revocation.

## Problem

Security review found that Lyntty relay bearer tokens were persistent and broad:

- `auth.invalidateToken()` and `auth.invalidateUserTokens()` only removed entries from an in-process cache.
- On cache miss, the same signed privacy-kit token could verify again, so revocation did not survive cache expiry, process restart, or multi-process deployment.
- Token payloads had no Lyntty-managed `jti`, expiry, or account token version.
- Socket authentication ignored token extras/scope, so any valid account token could request any socket client type.

## Fix

- Added Prisma persistence for token revocation state:
  - `Account.tokenVersion Int @default(0)` for account-wide revocation.
  - `RevokedAuthToken` keyed by `jti` for exact-token revocation.
- Hardened `AuthModule` tokens:
  - new tokens include `jti`, `iat`, `exp`, `tokenVersion`, and `extras.allowedClientTypes`,
  - `verifyToken()` rejects expired tokens, malformed payloads, revoked token ids, and stale account token versions,
  - cache hits re-check persistent token state rather than bypassing revocation,
  - `invalidateUserTokens()` increments `Account.tokenVersion`,
  - `invalidateToken()` persists the token `jti` until token expiry.
- Scoped issued tokens by flow:
  - app/account tokens: `['user-scoped']`,
  - terminal/CLI tokens: `['machine-scoped', 'session-scoped']`.
- Socket auth now rejects a requested `clientType` not present in token `extras.allowedClientTypes` and stores `authExtras` on `socket.data` for downstream auditing.
- HTTP bearer middleware now forwards `request.authExtras` alongside `request.userId`.

## Verification

```text
pnpm --filter ./packages/lyntty-relay run generate
pnpm --filter ./packages/lyntty-relay run typecheck
pnpm --filter ./packages/lyntty-relay test
# 11 files, 83 tests passed
```

Focused new regression coverage in `sources/app/auth/auth.test.ts`:

- expiring versioned token creation with client scopes,
- malformed payload rejection,
- account token-version revocation,
- exact-token `jti` revocation,
- persisted `invalidateToken()` upsert,
- persisted `invalidateUserTokens()` version bump,
- token client-type scope helper.

## Remaining limitations

- Already-connected sockets are not forcibly disconnected when their token is later revoked; the revocation is enforced on subsequent authentication/connection attempts.
- REST routes receive `authExtras`, but most route-level handlers still authorize by account ownership rather than fine-grained token scopes.
- Machine/session handler method-level scope tightening remains a separate follow-up if stricter per-socket mutation boundaries are desired.
