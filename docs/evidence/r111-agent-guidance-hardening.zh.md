# R111 — 跨 Agent 仓库指南加固

日期：2026-07-23

状态：已实现、测试、独立复核，并以 Good OpenPGP signature 本地提交

## 参考与目标

本轮将 Lyntty 与 `tw93/Mole` 在 Mole `main` 提交 `17683e1ac501b80456c37b23b2895398c1fe6380` 上的 `AGENTS.md` 对比，参考文件 SHA-256 为 `414bcb76613d49ee53f062fe46e7079319e4ff21f1b13e13b6f386e4fdde7d33`。Mole 只提供可借鉴的结构模式，不是要复制到 Lyntty 的产品政策。

Lyntty 保留 Android-first、Pi-only、自托管契约、`.agents/skills/` canonical 方向、Beads/证据流程、受保护 main 规则和 live Pi 隔离要求。没有加入未经验证的 Mole `AGENTS.local.md` 约定、macOS Shell 规则或累计事故日志。

## 已实现的指南

- 根 `AGENTS.md` 现在明确为全仓库契约，并要求编辑子树前读取最近的嵌套 `AGENTS.md`。嵌套规则可以增加局部约束，但不能削弱根级安全、权限、Git、产品、发布或验证要求。
- 现行权威与时点资料已分离。根/嵌套指南、当前 context、已接受的 architecture/runbook 和当前代码/测试属于 normative；`docs/research/` 是历史背景，`docs/evidence/` 只证明记录 revision 上的观察。
- 新增五问 Lyntty 产品过滤器，检查 Android/本机 Pi 价值、`phone -> relay -> lynttyd -> Pi extension -> pi` 边界、单一 active runtime 与 canonical Pi JSONL、APK surface 纪律以及真实路径验证。
- GitHub issue/PR 操作现在要求重新读取线上对象、使用作者语言、验证 shipped state，并为每个公开 mutation 取得当前任务的精确授权。
- 根验证文案现在依据真实 scripts 描述 `ci:fast`。它包含隔离的 compiled Relay health/shutdown smoke，但不包含 daemon integration、docs gates、APK/Maestro、实体设备、部署 Relay 或 App/daemon/Relay 端到端验证。
- App、CLI、Relay、Wire 指南区分开发期 focused checks 与 package claim gates。CLI 指南单独说明 `ci:daemon-integration` 是 compiled `lyntty`/`lynttyd` 加 standalone Relay 的集成门禁。
- `docs/AGENTS.md` 要求已有 EN/ZH 配对同步，并要求新增长期用户可见指南成对；同时不再假装每个历史 singleton 或既有 normative singleton 的小修都必须补齐翻译。指南也记录了 `docs:check` 与 `docs:build` 的升级条件。

## Release 删除契约

根指南与 canonical `release-flow` 现在把任何既有 GitHub Release 删除归类为 release mutation。流程要求：

- 针对每个精确 tag 取得当前任务授权；
- 明确说明 Release 对象及附属 assets 会被删除；
- Git tag 删除需要单独授权，默认保留 tags；
- 检查当前 retention、Latest、update manifest、固定下载 URL、runbook 和 evidence；
- 完整保存目标和保留渠道的删除前快照；
- Release 删除只能执行 `gh release delete "$tag" --repo jczhang02/lyntty --yes`；
- 未获得单独 tag 授权时禁止 `--cleanup-tag`；
- 删除后按 tag、numeric Release ID 和原 asset ID 检查 404；
- 要求保留 tags、当前 Releases、asset tuples 与 Latest 结构完全相同；
- 归档持久证据和下游 URL 影响。

Expo Dev 明确适用删除/cleanup 保护；`release-notes` 明确不能创建或删除 Release，并把删除操作转交 `release-flow`。没有修改 publication workflow 或 release script。

## 回归测试

新增 `scripts/agent-guidance.test.mjs` 并接入 `test:repo-hardening`。测试读取根和嵌套指南以及真实的 root、CLI、Relay、docs-site package scripts。既有 release-agent 测试新增精确 tag、asset loss、tag authority、Expo Dev、snapshot、404 和保留状态断言。

TDD 过程：

```text
bun test scripts/agent-guidance.test.mjs scripts/release-agent-rules.test.mjs
初始契约：3 pass, 6 fail（实现前预期失败）
最终契约：9 pass, 0 fail
```

最终检查：

```text
bun run test:repo-hardening
46 pass, 0 fail

bun run ci:fast
PASS

bun run ci:daemon-integration
compiled CLI/lynttyd daemon integration passed

cd docs/.site
bun install --frozen-lockfile
bun run docs:check
PASS

bun pm untrusted
0 untrusted dependencies with scripts

git diff --check
PASS
```

隔离 worktree 首次执行 `docs:check` 时，由于 docs-site 依赖尚未安装，无法解析 `fumadocs-mdx`。随后在 `docs/.site` 使用 `bun install --frozen-lockfile` 从锁文件安装 376 个 packages，环境问题解决；lockfile 和 tracked dependency state 均未变化。

## 独立复核

第一轮实现复核发现两个 blocker：

1. CLI 指南错误声称 `ci:cli` 会编译两个 native executables。
2. Expo Dev 的一条 scope 文案漏掉 deletion/cleanup。

两项均已修正，测试也改为约束真实 package scripts。后续复核又发现 `ci:fast` 文案错误暗示不存在 Relay runtime smoke；根指南和测试随后明确了隔离 compiled Relay smoke，并区分部署及端到端验证。最终独立结论：`PASS`，没有剩余具体问题。

## 提交

- 政策与测试：`63ee62ba2838fe8223ccf79b1cc6e832ef6539d8`
- Tree：`99b19c58127ba44d90b3df56c694b701f57ee37e`
- Subject：`docs(agent): harden repository guidance`
- OpenPGP key：`BABC6A51B0F43016329922DE1F863CBFD6EDCA6B`
- 验证：Good signature

## 未执行与剩余风险

- 没有运行 `docs:build`，因为本轮没有修改站点配置、渲染组件、生成导航或 build output；`docs:check` 已覆盖文档契约变化。
- 没有运行 APK、Maestro、实体设备或部署服务验证，因为没有修改产品/runtime code。
- 没有 dispatch workflow，也没有 GitHub issue/PR mutation、Release mutation、push 或 PR creation。
- 没有在单独 live session 中观察 nested `AGENTS.md` 自动发现。根指南现在要求 agent 主动读取最近文件，静态测试绑定全部现有嵌套指南，但 client-specific loader 行为仍不受仓库控制。
- 历史 research 刻意保持原样，仍可能包含旧名称；它们现在被明确标记为 non-normative，而不是被静默重写。
