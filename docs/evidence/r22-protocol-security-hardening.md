# R22 Protocol Security Hardening

## Source

Read-only protocol/security review of mobile -> relay -> lynttyd -> Pi path reported high-confidence issues around machine RPC exposure and log redaction.

## Fixed in this slice

### Machine RPC no longer exposes session shell/file handlers

Changed:

- `packages/lyntty-cli/src/api/apiMachine.ts`
  - Removed `registerCommonHandlers()` from `ApiMachineClient`.
  - Machine RPC now registers only explicit node-control handlers such as spawn/resume/list/stop/fork helpers.
  - Session shell/file handlers remain session-scoped through `ApiSessionClient` and session encryption.

Regression:

- `packages/lyntty-cli/src/api/apiMachine.test.ts`
  - Asserts machine RPC construction does not register common shell/file handlers.

### Relay RPC scope guard

Changed:

- `packages/lyntty-relay/sources/app/api/socket/rpcHandler.ts`
  - Machine-scoped sockets may register only allowed machine-control methods for their own machine id.
  - Machine-scoped sockets cannot issue RPC calls.
  - User-scoped calls to UUID-machine `bash`, `readFile`, `writeFile`, `listDirectory`, `getDirectoryTree`, and `ripgrep` are denied.
  - Session-scoped sockets can register/call only their own session prefix.

Regression:

- `packages/lyntty-relay/sources/app/api/socket/rpcHandler.spec.ts`
  - Covers safe machine registration.
  - Covers denial of machine shell/file calls.
  - Covers session-scoped shell/file access only for own session.

### Secret-bearing logs reduced

Changed:

- `packages/lyntty-cli/src/api/apiMachine.ts`
  - Spawn RPC logs now record only boolean presence flags for token/environment/resume fields.
- `packages/lyntty-cli/src/ui/logger.ts`
  - `debugLargeJson()` now returns immediately when `DEBUG` is not set.
- `packages/lyntty-relay/sources/app/api/utils/enableAuthentication.ts`
  - Removed authorization header prefix logging.
- `packages/lyntty-relay/sources/app/api/utils/enableErrorHandlers.ts`
  - 404 logs no longer dump full request headers.

Regression:

- `packages/lyntty-cli/src/api/apiMachine.test.ts`
  - Asserts spawn logs do not include token values or provider-key-like environment values.

## Verification

```bash
pnpm --filter ./packages/lyntty-cli run typecheck
pnpm --filter ./packages/lyntty-cli exec vitest run src/api/apiMachine.test.ts
pnpm --filter ./packages/lyntty-relay run typecheck
pnpm --filter ./packages/lyntty-relay exec vitest run sources/app/api/socket/rpcHandler.spec.ts
pnpm --filter ./packages/lyntty-cli test -- --run
pnpm --filter ./packages/lyntty-relay test -- --run
git diff --check
```

Results:

- CLI targeted: 3 passed.
- Relay targeted: 4 passed.
- Full CLI suite: 82 files / 725 tests passed.
- Full relay suite: 10 files / 76 tests passed.
- `git diff --check` passed.

## Follow-ups kept in Beads

- `lyntty-1ct` — harden auth token scope and revocation.
- `lyntty-9o5` — payload caps plus deterministic idempotency for long Pi history/artifact imports.
- `lyntty-b8n` — active synthetic Pi row attach/takeover behavior.

## Known product impact

The old machine-level `bash` helper was used by worktree UI helpers. This is intentionally blocked at machine scope now; future worktree support should use narrow, purpose-built, validated machine RPC methods rather than generic shell/file access.
