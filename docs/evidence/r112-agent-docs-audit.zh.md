# R112 — 多 Agent 指南与文档审计

日期：2026-07-24

状态：底层修改已实现、验证、独立复核，并以 Good OpenPGP signature 本地提交；本文是单独的最终证据文档单元

Bead：`lyntty-v9z`

## 范围

本任务要求多名独立 Agent 判断当前根级/嵌套 Agent 指南是否可靠，检查 tracked documentation 中过时或无用的内容，只删除有充分证据的安全候选，并在不 push、不创建 PR 的前提下留下可评审的本地分支。

审计范围包括：

- 根级与全部六个嵌套 `AGENTS.md`；
- canonical `release-flow` 与 `release-notes` skills；
- 清理前 230 个 tracked Markdown 文件，其中包括 165 份 evidence narrative；
- current contexts、PRD、architecture、release/deploy runbook、research、migration plan 与 docs-site generation；
- exact-path/code/config references 和 generated-site navigation；
- 这些文档引用的当前 App、CLI、Relay、Wire、workflow、package script 与 evidence truth。

## 多 Agent 复核

第一轮由五个只读 Agent 独立执行：

1. Agent 指南正确性与 command/claim-gate 审计。
2. current、historical、需修正和可删除文档分类。
3. Legacy Happy/Claude/Codex/Gemini/OpenClaw 与已移除 workspace 搜索。
4. Markdown/site graph、navigation、duplicate 与 broken-link 审计。
5. 针对 audit、release、security 和 migration 价值的保守保留审查。

第一轮 Agent 指南结论是 `FAIL`，没有为了通过而直接盖章。它发现了 `lyntty remote` 直连 Relay、native-signing staging、Expo Dev 一次性 publication、Android package identity、metadata-bound Release retry、version/target validation、stale current context 和 docs-site guide 未纳入测试等真实问题。

随后四个 post-change reviewer 分别检查 Agent rules、删除/保留边界、documentation graph/build 和 current product truth。它们继续推动修正 APK Preview metadata-bound retry、current acceptance wording、Relay R104 deployment state、hidden mobile context、`invoke_pi_command`、真实 App/Relay 技术栈、worktree opt-in 和未完成的 VPS restore validation。Agent harness 返回以下最终结论；raw reviewer transcripts 不是 tracked repository artifacts：

- Agent/release guidance reviewer：`PASS`。
- Documentation deletion/preservation reviewer：`PASS`。
- Documentation graph/build reviewer：`PASS`。
- Product truth 与 EN/ZH consistency reviewer：`PASS`。
- 独立 dependency-security reviewer：`PASS`。

## Agent 指南结果

当前指南现在：

- 区分唯一 node-side session bridge `lynttyd` 与直接连接 Relay 的 operator-facing `lyntty remote` control-plane client；
- 保持 Pi extension 只连接本机 `lynttyd`；
- 将 `native-signing-*` 分类为 operational staging，并禁止为它应用 curated product notes；
- 对未来 Expo Dev GitHub Release creation fail closed，同时保留现有 prerelease 的 audit/edit/delete 保护；
- 区分 `.dev`、`.preview` 和 production Android package identity；
- curated notes 前要求 originating publication 已成功完成，且没有 pending retry/Draft resume；
- 明确 curated title/body edit 会禁用所有适用的 metadata-bound audit/retry，包括 `scripts/github-release.ts` 和 APK Preview promotion；
- 只验证用户显式输入的 version 与 exact Release identity，不推断替代输入；
- 将 `docs/.site/AGENTS.md` 明确纳入 root inheritance 与静态测试。

## 删除决定

最终只删除三个 tracked 文件。

| 删除文件 | 证据 | 替代或影响 |
| --- | --- | --- |
| `CONTEXT-MAP.lyntty.md` | Blob `335094153560c57f5d1451317c96bfca57f56a48`，与 `CONTEXT-MAP.md` byte-identical；没有独立 consumer | 保留 canonical `CONTEXT-MAP.md` |
| `docs/contexts/product/CONTEXT.lyntty.md` | Blob `22297a1980e0b33a3d171d1841926a296d447f38`，与 `docs/contexts/product/CONTEXT.md` byte-identical；没有独立 consumer | 保留 canonical product context |
| `docs/research/agent-teams-claude-code-stuck-non-interactive.png` | Blob `06cf88e48d87c37e1eec11cae8a178db42ce9439`，123,545 bytes；清理前没有独立 consumer、owning narrative、结论或 Lyntty decision。最终 absence regression test 会有意写出被删除路径。 | 不需要替代 |

`docs/evidence/h0-lyntty-import.md` 保留原始 import observation，并为两个重复 snapshot 增加独立的 later-disposition 说明。

没有删除任何 unique roadmap、research record、release/deploy runbook、evidence narrative、release input、legal/store document 或 evidence artifact。审计明确拒绝把“历史较久”或“没有 inbound Markdown link”单独作为删除证据。删除阶段把 inventory 从 230 降为 228 个 tracked Markdown；加入本文 EN/ZH R112 evidence pair 后，final tree 回到 230 个。

## Current documentation 修正

- `CONTEXT-MAP.md` 与 product context 只指向当前存在的 current source。
- Current context/PRD 不再包含 `Review Evidence`、已移除 workspace、unknown-command raw fallback 或过时 initial milestone 声明。
- PRD 改为真实的 Fastify/Socket.IO/Prisma/PGlite 和 Expo Router/Zustand/MMKV，并明确 worktree 是 opt-in。
- Shared-control architecture 记录已实现的 R50、包含 `invoke_pi_command` 的 current strict commands、clean visible prompt、hidden mobile context、R57 echo merge 和当前 residual work。
- 已完成的 migration roadmap、research snapshot、fork plan 和 mobile-shell baseline 都有醒目的 historical/superseded header 与 current-source pointer。
- Bun standardization plan 标记为已完成，不再绑定已移除的 migration branch。
- Relay deployment runbook 指向 signed Stable sequence 1/R104，保留 R65 bootstrap history，加入 direct operator CLI topology，并区分已完成 deployment checks 与仍待执行的 VPS restore drill。
- Docs-site navigation 把 migration roadmap 标为 historical。

## 静态契约与 TDD

新增 `scripts/docs-currentness.test.mjs` 并接入 `test:repo-hardening`；既有 Agent 与 release tests 也得到扩展。

```text
初始 focused contract：
6 pass, 10 fail（实现前预期失败）

最终 focused contract：
16 pass, 0 fail

最终 repository hardening：
53 pass, 0 fail
```

加入 R112 pair 前，graph reviewer 扫描清理后的 228 个 tracked Markdown 文件，找到 31 个 relative Markdown destination，缺失 target 为 0。Generated-site audit 没有发现 missing route 或 same-page fragment target。Generated output 继续保持 ignored/untracked。

## Dependency audit blocker

第一次最终 `ci:fast` 运行到 `bun audit` 时，被刚发布的 `GHSA-c96f-x56v-gq3h` 阻断：

- package：`find-my-way`；
- severity：high；
- affected：`<= 9.6.0`；
- first patched：`9.7.0`；
- published：2026-07-23T19:33:15Z。

仓库经 Fastify 5.10.0 解析到 `find-my-way@9.6.0`。最小修复增加 exact `9.7.0` root override，更新 lockfile override table 与该 package resolution/integrity，并增加拒绝 9.6.0 的回归断言。Fastify 的 `^9.6.0` dependency 接受 9.7.0。

Dependency-resolution 修改后，ignored worktree 中的 stale symlink 一度仍解析到 9.6.0。执行 `bun install --frozen-lockfile --force` 刷新隔离 worktree 后，Fastify 实际 child 解析为 9.7.0；随后所有完整门禁均针对这些 bytes 重跑。独立 reviewer 也验证了 clean frozen install 与 Fastify/Relay smoke。

## 最终验证

以下结果在本隔离 worktree 中实际观察并记录于此；raw command logs 与 reviewer transcripts 没有作为独立 artifacts 提交。

```text
bun install --frozen-lockfile --force
Fastify 实际 child：find-my-way 9.7.0

bun run ci:fast
PASS
  repository hardening：53 pass
  Wire：36 pass
  CLI：585 pass
  Relay：119 pass
  App：819 pass，90 files / 3295 assertions
  development scripts：36 pass
  bun audit：No vulnerabilities found

bun run ci:daemon-integration
compiled CLI/lynttyd daemon integration passed

cd docs/.site
bun run docs:check
bun run docs:build
PASS；生成 19 个 Fumadocs source pages 与 24 个 static routes

bun pm untrusted
0 untrusted dependencies with scripts

git diff --check
PASS
```

Next build 因存在多个 lockfile 输出既有 workspace-root inference warning；compile、typecheck、static generation 和 raw Markdown generation 均成功完成。

## 提交

- Agent/release corrections：`4f65038204e1ded39ff64c3acd6f93b6f6b4f07b`
  - tree `37e3787f6743719a840529ca4f22040981501872`
- Documentation pruning/currentness：`47401e672f6c2161df3af60e535d46e48bbc4b47`
  - tree `4e16ce89c69d893ea497eaa97de4895e74ca7f25`
- Dependency audit fix：`663ae2c4f33d0ab632e3e763818e4528f2dd58e6`
  - tree `9ed8b62b2a18a9a3bb154a77730b2cf45fcd357c`
- Signing key：`BABC6A51B0F43016329922DE1F863CBFD6EDCA6B`
- Signature result：三个提交均为 Good

## 未执行与剩余风险

- 没有运行 APK、Maestro、实体手机、live Pi-extension install、production deploy、workflow dispatch、GitHub mutation、push 或 PR creation。产品/runtime code 未变化；dependency-only runtime change 已由 compiled Relay 与 daemon integration 覆盖。
- 没有穷举网络验证所有 external documentation URLs。
- Docs site 刻意只发布 19-page selected surface，而不是 final tree 中全部 230 个 tracked Markdown records。Source entry points 已标出 current runbooks；这是 information-architecture limitation，不是 broken-link condition。
- Historical body 会在明确 historical/superseded header 下保留时点 claim 与旧路径。
- Nested `AGENTS.md` 自动发现仍取决于 client；repository guidance 与静态测试已要求并绑定全部现有 nested guides。
