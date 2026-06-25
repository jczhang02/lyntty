# Domain Docs

How the engineering skills should consume this repo's domain documentation when exploring the codebase.

## Layout

This repo uses a multi-context domain-doc layout.

Expected structure:

```
/
├── CONTEXT-MAP.md
├── docs/adr/                          ← system-wide decisions
└── src/
    ├── <context>/
    │   ├── CONTEXT.md
    │   └── docs/adr/                  ← context-specific decisions
    └── <context>/
        ├── CONTEXT.md
        └── docs/adr/
```

`CONTEXT-MAP.md` at the repo root points to the relevant per-context `CONTEXT.md` files.

## Before exploring, read these

- **`CONTEXT-MAP.md`** at the repo root if it exists. Use it to find the context docs relevant to the task.
- **Relevant per-context `CONTEXT.md` files** listed by `CONTEXT-MAP.md`.
- **`docs/adr/`** for system-wide architectural decisions.
- **Context-scoped `docs/adr/` directories** where present.

If any of these files don't exist, proceed silently. Don't flag their absence; don't suggest creating them upfront. The domain-modeling flow creates them lazily when terms or decisions actually get resolved.

## Use the glossary's vocabulary

When your output names a domain concept in an issue title, refactor proposal, hypothesis, or test name, use the term as defined in the relevant `CONTEXT.md`. Don't drift to synonyms the glossary explicitly avoids.

If the concept you need isn't in the glossary yet, that's a signal: either you're inventing language the project doesn't use, or there's a real gap to note for domain modeling.

## Flag ADR conflicts

If your output contradicts an existing ADR, surface it explicitly rather than silently overriding:

> _Contradicts ADR-0007 (event-sourced orders) — but worth reopening because..._
