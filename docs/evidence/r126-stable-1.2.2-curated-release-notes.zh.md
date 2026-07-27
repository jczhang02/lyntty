# R126 — Stable 1.2.2 精编 Release Notes

日期：2026-07-27

状态：已上线并通过独立验证

Release：[`compat-v1.2.2_1.2.2_1.2.2_0.2.0-s3`](https://github.com/jczhang02/lyntty/releases/tag/compat-v1.2.2_1.2.2_1.2.2_0.2.0-s3)

## 结论

现有不可变 Stable 1.2.2 Release 已使用精简双语 Lyntty 格式和推断标题 `V1.2.2 Session Continuity 🧭`。唯一变化的用户可控 Release 字段是 title/body；GitHub 因这次 metadata edit 推进了 `updated_at`。Release ID、tag、direct tag commit、target、draft/prerelease/immutable 状态、Latest 身份及全部 36 个 asset tuple 保持精确不变。

## 政策前置

PR [#68](https://github.com/jczhang02/lyntty/pull/68) 将主动 Release Notes 政策合并为 GitHub 验签的 `main@5b20b0b93bac95b8d74f59205aa78ef6ba5f0349`。最终 15 个 check context 全部通过。第一次 macOS isolated-lifecycle 在未变更的开发生命周期测试中超时；仅重跑失败项后通过，没有绕过任何门禁。

政策合并后，`release-notes` 可以主动调用，同时保留精确 target、精确草稿和公开编辑明确授权。Rollback 与 `native-signing-*` 继续排除，mandatory disclosure 和不可变 Release 边界也保持不变。

## 目标与推断

解析出的唯一现有目标如下：

| 字段 | 值 |
| --- | --- |
| Release ID | `360359261` |
| Tag | `compat-v1.2.2_1.2.2_1.2.2_0.2.0-s3` |
| Source 与 direct tag commit | `f2b22a4da144627aef485e984de9aa2324bbc08c` |
| Version | `1.2.2` |
| CodeName | `Session Continuity` |
| Emoji | `🧭` |

`Session Continuity` 来自 Stable 1.2.2 源码中占主导的已验证用户可见主题：规范 Pi 历史、渐进加载旧历史、保留会话名称、重启安全的向前同步，以及恢复本机会话发现。`🧭` 对应 skill 中 history/sync/reliability/control 映射。标题保持描述性，没有增加性能、安全、完整性或平台支持保证。

## 草稿与审查

公开 body 逐字保留原有 mandatory 首行：

```text
macOS and Windows CLI archives: intentionally not platform code-signed for this owner-operated self-use release.
```

居中 logo 固定到 source `f2b22a4...bc08c`。四条英文和四条中文以相同顺序描述同一行为：长会话历史连续性、规范会话名称、不会阻塞后续记录的 Pi 历史重试，以及服务侧本机 Pi 发现。Body 不含 emoji、em dash、可选 Download/Integrity section、内联 PR 引用或未经验证的 contributor。

标题、唯一标题 emoji、disclosure prefix、source-pinned logo、`Lyntty` h1、section 顺序、双语条目一致性和格式排除项均通过机械检查。独立源码 review 发现一个初始 P1：第三条误将 Pi-history outbox 恢复描述成 phone-input 投递。该条已改为 Relay 响应丢失后的历史重试语义；最终草稿 review 返回 `VERIFIED_NO_P0_P1_P2`。

## 修改操作

编辑前的即时 API 快照与批准基线完全一致。Candidate run `30256019450` 和 Promotion run `30259067520` 均在精确 source `f2b22a4...bc08c` 上成功，且没有 Candidate 或 Promotion retry 正在运行。

唯一 Release 修改为：

```text
gh release edit <exact-tag> --repo jczhang02/lyntty --title <exact-title> --notes-file <approved-draft>
```

未使用 create/delete、tag、asset、channel/state、Latest 或 reaction 操作。替换 workflow-generated metadata 会有意失去依赖原 title/body 的 publication audit/retry 兼容性；当前没有此类 retry 待执行或获授权。

## 前后对比

| 字段 | 修改前 | 修改后 |
| --- | --- | --- |
| Title | workflow-generated Stable title | `V1.2.2 Session Continuity 🧭` |
| Body bytes | `575` | `2300` |
| Body SHA-256 | `4b47b0...86b0f` | `9dd29e...de237` |
| GitHub `updated_at` | `2026-07-27T10:47:50Z` | `2026-07-27T14:30:14Z` |
| Release ID | `360359261` | `360359261` |
| Target/tag commit | `f2b22a4...bc08c` | `f2b22a4...bc08c` |
| Draft / prerelease / immutable | `false / false / true` | `false / false / true` |
| Latest Release ID | `360359261` | `360359261` |
| Asset count | `36` | `36` |
| Asset tuple SHA-256 | `df6325...36a3` | `df6325...36a3` |

Asset tuple hash 覆盖排序后的 `{id,name,size,digest}`。`download_count` 会因读取而变化，并非 asset 身份字段，因此明确排除。

Fresh `gh api` 和 `gh release view` 读取到精确批准 title/body 及未变不变量。另一个独立只读 verifier 再次检查线上 Release、Latest、tag-ref、asset、body 格式和 body hash，并返回 `VERIFIED_NO_P0_P1_P2`；body SHA-256 为 `9dd29e...de237`，asset 数量为 36。

机器可读证据：[`artifacts/r126/release-notes-edit.json`](./artifacts/r126/release-notes-edit.json)。

## Evidence 验证

```text
bun run test:repo-hardening
85 pass, 0 fail

cd docs/.site && bun run docs:check
完成 42 个页面；MDX generation 与 TypeScript 检查通过

R126 JSON parse、本地链接、双语 heading 一致性、staged evidence redaction、
git diff --cached --check 与 git diff --check
PASS
```

最终独立 evidence review 返回 `VERIFIED_NO_P0_P1_P2`。

## 未执行与残余风险

- 未重新下载 assets，因为仅修改 title/body 不可能替换不可变 asset bytes；已在前后对比全部 API-bound ID/name/size/digest tuple。
- 未通过浏览器目测 GitHub 渲染页；通过 API 与 `gh release view` 逐字节比较精确 Markdown。
- 本次 metadata edit 未额外执行 Candidate、Promotion、deployment、rollback、package build、Release create/delete、tag 修改、asset 修改或 reaction。
- 实体 Android 验收仍未执行，精编 Notes 也没有作此声明。
- 需要 workflow-generated title/body 的历史 publication retry 现在会 fail closed。Candidate 与 Promotion 已完成，且没有 retry 获授权。
