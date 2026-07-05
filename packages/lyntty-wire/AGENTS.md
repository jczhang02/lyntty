# Lyntty Wire Agent Instructions

This package defines shared protocol/schema boundaries used by app, relay, and CLI.

## Rules

- Treat schemas as cross-package contracts. Coordinate app/CLI/relay changes in the same commit or document staged compatibility.
- Match relay payload caps and app parsing behavior.
- Preserve backward-compatible reads when possible; reject unsafe oversized or malformed writes.
- Session-protocol visible agent events need stable ids and turn ids.
- Tool-call end envelopes may carry result/error payloads; app rendering should not need raw payload text fallbacks.
- Do not add Happy/Claude-specific schema concepts to new Lyntty protocol unless required for legacy read compatibility.

## Verification

```bash
pnpm --filter ./packages/lyntty-wire test
pnpm --filter ./packages/lyntty-wire build
```

Run app/CLI/relay focused tests too when schema changes affect runtime behavior.
