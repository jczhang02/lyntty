# R127 — Stable 1.2.1 精编 Release Notes

日期：2026-07-27

状态：已上线并通过独立验证

Release：[`compat-v1.2.1_1.2.1_1.2.1_0.2.0-s2`](https://github.com/jczhang02/lyntty/releases/tag/compat-v1.2.1_1.2.1_1.2.1_0.2.0-s2)

## 结论

现有不可变 Stable 1.2.1 Release 已使用精简双语 Lyntty 格式和推断标题 `V1.2.1 Progressive Sessions ⚡`。唯一变化的用户可控 Release 字段是 title/body；GitHub 因本次 metadata edit 推进了 `updated_at`。Release ID、tag、direct tag commit、target、draft/prerelease/immutable 状态、当前 Stable s3 Latest 身份及全部 36 个 s2 asset tuple 保持精确不变。

## 政策与目标

主动 Release Notes 政策已通过 PR [#68](https://github.com/jczhang02/lyntty/pull/68) 合并为验签的 `main@5b20b0b93bac95b8d74f59205aa78ef6ba5f0349`。编辑时受保护的当前 `main` 为 `73f15ff00f4e1c3368640d7cbf5c2f9e1f3d8f86`。

解析出的唯一现有目标如下：

| 字段 | 值 |
| --- | --- |
| Release ID | `360246346` |
| Tag | `compat-v1.2.1_1.2.1_1.2.1_0.2.0-s2` |
| Source 与 direct tag commit | `f9698f4930294ee38ff914dfa6d7d0705bebc485` |
| Version | `1.2.1` |
| CodeName | `Progressive Sessions` |
| Emoji | `⚡` |

`Progressive Sessions` 来自占主导的已验证用户可见源码变化：Sessions Home 会在本地完整 JSONL 索引完成前先发布 Relay 与最新本机 Pi 会话行，同时 `lynttyd` 会持久化并增量刷新其私有索引。`⚡` 对应 skill 中的 speed/performance 映射，并有受控检索测量支持。标题描述加载模型，没有增加未经验证的性能保证。

## 草稿与审查

原有 mandatory platform-unsigned 文本已逐字保留，并移至要求的公开首行：

```text
macOS and Windows CLI archives: intentionally not platform code-signed for this owner-operated self-use release.
```

居中 logo 固定到 source `f9698f49...c485`。四条英文和四条中文以相同顺序描述同一行为：

1. Sessions Home 渐进发布；
2. generation-safe 刷新和设备本地删除一致性；
3. 旧 Relay 升级迁移与更清楚的 preflight 诊断；
4. `/remote` 作为新生成的唯一 Pi 控制命令，并说明现有进程的 reload 限制。

标题形状、唯一标题 emoji、body 零 emoji、mandatory disclosure、source-pinned logo、`Lyntty` h1、section 顺序、双语条目一致性及格式排除项均通过机械检查。对照 R95-R103、R113、R115 与 R118-R120 的独立源码 review 返回 `VERIFIED_NO_P0_P1_P2`，无需修改草稿。

## 修改操作

Candidate run `30241194899` 和 Promotion run `30243779634` 均在精确 source `f9698f49...c485` 上成功，且没有 Candidate 或 Promotion retry 正在运行。

第一次即时 preflight 因 GitHub Latest API TLS handshake timeout 在修改前停止。随后进行有界即时重读，成功取得 Release、tag 和 Latest 状态，并确认批准基线与草稿 hash 完全匹配；只有此后才允许编辑。

唯一修改为：

```text
gh release edit <exact-tag> --repo jczhang02/lyntty --title <exact-title> --notes-file <approved-draft>
```

未使用 create/delete、tag、asset、state、Latest 或 reaction 操作。替换 workflow-generated metadata 会有意失去依赖原 title/body 的 publication audit/retry 兼容性；当前没有此类 retry 待执行或获授权。

## 前后对比

| 字段 | 修改前 | 修改后 |
| --- | --- | --- |
| Title | workflow-generated Stable title | `V1.2.1 Progressive Sessions ⚡` |
| Body bytes | `575` | `2429` |
| Body SHA-256 | `003100...bc3a9` | `c5ff94...e839d` |
| GitHub `updated_at` | `2026-07-27T06:51:15Z` | `2026-07-27T15:07:07Z` |
| Release ID | `360246346` | `360246346` |
| Target/tag commit | `f9698f49...c485` | `f9698f49...c485` |
| Draft / prerelease / immutable | `false / false / true` | `false / false / true` |
| Current Latest | s3 Release `360359261` | s3 Release `360359261` |
| s2 asset count | `36` | `36` |
| s2 asset tuple SHA-256 | `e1a6cc...fa6b2` | `e1a6cc...fa6b2` |

Tuple hash 覆盖排序后 `{id,name,size,digest}` 条目的 compact JSON 加一个 LF。`download_count` 会因读取而变化，并非 asset 身份字段，因此明确排除。

Fresh API 与 `gh release view` 逐字节返回批准的 title/body 及未变不变量。另一个独立只读 verifier 再次检查 Release、当前 Latest、direct tag、asset metadata 和 body 格式，并返回 `VERIFIED_NO_P0_P1_P2`：body 为 `2429` bytes，SHA-256 为 `c5ff94...e839d`，共 36 个 assets。

机器可读证据：[`artifacts/r127/release-notes-edit.json`](./artifacts/r127/release-notes-edit.json)。

## Evidence 验证

```text
bun run test:repo-hardening
85 pass, 0 fail

cd docs/.site && bun run docs:check
完成 42 个页面；MDX generation 与 TypeScript 检查通过

R127 JSON parse、本地链接、双语 heading 一致性、staged evidence redaction、
git diff --cached --check 与 git diff --check
PASS
```

最终独立 evidence review 返回 `VERIFIED_NO_P0_P1_P2`。

## 未执行与残余风险

- 未重新下载 assets，因为这条仅修改 title/body 的命令不可能替换不可变 asset bytes；已在前后对比全部 API-bound ID/name/size/digest tuple。
- 未通过浏览器目测 GitHub 渲染页；通过 API 与 `gh release view` 比较精确 Markdown。
- 本次 metadata edit 未额外执行 Candidate、Promotion、deployment、rollback、package build、Release create/delete、tag 修改、asset 修改、Latest 修改或 reaction。
- 实体 Android 验收仍未执行，也未作此声明。
- 需要 workflow-generated title/body 的历史 publication retry 现在会 fail closed。Candidate 与 Promotion 已完成，且没有 retry 获授权。
