# R96 — Hono transitive security advisories

日期：2026-07-22

分支：`fix/hono-security-advisories`

Bead：`lyntty-24v.1`

## 触发

Relay environment recovery PR #32 运行期间，fresh advisory database 使 required PR CI 开始失败。`bun audit` 报告：

- `@hono/node-server <2.0.5`：`GHSA-frvp-7c67-39w9`；
- `hono <4.12.27`：`GHSA-xgm2-5f3f-mvvc`、`GHSA-hvrm-45r6-mjfj`、`GHSA-w62v-xxxg-mg59`；
- 后续本地 audit refresh 又识别 `fast-uri <3.1.3` 的 `GHSA-4c8g-83qw-93j6`。

依赖路径来自 Prisma、Pi SDK dependency tree、Fastify/AJV 和 lint tooling。本修复与 PR #32 隔离。

## 修复

不改变 workspace direct dependencies，只推进已有 root transitive overrides：

- `@hono/node-server`：`1.19.13 → 2.0.5`；
- `hono`：`4.12.25 → 4.12.27`；
- `fast-uri`：`3.1.2 → 3.1.3`。

`bun.lock` 只保留 patched resolutions；workflow-hardening regression test 同时锁定这三项和原有 `shell-quote` security override。

## 兼容性复核

由于不存在已修补的 1.x，`@hono/node-server` 必须跨 major。独立复核确认 Prisma 与 MCP transitive consumers 均解析到 `2.0.5`；其使用的 `serve` 与 `getRequestListener` API 保持兼容，direct runtime smoke 返回 HTTP 200。被移除的 `./vercel` export 未使用。Node 20 floor 不会给正式产品引入 Node runtime：仓库 artifacts 仍为 Bun-compiled/runtime-free，相关依赖路径在 Node 下本就要求 Node 20 semantics。

最终复核：`PASS`，无 P0/P1/P2。

## 验证

- `bun audit` / `bun run ci:audit`：no vulnerabilities found；
- `bun install --frozen-lockfile`：通过；
- `bun pm untrusted`：0 untrusted dependencies with scripts；
- `bun run ci:fast`：通过；
- focused override/lock regression：通过；
- `git diff --check`：通过。

## 残余风险

Root override 有意覆盖 `@prisma/dev` 的旧 exact dependency request。完整本地 generation/build/tests 与 API-level review 已通过；合并前仍以 protected Linux/macOS 和 artifact CI 为最终 integration authority。
