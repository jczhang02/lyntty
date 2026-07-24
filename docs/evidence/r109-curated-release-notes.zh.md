# R109 — GitHub Release Notes 策划正文

日期：2026-07-23

状态：三次已授权 title/body 修改已上线并通过独立验证

## 范围

所有者为三个既有 Release 明确提供并确认了 version、CodeName、emoji 和精确 tag，审阅完整草稿后授权发布。本次操作仅通过 `gh release edit` 修改既有 Release 的 title/body：

- Stable Compatibility：`compat-v1.2.0_1.2.0_1.2.0_0.2.0-s1`；
- 独立 APK Preview：`android-preview-v1.2.0-920001`；
- Expo Dev 持久 prerelease：`android-expo-dev-v1.2.0-930001`。

没有创建、删除、上传、替换、改名或移动 Release、tag 或 asset；没有改变 draft、prerelease、immutable、target 或 GitHub Latest 状态，也没有添加 reaction。

## 已批准的修改

| Tag | Release ID | Title | 修改前 Body SHA-256 | 修改后 Body SHA-256 |
| --- | ---: | --- | --- | --- |
| `compat-v1.2.0_1.2.0_1.2.0_0.2.0-s1` | `357552269` | `V1.2.0 Local First 📡` | `be862cef92d4200098ca592ce58edad506cb32e5e43ff77fa264f031b6c20d54` | `3851e442cc260a1ed5dbfa7f4151fefeb3f85a17f864ed11420832e2a4db4996` |
| `android-preview-v1.2.0-920001` | `357064582` | `V1.2.0 Local First 📡` | `9cdc3d6fade06530de3440cfe3e6df1f4f35ae9ae7a86dda2b312b899094f08a` | `ab6dd8b9879129a568b2754954ca368b16c2803fc0db48c482e58f2e60e88368` |
| `android-expo-dev-v1.2.0-930001` | `358594428` | `V1.2.0 Metro Link 🔌` | `d8adcb6430d9071120fccdc04d4bc705fc6495656ca234fadae123cbbfa85531` | `f2306dc3d82315ae29cc802006a3f4b9b457be4008463dadfc871f8f4091f984` |

Stable 与 Preview 的标题原本已经符合规则。Expo Dev 从 `Lyntty Expo Dev v1.2.0 (930001)` 改为用户确认的策划标题。

最终正文使用一个居中的、固定到精确 Release target 的 Lyntty 标题区，后接数量和顺序一致的英文 Changelog、中文更新日志与 `Thanks`。可选的 Download、Install、Integrity、构建身份、signer、checksum、attestation 和设备验证章节均已移除。

必须公开的披露继续保留：

- Stable 以 `scripts/stable-release-validation.ts` 当前生成的原文开头；生成 warning 的 SHA-256 为 `4257d337c06876063c9dbb71cc0d2dc2e24fd359dd25d5df6f631d470d45ad89`。
- Stable 保留 macOS/Windows 平台未签名披露。
- 独立 APK Preview 逐字节保留既有的确定性双语 owner-waiver warning。
- Expo Dev 不增加 warning 章节，英中文第一条均要求从兼容源码 checkout 启动 Metro `8081`，并说明 APK 无法独立运行。

## 发布命令

每次修改只使用 `.agents/skills/release-notes/SKILL.md` 允许的参数：

```bash
gh release edit "compat-v1.2.0_1.2.0_1.2.0_0.2.0-s1" --repo "jczhang02/lyntty" \
  --title "V1.2.0 Local First 📡" \
  --notes-file "/tmp/lyntty-release-notes-drafts.bQ9S30/stable.md"

gh release edit "android-preview-v1.2.0-920001" --repo "jczhang02/lyntty" \
  --title "V1.2.0 Local First 📡" \
  --notes-file "/tmp/lyntty-release-notes-drafts.bQ9S30/preview.md"

gh release edit "android-expo-dev-v1.2.0-930001" --repo "jczhang02/lyntty" \
  --title "V1.2.0 Metro Link 🔌" \
  --notes-file "/tmp/lyntty-release-notes-drafts.bQ9S30/expo-dev.md"
```

没有运行 `gh release create`，也没有传入会改变 status、target、tag、asset 或 Latest 的参数。

## 线上验证

修改前重新抓取 Release API、direct tag ref 和 Latest 快照，要求其与起草时状态一致；第一次修改前还复核了已批准正文的字节数与哈希。每次修改后立即验证 API 与 tag ref，最后再通过 `gh api` 与 `gh release view` 同时抓取三个对象进行汇总审计。

最终身份：

| Tag | Target 与 direct tag SHA | Draft | Prerelease | Immutable | Assets | Asset inventory SHA-256 |
| --- | --- | --- | --- | --- | ---: | --- |
| `compat-v1.2.0_1.2.0_1.2.0_0.2.0-s1` | `39745de8dc9d7b7bfa6706320abbabb05c6cc3e1` | false | false | true | 36 | `38049d4ddd0eb53a359605d37c1b083af39feab85f93fa9aa76a8030301b5f35` |
| `android-preview-v1.2.0-920001` | `60f0d620f97f91ea20ac7a97d85bcc9685e46e83` | false | true | true | 5 | `3dc3bd05a95f151c8ae4f4b4b3a5e6f1d672e38c11da1ab384db114bcaa30b6d` |
| `android-expo-dev-v1.2.0-930001` | `04b63ea7a35f98c3012cc2ca6b00b7dae9e76968` | false | true | true | 7 | `6068145df3f84700071d93a45b4dba32b56b4fab904d264da674fe94f789ff83` |

修改前后的 48 个 asset 元组按 numeric ID、名称、大小和 API SHA-256 digest 排序后完全一致。Release numeric/node ID、target、发布状态、direct tag ref 和 asset inventory 均未变化。GitHub Latest 仍是 Release `357552269`、tag `compat-v1.2.0_1.2.0_1.2.0_0.2.0-s1`。

机械草稿检查与两轮只读复核发现并修正了 APK Preview Relay 表述歧义、压缩包数量表述、Expo Dev 兼容 checkout 条件、Preview Logo target 以及 Stable 旧 warning 改写。最终草稿 verifier 返回 `PASS`。另一个发布后 verifier 重新查询 GitHub，确认不存在额外目标 Release，并对三份线上正文及全部不变量返回 `PASS`。

仓库证据检查同样通过：

```text
bun run test:repo-hardening
41 pass, 0 fail

git diff --check
git diff --cached --check
PASS
```

## 未执行与剩余风险

- title/body 修改不能改变 immutable asset 字节，因此没有重新下载全部 Release asset；验证比较了 48 个 API 绑定的 ID/名称/大小/digest 元组。仅下载 Stable 的 `android-validation.json`，用于重新生成规范 warning。
- 没有通过浏览器测试 GitHub 渲染页面；已通过 Release API 与 `gh release view` 对源码 Markdown 做逐字节比较。
- 没有 dispatch 或重跑 workflow。若历史 promotion retry 要求最初的机器生成正文，现在会针对策划正文 fail closed；本次 Notes 修改不授权任何 retry。
- Asset `download_count` 会随读取变化，不是身份字段，因此未纳入 immutable 元组比较。
