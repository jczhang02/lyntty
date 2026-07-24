# Lyntty Docs

Lyntty is built from Happy's mobile-control foundation and narrows it to an Android-first, self-hosted, `pi`-only product.

## Current product and operations

Read current sources in this order as needed:

- Repository context map: `../CONTEXT-MAP.md`
- Product context: `contexts/product/CONTEXT.md` / `contexts/product/CONTEXT.zh.md`
- Current product requirements: `prds/lyntty-product.md` / `prds/lyntty-product.zh.md`
- Pi shared-control architecture: `architecture/pi-shared-control.md`
- Development runbook: `development.md` / `development.zh.md`
- Relay deployment: `deploy/relay-vps.md` / `deploy/relay-vps.zh.md`
- Android release runbook: `release/android-apk.md` / `release/android-apk.zh.md`
- CLI release runbook: `release/cli.md` / `release/cli.zh.md`
- Compatibility BOM: `release/compatibility-bom.md` / `release/compatibility-bom.zh.md`
- CI quality gates: `quality/ci.md` / `quality/ci.zh.md`

## Historical migration records

- `roadmap.md`, `roadmap.zh.md`, and `roadmap.lyntty.md` are completed migration plans.
- `research/` contains dated background and upstream investigations.
- `recovered/` preserves imported decisions.
- `evidence/` proves point-in-time observations and operations; it is not current product policy.

Historical age or lack of navigation is not sufficient reason to delete a record. Use current contexts, accepted architecture, runbooks, code, and tests when a historical claim conflicts.

## Documentation infrastructure

- `agents/` defines issue, label, and domain-document conventions.
- `.site/` contains the Fumadocs presentation layer.
- Documentation editing rules live in [`AGENTS.md`](AGENTS.md).

Non-Lyntty/Happy product documentation belongs in research, evidence, or an explicit archive note, not current product docs.
