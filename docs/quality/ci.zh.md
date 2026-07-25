# CI（中文同步说明）

日期：2026-07-26
状态：当前 Bun-only 门禁

## PR / main 快速门禁

`.github/workflows/typecheck.yml` 保持既有 required context 名称。PR 会执行 frozen install、lifecycle trust、release contract、Wire、CLI/daemon、Relay、App、隔离开发和五目标 CLI artifact smoke。

Required `Lyntty CI / Repo hygiene` 还会安装独立的 `docs/.site` lockfile，并在每个 PR 上运行：

```bash
bun run --cwd docs/.site docs:audit
bun run --cwd docs/.site docs:check
bun run --cwd docs/.site docs:build
```

该门禁不按 changed path 跳过。它会验证独立 docs 依赖图、manifest 生成页面、EN/ZH counterpart、内部链接、anchor、Pages base path、global 404、raw Markdown 和完整静态导出；root dependency audit 由独立的 required `wire` job 执行。失败会直接令对应 required context 失败，不使用 `continue-on-error`。

`.github/workflows/docs.yml` 的自动部署只由 main 上的匹配 push 触发，同时保留 `workflow_dispatch` 手动部署。除 `docs/**` 外，它还监听站点 manifest 发布的根级 SECURITY、PRIVACY 和 CONTRIBUTING 双语文件。域名和 `/lyntty` base path 不变。

## 依赖维护与静态分析

Dependabot 每周检查三个有限目标：根目录 Bun 依赖、独立 docs Bun lockfile，以及 SHA-pinned GitHub Actions。每个目标单独合并 minor/patch update，更新时间错开，允许打开的 version-update PR 不超过三个。Dependabot 不会自动合并；CODEOWNERS 会把这些文件路由给 owner，所有合并仍受普通 required checks 约束。

`.github/workflows/codeql.yml` 在 PR、main push、每周 schedule 和手动 dispatch 上运行 SHA-pinned CodeQL JavaScript/TypeScript baseline。它使用 `build-mode: none`，不会替代 package test。在第一次外部运行完成 triage 和人工分流前，该 context 保持非 required；是否加入 main ruleset 需要后续单独决定。

## 本地命令

- `bun run ci:fast`：仓库 hardening、audit、四个 workspace、隔离开发 lifecycle 与 `git diff --check`。
- `bun run ci:wire`、`bun run ci:cli`、`bun run ci:relay`、`bun run ci:app`：各 workspace 门禁。
- `bun run ci:dev`：隔离开发 lifecycle 与 ownership 安全检查。
- `bun run --cwd docs/.site docs:audit`：审计独立 docs 依赖图。
- `bun run --cwd docs/.site docs:check`：生成并 typecheck Fumadocs 页面。
- `bun run --cwd docs/.site docs:build`：导出并校验页面、链接、anchor、locale、base path 与 404。
- `bun install --frozen-lockfile` 与 `bun pm untrusted`：证明 lockfile 完整且 lifecycle script trust 为零阻塞；root 与 docs audit 分别覆盖两个独立 lockfile。

Android release-style APK、Maestro、实体设备、Pages 部署和完整 E2E 不属于上述快速门禁，必须按对应 release/evidence 流程单独验证。
