# R100 — 第二轮依赖安全公告

日期：2026-07-22

分支：`fix/dependency-advisories-2`

Bead：`lyntty-24v.4`

## 触发

受保护 PR #36 后重新执行 `bun audit`，发现三项新发布公告：

- `GHSA-8r6m-32jq-jx6q`（`fast-xml-parser`，high；重复 DOCTYPE 可重置 entity-expansion limit）；
- `GHSA-9mqv-5hh9-4cgg`（`@hono/node-server`，moderate；中止 WebSocket handshake 可导致 memory leak）；
- `GHSA-v2hh-gcrm-f6hx`（`fast-uri`，high；literal backslash authority confusion）。

在任何新部署重试前，该审计已阻止后续生产 Relay 诊断 PR。

## 修复

最小 root overrides 与 Bun lockfile 现在精确解析到：

- `@hono/node-server` `2.0.11`；
- `fast-uri` `3.1.4`（现有 major 上的修复版本）；
- `fast-xml-parser` `5.10.1`。

Hardening test 固定检查三项精确版本。未修改应用、发布或部署逻辑。

## 验证

- `bun run ci:fast`：通过；
- `bun run ci:audit`：`No vulnerabilities found`；
- `bun install --frozen-lockfile`：无变更；
- `bun pm untrusted`：`0`；
- resolved dependency inventory 精确为 `2.0.11`、`3.1.4`、`5.10.1`；
- `git diff --check`：通过。

## 残余风险

本证据只记录上述日期观测到的 registry advisory 状态。未来 advisory database 发生变化时必须重新审计，不能声称已由本结果覆盖。
