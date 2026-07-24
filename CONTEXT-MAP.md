# Context Map

Status: current repository context index

This repository uses a small domain-context map. Current policy and implementation truth are separate from historical research and point-in-time evidence.

## Contexts

| Context | Purpose | Domain doc | Current supporting docs |
| ------- | ------- | ---------- | ----------------------- |
| Product | Android-first remote control for local `pi` sessions | `docs/contexts/product/CONTEXT.md` | `docs/prds/lyntty-product.md`, `docs/architecture/pi-shared-control.md`, `docs/release/android-apk.md`, `docs/quality/ci.md` |

## ADRs

No accepted ADR directory is currently tracked. If an ADR is added, system-wide decisions belong under `docs/adr/` and context-scoped decisions may live beside their context.

## Consumer rules

1. Read the root and nearest nested `AGENTS.md` first.
2. Read the context relevant to the task.
3. Read the accepted architecture or operational runbook for the affected path.
4. Use current schemas, code, tests, workflows, and package scripts for implementation truth.
5. Treat `docs/research/` as historical background and `docs/evidence/` as point-in-time proof; neither silently overrides current policy.
