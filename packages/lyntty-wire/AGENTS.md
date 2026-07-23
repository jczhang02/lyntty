# Lyntty Wire Agent Instructions

The root `AGENTS.md` applies here. This guide adds Wire-specific deltas and cannot weaken root safety, permission, product, release, or verification rules.

This package defines shared protocol/schema boundaries used by app, relay, and CLI.

## Rules

- Treat schemas as cross-package contracts. Coordinate app/CLI/relay changes in the same commit or document staged compatibility.
- Match relay payload caps and app parsing behavior.
- Preserve backward-compatible reads when possible; reject unsafe oversized or malformed writes.
- Session-protocol visible agent events need stable ids and turn ids.
- Tool-call end envelopes may carry result/error payloads; app rendering should not need raw payload text fallbacks.
- Do not add Happy/Claude-specific schema concepts to new Lyntty protocol unless required for legacy read compatibility.

## Verification tiers

Use focused development checks while iterating:

```bash
bun run --cwd packages/lyntty-wire test
bun run --cwd packages/lyntty-wire build
```

Before a commit or claim about the Wire package, run the package claim gate:

```bash
bun run ci:wire
```

When a schema change affects runtime behavior, run the affected App, CLI, and Relay claim gates in the same change. A passing Wire gate alone proves only the shared package contract, not consumer compatibility.
