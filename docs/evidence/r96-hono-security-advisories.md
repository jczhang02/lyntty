# R96 — Hono transitive security advisories

Date: 2026-07-22

Branch: `fix/hono-security-advisories`

Bead: `lyntty-24v.1`

## Trigger

Required PR CI began failing on a fresh advisory database while Relay environment recovery PR #32 was running. `bun audit` reported:

- `GHSA-frvp-7c67-39w9` in `@hono/node-server <2.0.5`;
- `GHSA-xgm2-5f3f-mvvc`, `GHSA-hvrm-45r6-mjfj`, and `GHSA-w62v-xxxg-mg59` in `hono <4.12.27`;
- `GHSA-4c8g-83qw-93j6` in `fast-uri <3.1.3` on the subsequent local audit refresh.

The paths were transitive through Prisma, the Pi SDK dependency tree, Fastify/AJV, and lint tooling. This change is isolated from PR #32.

## Fix

The existing root transitive overrides were advanced without changing direct workspace dependencies:

- `@hono/node-server`: `1.19.13 → 2.0.5`;
- `hono`: `4.12.25 → 4.12.27`;
- `fast-uri`: `3.1.2 → 3.1.3`.

`bun.lock` contains only the patched resolutions. The workflow-hardening regression test now pins all three plus the prior `shell-quote` security override.

## Compatibility review

The `@hono/node-server` fix crosses a major-version boundary because no patched 1.x release exists. Independent review verified that the transitive Prisma and MCP consumers resolve to `2.0.5`; their used `serve` and `getRequestListener` APIs remain compatible and direct runtime smokes returned HTTP 200. The removed `./vercel` export is unused. Its Node 20 floor does not add a production runtime dependency: repository artifacts remain Bun-compiled/runtime-free, and the relevant dependency paths already require Node 20 semantics when used under Node.

Final review: `PASS`, no P0/P1/P2.

## Verification

- `bun audit` / `bun run ci:audit`: no vulnerabilities found;
- `bun install --frozen-lockfile`: pass;
- `bun pm untrusted`: 0 untrusted dependencies with scripts;
- `bun run ci:fast`: pass;
- focused override/lock regression: pass;
- `git diff --check`: pass.

## Residual risk

The root override intentionally supersedes `@prisma/dev`'s older exact dependency request. Full local generation/build/tests and API-level review pass; protected Linux/macOS and artifact CI remain the integration authority before merge.
