# Lyntty Docs

Lyntty is an Android-first, self-hosted control surface for local [`pi`](https://github.com/earendil-works/pi) sessions. The App controls sessions on computers you own; Pi JSONL, tools, credentials, and workspaces remain on the paired node.

[简体中文](./README.zh.md)

## Start here

- [Getting started](./getting-started.md): install one compatible Stable set, deploy a `relay`, pair a node, and verify `Session Remote`.
- [FAQ](./faq.md): check product scope, trust boundaries, build channels, platform support, and update behavior.
- [Troubleshooting](./troubleshooting.md): resolve connection, daemon, Pi extension, history, APK, Metro, and version symptoms.
- [Security policy](../SECURITY.md): use the private process for vulnerabilities and redact public reports.
- [Privacy policy](../PRIVACY.md): understand what stays on the node and what a self-hosted `relay` handles.

## Current product and operations

Read current sources by task:

- Product boundary: [Product context](./contexts/product/CONTEXT.md) and [Product PRD](./prds/lyntty-product.md)
- Runtime topology: [Pi shared-control architecture](./architecture/pi-shared-control.md)
- Local development: [Development guide](./development.md)
- Self-hosting: [`relay` VPS deployment](./deploy/relay-vps.md)
- Android distribution: [Android APK release and update](./release/android-apk.md)
- Node artifacts: [CLI and daemon release](./release/cli.md)
- Compatibility and rollback: [Signed Compatibility BOM](./release/compatibility-bom.md)
- Required checks: [CI matrix](./quality/ci.md)
- Repository map: [`CONTEXT-MAP.md`](../CONTEXT-MAP.md)

The ordinary control path is:

```text
phone -> relay -> lynttyd -> local Pi extension -> pi
```

`lyntty remote` is a separate operator control-plane client. It may connect directly to the `relay`, but it is not the node-side bridge for phone delivery.

## Project and contribution

- [Contributing](../CONTRIBUTING.md)
- [Issue tracker conventions](./agents/issue-tracker.md)
- [Triage labels](./agents/triage-labels.md)
- [Domain-document conventions](./agents/domain.md)
- [Repository agent rules](../AGENTS.md)
- [Documentation agent rules](./AGENTS.md)

## Historical migration records

- `roadmap.md`, `roadmap.zh.md`, and `roadmap.lyntty.md` are completed migration plans.
- `research/` contains dated background and upstream investigations.
- `recovered/` preserves imported decisions.
- `evidence/` proves point-in-time observations and operations; it is not current product policy.

Historical age or lack of navigation is not sufficient reason to delete a record. Current contexts, accepted architecture, runbooks, code, and tests take precedence when a historical claim conflicts.

## Documentation infrastructure

`.site/` contains the Fumadocs presentation layer. Source-of-truth documents remain outside generated site directories. Documentation editing rules live in [`AGENTS.md`](./AGENTS.md).
