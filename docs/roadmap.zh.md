# Lyntty 历史迁移路线图

状态：2026-06-30 的迁移计划已完成。本文保留当时的 import 与 implementation order，其中的名称、workspace、UI 提案和缺口不再描述当前仓库。它是历史记录，不是当前 backlog 或 product contract。

当前行为以 `AGENTS.md`、`docs/contexts/product/CONTEXT.md`、`docs/architecture/pi-shared-control.md`、现行 runbook、代码和测试为准。下方原始路线图正文仅保留为迁移决策依据。

## 已确认边界

- 基础代码：Lyntty。
- 最终开发目录：当前仓库 `/home/jc/dev/lyntty`。
- 客户端范围：mobile only。
- 平台目标：Android-first；iOS best-effort，不作为验收目标。
- Runtime：只支持 `pi`。
- Claude Code：删除产品与运行时支持。
- 其他 agent：Codex / Gemini / OpenClaw 不进入产品范围。
- Server：Lyntty relay 只保留 Lyntty `relay` 需要的配对、presence、encrypted sync、WebSocket、machine RPC。
- 非 Lyntty 产品面全部删除：Lyntty SaaS、community/feed/social、voice、analytics、paid/usage product、browser client、多 agent UX。
- 可保留通用 provider seam，但产品里只有 `pi` 实现。

## 产品词汇

主线文档、UI、证据使用这些词：

- `pi`
- `lynttyd`
- `relay`
- `Sessions Home`
- `Node Management`
- `Session Remote`
- `Review Evidence`
- `active runtime`
- `activation lock`
- `history_gap`

避免把产品描述为：terminal mirror、remote desktop、task board、agent dashboard、project manager、web client、Lyntty SaaS。

## Roadmap 原则

1. 先 explore Lyntty 完整产品/功能边界，再决定删除。
2. Lyntty 的 mobile vibe 是资产；非 Lyntty 产品功能不是资产。
3. 先清理当前仓库 scaffold，再删除 Lyntty 中不需要的产品面。
4. 最后深度接入 `pi` 和 `pi` 可能有的功能/插件。
5. 历史 session 发现是前置风险，不能等到后期才发现架构不支持。
6. 每个阶段必须留下 evidence：命令、结果、not-run reason、剩余风险。
7. 不用 mock 宣称完成真实 runtime 能力。
8. `relay` 不是 canonical history；本地 `pi` 会话/节点侧记录才是恢复依据。
9. `Review Evidence` 在 `Session Remote` 内，不是单独主导航。

## R0 — Roadmap 与 Beads 追踪

目标：把 Lyntty-based Lyntty 的新顺序写清楚，并用 Beads 持久记录多会话工作。

范围：

- 明确选择 Lyntty 的原因：OSS mobile vibe 和现成远程控制骨架。
- 明确三段顺序：Explore Lyntty → 清理/删除 → Pi 完美支持。
- 为关键阶段创建 Beads issues，支持 compaction 后恢复。
- 停止旧 scaffold-first roadmap 继续驱动实现。

Exit criteria：

- 本 roadmap 存在并被接受。
- Beads 中有对应 roadmap issues。
- 旧 M0-M2 scaffold 被视为历史证据，不再视为最终产品代码。

## R1 — Explore Lyntty 完整产品和功能边界

目标：完整理解 Lyntty 当前产品、功能、代码边界，明确哪些是 Lyntty 要继承的 mobile vibe，哪些是要删除的非 Lyntty 产品。

范围：

- 产品地图：mobile app、web app、CLI、daemon、server、lyntty-agent、wire protocol。
- 功能地图：session 创建、machine pairing、presence、sync、RPC、artifacts、fork/resume、notifications、voice、community/feed、analytics、billing/usage、settings、agent defaults。
- UI 地图：mobile navigation、session screen、new session、machine screen、settings、connect flows、dev tools。
- Server 地图：auth/account、machine、session、message、artifact、KV、push、community/social、usage/analytics。
- Runtime 地图：Claude/Codex/Gemini/OpenClaw/ACP seams、process spawning、tmux、metadata、availability detection。
- 数据边界：哪些数据只在本机，哪些进 relay/server，哪些可作为 canonical recovery source。

Exit criteria：

- 写入 `docs/research/lyntty-product-boundary.md`。
- 每个功能标记：keep / delete / rewrite / unknown。
- 明确哪些功能服务 Lyntty mobile vibe。
- 明确删除前会破坏哪些依赖。

Non-goals：删除代码；接入 Pi。

## R2 — Lyntty 历史 session 发现风险专项

目标：验证 Lyntty 是否能发现历史 session；若不能，定位原因并设计 Lyntty 的 session discovery/recovery 模型。

背景：Lyntty 似乎无法发现历史 session。Lyntty 必须能恢复用户已存在或曾运行的 `pi` sessions，否则 `Sessions Home`、reconnect、`history_gap`、Review Evidence 都会受影响。

范围：

- 审计 Lyntty session 创建、resume、fork、metadata、server persistence、local daemon tracking、machine reconnect。
- 确认 Lyntty 是否只认识通过 Lyntty 创建/登记的 sessions。
- 确认 daemon 重启、machine 重连、server cache loss 后 session 列表如何恢复。
- 对比 Pi 的本地 session JSONL / session manager / session directory。
- 设计 Lyntty discovery：scan local Pi sessions、import/register、dedupe、stale marking、history proof、`history_gap`。

Exit criteria：

- 写入 `docs/research/lyntty-session-discovery.md`。
- 有结论：Lyntty 原生能否发现历史 session。
- 有 Lyntty session discovery 方案。
- R3/R6 之前明确必须保留或重写的 session metadata 字段。

Non-goals：完整实现 discovery。

## R3 — 清理当前仓库并导入 Lyntty base

目标：当前 `/home/jc/dev/lyntty` 变成 Lyntty-based monorepo，而不是旧 scaffold 或 sibling worktree 原型。

范围：

- preservation staging：保存 Lyntty 决策资产、上下文、evidence、Beads 状态。
- 删除旧 scaffold 产品代码：当前 `apps/`、`packages/`、旧 Bun/TS scaffold 配置。
- 导入已验证的 Lyntty-based worktree。
- 恢复 Lyntty docs/evidence。
- 保留 git/beads/agent context。

Exit criteria：

- 当前目录包含 Lyntty monorepo package layout。
- preserved docs/evidence 可读。
- package install/typecheck 基线跑通，或记录明确失败点。
- evidence 写入 `docs/evidence/`。

Non-goals：一次性删完所有非 Lyntty Lyntty 功能。

## R4 — 删除 Lyntty 中非 Lyntty 产品功能

目标：用户看到的是 Lyntty mobile 产品，不是 Lyntty。

范围：

- 删除/替换 Lyntty branding、Lyntty SaaS 文案、browser/web product 叙事。
- 删除 Claude Code connect flow、Claude 图标、Claude 文案、Claude runtime 产品入口。
- 删除 Codex/Gemini/OpenClaw 产品入口和多 agent picker。
- 删除 community/feed/social、voice、analytics、paid/usage product 入口。
- 删除 web/browser client 产品路由和部署叙事。
- Server docs 改写为 `relay`。
- 保留底层 sync/RPC/daemon/session 能力，直到确认无依赖后再物理瘦身。

Exit criteria：

- 产品 UI/docs 中 `Lyntty`、`Claude Code`、`Codex`、`Gemini`、`OpenClaw` 只允许出现在 archive/migration/vendor notes。
- mobile navigation 只剩 Lyntty 范围页面。
- app/server/cli typecheck 仍可运行。

Non-goals：马上删除所有深层 dead code；schema 最小化。

## R5 — Lyntty mobile shell 与 product vibe

目标：继承 Lyntty 的优秀 mobile vibe，但产品形态收敛成 Lyntty。

范围：

- `Sessions Home`：Pi sessions、历史/活跃/断连状态、最近活动。
- `Node Management`：节点连接、健康、权限、诊断。
- `Session Remote`：结构化 feed，不是 terminal mirror。
- mobile-first 信息密度、输入手感、状态清晰度、低噪音 feed。
- 删除 web-first、SaaS-first、多 agent-first 的交互假设。

Exit criteria：

- mobile navigation 信息架构确定。
- Android build passes。
- smoke 或截图证据记录主要页面。
- 没有 terminal passthrough、remote desktop、task board、web client 产品入口。

Non-goals：完整 Pi runtime；Review Evidence 完整实现。

## R6 — Pi-only runtime path

目标：运行时主线只支持 `pi`。

范围：

- CLI 暴露 Lyntty/Pi 命令。
- daemon spawn 产品路径只接受 `pi`。
- 接入 Pi SDK runtime：`createAgentSessionRuntime()`、`prompt()`、`followUp()`、`steer()`、`abort()`、`subscribe()`。
- 删除或隔离 Claude runner/protocol mapper/fork/resume/permission code。
- 保留通用 seam 仅用于内部边界，不暴露多 provider 产品能力。
- 明确 local-only slash commands 与 computer-side-only 行为。

Exit criteria：

- real Pi SDK runtime creation smoke passes。
- command path smoke 有证据：mobile/client intent -> relay -> daemon/`lynttyd` -> Pi runtime。
- event path smoke 有证据：Pi runtime -> daemon/`lynttyd` -> relay -> mobile/client。
- Claude runtime 不能从产品路径启动。

Non-goals：完整 Review Evidence；完整 reconnect。

## R7 — Pi 功能/插件支持

目标：Lyntty 不只是能发 prompt，而是能正确表达 `pi` 可能有的功能、插件、扩展命令和 UI 约束。

范围：

- `pi.getCommands()` / extension commands / prompt templates / skills discovery。
- local-only command 标记。
- unsupported/computer-side-only confirmation。
- Pi tools/events mapping：message、thinking、tool start/update/end、command/log/error、file change、checks、artifacts。
- `pi` extension UI 能力边界：custom UI、status、overlay、notifications、message renderer、editor component。
- mobile 只代理安全远程控制，不执行任意 shell，不模拟本地 TUI。

Exit criteria：

- tests cover command discovery、local-only blocking、unsupported slash handling、event mapping。
- UI 显示哪些能力可远程执行，哪些必须回电脑。
- 插件/技能能力不会被 relay 误当作可信远程指令。

Non-goals：复刻 Pi TUI；远程执行任意本地 UI 插件。

## R8 — `lynttyd`、历史恢复与安全控制语义

目标：Lyntty daemon/session layer 满足 Lyntty runtime invariants，并补齐历史 session/recovery。

范围：

- `lynttyd` 作为 node-local authority，可实现为 Lyntty daemon 内部 Lyntty layer 或清晰 sibling process。
- `active runtime` lease。
- `activation lock`。
- explicit takeover：wait / stop / interrupt。
- command idempotency。
- node-local event cache / sequence。
- historical Pi session discovery/import/register。
- reconnect/backfill。
- `history_gap`。
- redaction before relay/client。

Exit criteria：

- tests cover activation lock、takeover、duplicate command、local-only slash blocking、redaction、historical session import、relay cache loss。
- 两个 active runtime 不能推进同一 session。
- duplicate remote command 不会重复提交给 Pi。
- continuity 无法证明时必须 emit/display `history_gap`。

Non-goals：最终 UI polish。

## R9 — `Review Evidence`

目标：用户能在 mobile 上判断 Pi 做了什么、证据是否足够、下一步怎么处理。

范围：

- `Review Evidence` 是 `Session Remote` 内的 mode/panel。
- consumes structured events and recovery state。
- changed files。
- diff summary。
- test/check results。
- command summary + expandable detail。
- errors。
- event timeline。
- artifact metadata / preview anchors。
- recovery state。
- next actions：ask follow-up、ask pi add tests/fix、open on computer、export evidence。

Exit criteria：

- evidence reducer tests。
- Android UI smoke or explicit not-run reason。
- no merge/push/PR approval。
- no standalone Review Evidence main nav。

Non-goals：full mobile code editor；PR manager。

## R10 — Notifications / Preview / Android hardening

目标：变成日常可用 mobile 产品。

范围：

- Android notifications：finished、failed、waiting confirmation、node disconnect。
- static HTML preview。
- jailed/read-only/tokenized live preview。
- WebView no native bridge。
- mobile polish：touch targets、state labels、reduced motion、stable test ids。
- Maestro flows：lyntty path、failure、recovery、evidence。

Exit criteria：

- Android build passes。
- preview security tests：realpath jail、token expiry、path traversal rejection、read-only、no native bridge。
- physical Android smoke or explicit not-run reason。
- evidence docs complete。

Non-goals：App Store release；iOS acceptance；unrestricted dev-server tunneling。

## Cross-phase gates

每阶段关闭前必须回答：

- 是否已经先 explore 清楚，再删除？
- 是否仍然 mobile-only / Android-first / `pi`-only？
- 是否保住 Lyntty 值得继承的 mobile vibe？
- 是否移除了非 Lyntty 产品面，或明确标记为 temporary implementation debt？
- 是否避免 terminal mirror、remote desktop、task board、agent dashboard、web client？
- 是否验证历史 session discovery/recovery 风险？
- 是否有真实 runtime evidence，而不是 mock-only？
- 是否记录 commands、results、not-run reasons、risks？

## Evidence template

每个阶段在 `docs/evidence/` 新建记录：

```md
# <phase> Evidence

Date:
Branch/commit:

## Scope

## Changed files

## Commands run

## Results

## Not run

## Risks / next work
```
