# R108 — 跨 Agent Release 规则

日期：2026-07-23

状态：本地验证通过

## 结论

Lyntty 现在有一份可跟踪的 Release 规则，Pi、Claude 和 Codex 都能发现它，不需要维护多份规则正文。新规则区分各发布通道，所有公开副作用仍需单独授权，GitHub Release Notes 则使用仅限用户显式调用、仅允许编辑既有 Release 的接口。

## 范围

本次新增：

- 规范入口 `.agents/skills/release-flow/SKILL.md`；
- 显式调用的 `.agents/skills/release-notes/SKILL.md`，其中包含正文格式和编辑协议；
- `CLAUDE.md` 与 `.claude/skills/*` 相对软链接；
- `AGENTS.md` 中最小化的共享入口；
- `.gitignore` 精确放行规则；
- 纳入仓库 hardening 门禁的 `scripts/release-agent-rules.test.mjs`。

本次变更不修改发布 workflow、发布脚本、tag、asset 或线上 GitHub Release。线上 title/body 修订属于后续已授权步骤，必须等 Release Notes 所需输入全部由用户明确给出后执行。

## 已固化的决策

- `.agents/skills/` 是唯一规范来源。Claude 使用相对软链接，Pi 直接读取 `.agents/skills/`，仓库不跟踪 `.pi` 镜像。
- `release-flow` 覆盖 Stable Compatibility、Compatibility Preview、独立 APK Preview、Expo Dev 持久 prerelease、Rollback 和审计。
- 纯 Actions Artifact 任务被终止式排除。Android 验证 candidate 和通常保留 14 天的 Expo Dev Artifact 都不是 GitHub Release。
- Expo Dev 没有发布 workflow。持久 prerelease 只能通过单独授权的人工流程，把已经验证的字节原样提升。
- 加载 Skill 不代表获得 dispatch、push、PR、tag、Release 修改、Rollback 或 reaction 权限。
- `release-notes` 只接受 `/skill:release-notes <version> <CodeName> <emoji> <channel-or-tag>`，任何输入都不能猜。
- 修订既有 Notes 时，只允许使用一条精确的 `gh release edit` 命令，参数仅限 `--repo`、`--title` 和 `--notes-file`；不得创建或替换 Release。
- 修改前后必须绑定 Release ID、tag 与 tag ref、target、draft、prerelease、immutable、Latest 状态，以及每个 asset 的 ID、名称、大小和 digest。
- Stable/Preview 强制 waiver 披露和 Stable 平台未签名披露继续公开并保持原文；不再额外加入 Warning、Download、Integrity、signer 或验证信息章节。
- Expo Dev 双语 Changelog 第一条必须说明依赖 Metro `8081` 且无法独立运行。Rollback 使用运维记录，不使用 CodeName 或营销式 Changelog。

## 验证

契约测试先在实现前运行。由于规范 Skill 和软链接尚不存在，路径仍被忽略，四项测试全部按预期失败。实现并修正复核问题后：

```text
bun test scripts/release-agent-rules.test.mjs
4 pass, 0 fail

bun run test:repo-hardening
41 pass, 0 fail

bun pm untrusted
Found 0 untrusted dependencies with scripts.

bun run ci:audit
No vulnerabilities found

bun run ci:fast
PASS

git diff --check
PASS
```

隔离 worktree 使用自己的 `bun install --frozen-lockfile`，没有与其他 worktree 共享依赖目录或运行状态。

一次独立只读复核发现了三项问题：Artifact-only candidate 表述存在歧义、规则错误暗示 Expo Dev 有发布 workflow、静态命令检查过弱。最终版本已把 Artifact 排除改为终止式规则，明确 Expo Dev 的例外人工流程，拒绝跟踪 `.pi` 镜像，并精确比较允许使用的 `gh release edit` 命令块。

## 未执行

- 没有仅为观察模型选择 Skill 而启动线上 Pi、Claude 或 Codex 会话。当前通过公开文档约定的发现路径、软链接真实解析、frontmatter、ignore 行为和静态契约验证发现结构。
- 本证据单元没有 dispatch workflow，也没有修改任何 GitHub Release。

## 剩余风险

静态规则无法强迫模型加载匹配的 Skill。共享 `AGENTS.md` 入口、显式调用接口、文件系统别名和仓库 hardening 测试可以降低漂移，但任何外部操作仍须由操作者复核，并在真实修改前后比较线上状态。
