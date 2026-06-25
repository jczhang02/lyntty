# Context Map

This repo uses a multi-context domain-doc layout.

## Contexts

| Context | Purpose | Domain doc | Source docs |
| ------- | ------- | ---------- | ----------- |
| Product | Android-first remote control product model for local `pi` sessions | `docs/contexts/product/CONTEXT.md` | `docs/prds/lyntty-product.md`, `docs/recovered/previous-lyntty-decisions.md` |

## ADRs

- System-wide ADRs live in `docs/adr/`.
- Context-scoped ADRs live beside each context when present.

## Consumer rules

- Read this file first.
- Then read the context doc relevant to the task.
- Then read ADRs touching the area you will change.
- If a listed file is missing, proceed silently and use the closest available source doc.
