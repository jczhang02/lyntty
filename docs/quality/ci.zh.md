# CI（中文同步说明）

日期：2026-07-26
状态：当前 Bun-only 门禁

## PR / main 快速门禁

`.github/workflows/typecheck.yml` 保持既有 required context 名称。PR 会执行 frozen install、lifecycle trust、release contract、Wire、CLI/daemon、Relay、App、隔离开发和五目标 CLI artifact smoke。

Required `Lyntty CI / Repo hygiene` 还会安装独立的 `docs/.site` lockfile，并在每个 PR 上运行：

```bash
bun run --cwd docs/.site docs:check
bun run --cwd docs/.site docs:build
```

该门禁不按 changed path 跳过。它会验证 manifest 生成页面、EN/ZH counterpart、内部链接、anchor、Pages base path、global 404、raw Markdown 和完整静态导出。失败会直接令 required `Repo hygiene` 失败，不使用 `continue-on-error`。

`.github/workflows/docs.yml` 的自动部署只由 main 上的匹配 push 触发，同时保留 `workflow_dispatch` 手动部署。除 `docs/**` 外，它还监听站点 manifest 发布的根级 SECURITY、PRIVACY 和 CONTRIBUTING 双语文件。域名和 `/lyntty` base path 不变。

## 本地命令

- `bun run ci:fast`：仓库 hardening、audit、四个 workspace、隔离开发 lifecycle 与 `git diff --check`。
- `bun run ci:wire`、`bun run ci:cli`、`bun run ci:relay`、`bun run ci:app`：各 workspace 门禁。
- `bun run ci:dev`：隔离开发 lifecycle 与 ownership 安全检查。
- `bun run --cwd docs/.site docs:check`：生成并 typecheck Fumadocs 页面。
- `bun run --cwd docs/.site docs:build`：导出并校验页面、链接、anchor、locale、base path 与 404。
- `bun install --frozen-lockfile` 与 `bun pm untrusted`：证明 lockfile 完整且 lifecycle script trust 为零阻塞。

Android release-style APK、Maestro、实体设备、Pages 部署和完整 E2E 不属于上述快速门禁，必须按对应 release/evidence 流程单独验证。
