# Lyntty Agent Package Instructions

This package is retained from the Happy architecture as a local helper/auth/session package. It is not the product's primary Pi runtime bridge; `packages/lyntty-cli` owns `lynttyd`, Pi SDK, and Pi extension behavior.

## Rules

- Keep APIs generic and compatible with current relay/CLI expectations.
- Do not add new Happy/Claude product assumptions.
- Do not route around `lynttyd` for Pi control, relay auth, or extension IPC.
- Preserve encryption/auth test coverage when touching credentials or session helpers.

## Verification

```bash
pnpm --filter ./packages/lyntty-agent test
pnpm --filter ./packages/lyntty-agent typecheck
```
