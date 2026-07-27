# R125 — Release Notes 元数据自主推断

日期：2026-07-27

状态：本地验证通过

## 结论

Lyntty agent 现在可以主动调用 `release-notes`，并从经过验证的发布上下文推断 Release CodeName 和标题 emoji。创意元数据不再强制要求用户提供四参数命令，但公开 Release 编辑仍绑定到一个精确的现有 Release、一份已展示的完整草稿和明确的修改授权。

## 范围

修改内容：

- `AGENTS.md` 允许主动使用 `release-notes` 和推断元数据；
- `.agents/skills/release-flow/SKILL.md` 在产品发布完成后主动交接给 `release-notes`；
- `.agents/skills/release-notes/SKILL.md` 移除 `disable-model-invocation`，定义推断规则和中性 fallback，同时保留 edit-only 边界；
- `scripts/release-agent-rules.test.mjs` 固化新的调用、推断、披露和授权契约。

政策实现对应 GPG 签名提交 `2911948bb0c4c6e02e9714de109b38135dc1bbac`。本次不修改线上 GitHub Release、tag、asset、Latest 状态、workflow、package 或 runtime。

## 决策

- 当前任务和线上状态解析出唯一现有产品 Release 后，agent 可以主动开始只读调查和 Release Notes 草稿编写。
- 用户明确提供的 version、target、CodeName 或 emoji 优先于推断值。
- version 和 target 只能从无歧义且经过验证的 Release 身份推导；存在多个候选 Release 时仍 fail closed。
- 缺少 CodeName 时，从用户感知影响最大的已验证主题推断。名称必须中性、描述性，不得承诺未经验证的性能、安全、可靠性、完整性或平台支持。
- 缺少 emoji 时，按有序语义映射选择。没有主导主题时使用纯渠道身份 fallback，避免编造产品声明。
- 请求发布前，agent 必须在公开 body 之外展示解析后的 target、推断值与理由、精确标题和完整双语 body。
- 主动调用只授权只读调查和草稿生成。`gh release edit` 仍需针对精确草稿和 target 的明确授权。
- Rollback 和 `native-signing-*` 继续排除；Stable 未签名平台披露和 APK Preview waiver 必须逐字保留；tag、asset、target、draft/prerelease/immutable 状态及 Latest 身份不得改变。

## 回归过程

先修改契约测试，旧的 explicit-only 规则按预期失败：

```text
bun test scripts/release-agent-rules.test.mjs
1 pass, 3 fail

缺少：AGENTS.md 和 release-flow 的主动调用规则
不应存在：disable-model-invocation: true
```

首版实现通过四项定向测试。独立 review 随后发现两个 P2：fallback 名称可能带营销暗示，以及测试没有直接锁定“只读草稿”与“精确草稿发布授权”的边界。加强后的测试在修复前失败：

```text
bun test scripts/release-agent-rules.test.mjs
3 pass, 1 fail

缺少：中性、描述性的 CodeName 规则及非承诺式 fallback
```

改用渠道身份 fallback，并增加段落级授权和披露断言后：

```text
bun test scripts/release-agent-rules.test.mjs
4 pass, 0 fail
```

精简过程保存在 [`artifacts/r125/tdd-red-green.log`](./artifacts/r125/tdd-red-green.log)。

## 验证

```text
bun run test:repo-hardening
85 pass, 0 fail

bun pm untrusted
Found 0 untrusted dependencies with scripts.

bun run ci:audit
No vulnerabilities found

cd docs/.site && bun audit --audit-level=moderate
No vulnerabilities found
```

加入双语 evidence 后，`docs:check` 完成 42 个页面并通过 MDX/TypeScript 检查；本地链接、双语 heading 一致性、staged redaction 和最终 diff 检查也均通过。最终独立只读 review 返回 `VERIFIED_NO_P0_P1_P2`。

## 未执行

- 未修改任何线上 GitHub Release title/body；本任务只修改政策。
- 未触发 candidate、promotion、deployment、rollback 或 publication workflow。
- 未为了观察未来的 skill 自动选择而单独启动模型会话。发现路径和行为由 canonical skill frontmatter、共享 alias、root guidance 和仓库契约测试验证。
- 未运行完整 package `ci:fast`，因为 App、CLI、Relay、Wire、workflow、package 和依赖实现均未变化；已运行其归属的 repository-hardening 与文档门禁。

## 残余风险

当某个主题明显占主导时，CodeName 仍属于语言模型的编辑判断。Skill 通过已验证的用户可见证据、中性措辞、有序 emoji 映射、渠道身份 fallback、展示推断理由，以及公开修改前的精确草稿确认来降低风险。
