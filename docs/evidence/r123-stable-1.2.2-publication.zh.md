# R123 — Stable Compatibility 1.2.2 发布

日期：2026-07-27

分支：`docs/r123-stable-1.2.2-publication`

Bead：`lyntty-90z`

Release：[`compat-v1.2.2_1.2.2_1.2.2_0.2.0-s3`](https://github.com/jczhang02/lyntty/releases/tag/compat-v1.2.2_1.2.2_1.2.2_0.2.0-s3)

## 已发布身份

| 字段 | 值 |
| --- | --- |
| Release ID | `360359261` |
| 源提交 | `f2b22a4da144627aef485e984de9aa2324bbc08c` |
| App | `1.2.2` |
| CLI + `lynttyd` | `1.2.2` |
| Relay | `1.2.2` |
| Wire | `0.2.0` |
| Sequence | `3` |
| Android package | `dev.jczhang.lyntty` |
| Android `versionCode` | `8` |
| Candidate run | [`30256019450`](https://github.com/jczhang02/lyntty/actions/runs/30256019450) |
| Promotion run | [`30259067520`](https://github.com/jczhang02/lyntty/actions/runs/30259067520) |
| 发布时间 | `2026-07-27T10:47:50Z` |

GitHub 将该 Release 报告为非 Draft、非 prerelease、不可变且为 Latest。其轻量 direct tag 直接解析到上表精确且已验证的受保护 `main` 源提交。Stable tag ruleset `19382133` 保持 active，禁止 update 和 deletion，且没有 bypass actor。

workflow 生成的 Release body 记录 sequence `3`、源提交、Candidate run 和精确 Relay digest，保留 macOS/Windows 平台未签名声明，且没有实体 Android 验收声明。不可变的 `android-validation.json` 使用 schema `2`，记录 `authorizationMode: "optional-not-performed"`、`physicalPhoneAccepted: false`，并绑定精确 APK digest。

## Candidate 与 Promotion

Candidate run `30256019450` 从精确的受保护 `main` 完成全部构建和验证步骤，并生成一个未过期 Candidate artifact：

```text
Artifact ID: 8649925744
Artifact size: 1,519,708,697 bytes
Artifact digest: sha256:33ad1c673b052c8196a2fc61b5720a7b5cc6febe27fbc3d0ceed13e1c566cbe8
下载后 Candidate tar 大小: 1,522,025,574 bytes
下载后 Candidate tar SHA-256: 96b0597872ff5c01d05fe8db446a8e186771c3e07ffd075b9b0a69aa3ae0072b
```

Candidate 构建生产 APK、五个平台的 standalone CLI 和一个双平台 Relay OCI layout；它在当前 schema 上执行保留的 1.2.1 与 1.2.0 CLI/Relay 组合，组装三份 BOM 的 rolling matrix，生成 SPDX/provenance，使用 Stable root `stable-2026-01` 签署 canonical BOM，完成 Candidate attestation，且没有发布产品 artifact。

Promotion run `30259067520` 完成全部步骤。它按 run ID 重新下载精确 Candidate，验证 attestation、checksum、BOM、历史、源提交和 matrix；重新确认当前 channel head；按 digest 推进既有 Relay OCI 字节；签署并 attest image；attest 全部 Release 文件；发布唯一 Release-ID 事务；保留 publication audit；并验证 Stable Latest 隔离。

## 不可变 artifact

Release 恰好包含 `36` 个 asset，总大小 `533,311,347` bytes。保留的 publication-audit artifact 为：

```text
Artifact ID: 8650265740
Digest: sha256:f58842af870b5ce4cd7a93c641fddf5b6806a9ac419f70c420c8c6b5a21e02b2
Release body SHA-256: 4b47b03ede38f3efda424a4a8122ea259ec0e0d0af23ba0d79d4451bbcd86b0f
排序后的 publication-audit asset tuple SHA-256: ce20f6017df6b5ae5fadec544148ffe36a63db67163905c522118b2e14d154ac
Publication occurred: true
```

Audit 中的 Release ID、tag、target、body hash 以及每个 asset 的 ID/name/size/SHA-256 均与最新 GitHub API metadata 和独立下载字节一致。`release-checksums.txt` 验证其余 `35` 个 asset。Latest 路径下载的 `compatibility-bom.json` 与 tag 对应 asset 逐字节一致。

关键发布 digest：

| Artifact | SHA-256 |
| --- | --- |
| `lyntty-stable.apk` | `5ccb6336e31aa3b484b9df7fd02f6046eede656195e7528f64b2e645f7b3caae` |
| `lyntty-cli-1.2.2-darwin-arm64.tar.gz` | `85278b4ca783f0cacb182a8940a098228d6c58f4ce71c3382c5c66793c1bb9c1` |
| `lyntty-cli-1.2.2-darwin-x64.tar.gz` | `b4cd9f5865cbfe8f6a74cd581ae1c363b4128dc85e19c8a7897f70d83e3b50b3` |
| `lyntty-cli-1.2.2-linux-arm64.tar.gz` | `72642d8ecccd7fb6ec6ece86973ab8bb9705ad6d6804425c274e6910f9d1fbf1` |
| `lyntty-cli-1.2.2-linux-x64.tar.gz` | `1722b8dcc0a0c3f0ec3ee48b73e717541b671db8659f858883d37425855a1ca5` |
| `lyntty-cli-1.2.2-windows-x64.zip` | `dc8a5237c69f602d40e0bb335f6c87cbb1a2d33763544fc598bde587d815f8de` |
| `compatibility-bom.json` | `9453da079bd9b5b181281c87f1780acfc499fd1f933d5120daba2b06f6e88b2b` |
| Relay OCI index | `sha256:65d7823d1938f36867c2a798c7cb37a20b1e60cb9d93cb5bb4c40c100d546447` |

全部 `36` 个下载的 Release asset 均通过 GitHub attestation 验证，并绑定源提交 `f2b22a4da144627aef485e984de9aa2324bbc08c`。

## 独立验证

发布后检查包括：

```text
gh api releases/latest、按 tag 查询 Release、direct tag ref、Promotion/Candidate run
gh run download Candidate 与 publication audit
gh release download 精确 s3 Release
sha256sum -c release-checksums.txt
gh attestation verify 全部 36 个 Release asset 及 Relay OCI digest
scripts/release.ts verify + verify-history（使用重新下载的 s2/s1 BOM）
重新执行 apk-audit.sh，并与发布 audit 比较
在 Bun/Node/npm/pnpm/npx/tsx sentinel 下运行 Linux x64 CLI --self-check
匿名读取 GHCR tag/digest OCI index 并逐字节比较
```

结果：

- detached BOM signature 使用精确的已发布/已提交 Stable trust store 验证通过；
- sequence `3`、源提交、组件版本、Android 身份和 predecessor `2,1` 均匹配；历史验证报告 `retainedBomCount=3` 与 `rollingUpgradeSafe=true`；
- 生产 APK 不可调试，使用永久证书进行 v2 签名，内嵌 standalone bundle，且只包含 `arm64-v8a`；
- 下载的 Linux x64 CLI 报告 CLI/daemon `1.2.2`、源提交、target、Wire 身份，并验证全部 `178` 个文件；
- installer checksum 与 Bash 语法通过；
- GHCR tag 与 digest 引用返回逐字节一致的 OCI index，SHA-256 为 `65d782...6447`，runtime platform 为 `linux/amd64` 和 `linux/arm64`；
- 精确 Relay digest 与源提交的 GitHub OCI attestation 验证通过；受保护 Promotion 也完成 cosign sign/verify；
- Stable s2/s1、APK-only Preview 和 Expo Dev Release 保持不可变且未改变；只有 s3 是 GitHub Latest。

独立 verifier 重新执行最新 Release、tag、asset、BOM/history、registry、attestation、validation mode、ruleset 和跨 channel 检查，结果为 `VERIFIED_NO_P0_P1_P2`。

本证据变更通过 root frozen install、lifecycle trust 检查、依赖审计、repository hardening（`85/85`）、evidence redaction 和 `git diff --check`。独立 docs frozen install/audit/check 无漏洞，准备 `42` 个页面，MDX 生成和 TypeScript 验证通过。

## 分发与部署边界

最新公开 `https://relay.jczhang.cc/v1/version` 请求已经从签名 Latest BOM 投影 Stable v1.2.2，包括 versionCode `8`、精确 APK URL/hash、release ID、sequence 和 BOM hash。该 update feed 行为不代表生产 Relay container 或本机 daemon 已升级。

生产 Relay 部署、本机 `lyntty`/`lynttyd` 更新、daemon 重启，以及修复 session `019f8c6a-ab60-7ef6-8154-56d9f05751bd`，仍是发布后的独立已授权操作。

## 未执行项与剩余风险

- 未执行或声明实体 Android 安装、启动、升级或 phone-to-Relay-to-`lynttyd` round trip。这是 `android-validation.json` 绑定的有意 optional-validation 状态。
- Candidate 与 Promotion 没有部署生产 Relay；最近的 `relay-deploy.yml` run 仍早于 Stable 1.2.1 和 1.2.2。
- 本机没有 cosign。受保护 Promotion 已签署并验证精确 Relay digest；工作站独立验证了 GHCR index 字节和 GitHub OCI attestation。
- 未应用 curated Release Notes；不可变的 workflow-generated body 保持权威。
