# R120 — Stable Compatibility 1.2.1 发布

日期：2026-07-27

分支：`docs/r120-stable-1.2.1-publication`

Bead：`lyntty-mpr`

Release：[`compat-v1.2.1_1.2.1_1.2.1_0.2.0-s2`](https://github.com/jczhang02/lyntty/releases/tag/compat-v1.2.1_1.2.1_1.2.1_0.2.0-s2)

## 已发布身份

| 字段 | 值 |
| --- | --- |
| Release ID | `360246346` |
| Source | `f9698f4930294ee38ff914dfa6d7d0705bebc485` |
| App | `1.2.1` |
| CLI + `lynttyd` | `1.2.1` |
| Relay | `1.2.1` |
| Wire | `0.2.0` |
| Sequence | `2` |
| Android package | `dev.jczhang.lyntty` |
| Android `versionCode` | `7` |
| Candidate run | [`30241194899`](https://github.com/jczhang02/lyntty/actions/runs/30241194899) |
| Promotion run | [`30243779634`](https://github.com/jczhang02/lyntty/actions/runs/30243779634) |
| 发布时间 | `2026-07-27T06:51:15Z` |

GitHub 将该 Release 标记为非 draft、非 prerelease、immutable 且为 Latest。其 lightweight tag 直接指向上表中的精确、已验证、受保护 `main` source。Stable tag ruleset `19382133` 仍处于 active 状态，保护更新与删除，且没有 bypass actor。

工作流生成的 Release 正文记录 sequence `2`、精确 source、Candidate run `30241194899` 和 Relay digest。`physical_phone_accepted=false` 时，正文既没有实体机验收声明，也没有未验收警告；同时保留要求的 macOS/Windows 平台签名披露。

## Candidate 与 Promotion

首个 Candidate run `30236540399` 对其 source 有效，但 Promotion run `30238922664` 暴露了前序绝对路径不可跨 runner 的缺陷，并在任何发布变更前失败。PR [#62](https://github.com/jczhang02/lyntty/pull/62) 通过受保护审查修复该问题，并成为最终发布 source。

替代 Candidate run `30241194899` 的全部 `33` 个步骤通过，生成了唯一且未过期的 Candidate artifact：

```text
Artifact ID: 8643987908
Size: 1,335,021,470 bytes
Digest: sha256:c3ad01d475c21f0fb234b2cdfdfbb72f6cddbf15c721f3970bdd215a0d330f6e
```

Candidate 检查覆盖 production APK、五个平台 standalone CLI、保留的 `1.2.0` CLI 与 Relay 实际执行、迁移后的 Relay schema、双平台 Relay OCI layout、SPDX SBOM、确定性 provenance、Compatibility BOM 签名/历史验证和 Candidate attestation。

Promotion run `30243779634` 的全部 `25` 个步骤通过。它按 run ID 独立下载精确 Candidate，验证 attestation/checksum/BOM/history/source/matrix，重新确认 channel head，按 digest 晋级现有 Relay OCI bytes，签名并 attestation 镜像，对全部 Release 文件生成 attestation，完成单一 Release-ID transaction，保存 publication audit，并验证 Latest channel 隔离。

## 不可变 artifact

Release 精确包含 `36` 个 uploaded asset，总计 `533,241,191` bytes。保存的 publication audit artifact 为：

```text
Artifact ID: 8644321835
Digest: sha256:8948886cc85af3b0f5ee4b28759913585eedf6edf0d2cf4195fb638d045c2857
Release body SHA-256: 0031007c0bb865edb7304bff6b1e6e3bb373ea987ef598e0cf25bec3e4dbc3a9
Publication occurred: true
```

Audit 中的 Release ID、tag、target、正文 hash，以及每个 asset 的 ID/name/size/SHA-256 均与 immutable GitHub Release metadata 和实际下载 bytes 一致。`release-checksums.txt` 验证其余全部 `35` 个 asset。Latest 下载的 `compatibility-bom.json` 与 tag 下的 asset 逐字节一致。

关键发布 digest：

| Artifact | SHA-256 |
| --- | --- |
| `lyntty-stable.apk` | `82ad98c7a518ba9be6c77ead2724ce5c00b22d6fe5fb6dae92e92ad0677907ad` |
| `lyntty-cli-1.2.1-darwin-arm64.tar.gz` | `9f671c9fac13a3f78238eb0aa2b6bf1e5b053551da94897d3d1b5b5a152bb974` |
| `lyntty-cli-1.2.1-darwin-x64.tar.gz` | `af8361611e8dbdb3f51cb1833e8e9ef169f42a1550edd1e19a8265cf995647f0` |
| `lyntty-cli-1.2.1-linux-arm64.tar.gz` | `f17d4b0475208438800655d408a32ae4124626e922b2f5abcd1ab9fb22b44289` |
| `lyntty-cli-1.2.1-linux-x64.tar.gz` | `5d58d40361112a361c154d9522e329de7b5ffaf117a953be8327b7a0c1ab9c14` |
| `lyntty-cli-1.2.1-windows-x64.zip` | `7adeaacd645b79d57b68f4cdd98496ead9a83b57dea015c9ba5aaadb74c3c059` |
| `compatibility-bom.json` | `463deb2baf5687da4d2d1f75ee516b4f9aa14df2f6c7af4655c4dfcca9faaeff` |
| Relay OCI index | `sha256:e705f810310c0d098776f971f1673b88a93befdefd856c810b76b687d64cac3c` |

全部 `36` 个已下载 Release asset 均通过 GitHub attestation 验证，并绑定 source `f9698f4930294ee38ff914dfa6d7d0705bebc485`。

## 独立核验

发布后审计使用以下检查：

```text
gh api repos/jczhang02/lyntty/releases/latest
gh api repos/jczhang02/lyntty/git/ref/tags/<release-tag>
gh api repos/jczhang02/lyntty/actions/runs/30243779634
gh run download 30243779634 --name compatibility-publication-audit-<release-tag>
gh release download <release-tag>
sha256sum -c release-checksums.txt
gh attestation verify <each-of-36-assets> --repo jczhang02/lyntty --source-digest f9698f49...

bun --no-install scripts/release.ts verify \
  --bom compatibility-bom.json --signature compatibility-bom.sig.json \
  --trust-store stable-release-trust-roots.json --channel stable
bun --no-install scripts/release.ts verify-history \
  --current compatibility-bom.json --predecessor <sequence-1-bom>
```

结果：

- detached BOM signature 选择 Stable root `stable-2026-01` 并通过验证；
- sequence `2`、前序 sequence `1`、source、组件版本、Android identity、五平台 CLI matrix、Relay repository 与 Relay digest 均一致；
- history 验证返回 `retainedBomCount=2`、`rollingUpgradeSafe=true`；
- 已发布 `android-validation.json` 为 schema `2`、`authorizationMode=optional-not-performed`、`physicalPhoneAccepted=false`，并绑定精确 APK SHA-256；
- 新执行的 `apk-audit.sh` 与发布 audit 逐字节一致，包括 package、version name、`versionCode` 和 signer pin；
- 每个 CLI archive 内的 artifact-manifest hash 均与 sidecar 和 BOM 一致；下载的 Linux x64 artifact 以 standalone `--self-check` 通过，version `1.2.1`、daemon `1.2.1`、source commit、target 和 Wire identity 均正确；
- 已发布 installer 通过自身 checksum、`bash -n` 和 error-level ShellCheck；
- 直接、匿名的 GHCR Registry API 读取证明 Stable tag 与 digest reference 返回相同 OCI index bytes；index 包含 `linux/amd64`、`linux/arm64` 及其两个 BuildKit attestation descriptor；
- `ghcr.io/jczhang02/lyntty-relay@sha256:e705...` 对 source `f9698f49...` 的 GitHub OCI attestation 验证通过；
- Relay runtime identity、schema doctor、保留运行时检查、多架构 SBOM 证据，以及 Promotion 内的 cosign 签名/验证步骤均通过。

首次本地批量下载 Release 时遇到临时 TLS EOF。所有 partial file 均被删除或通过 HTTP Range 续传；最终 size、API digest、publication-audit digest、`release-checksums.txt` 和 attestation 全部通过。传输重试不作为 artifact 正确性的证据。

Evidence 变更本身通过 `bun run test:repo-hardening --timeout 20000`（`85/85`）、root 与 docs 依赖无漏洞审计、evidence redaction、`git diff --check` 和独立 docs 构建（`42` 个页面、MDX 生成与 TypeScript 检查）。

## 未运行与残余风险

- 未执行也未声称实体 Android 安装、启动或 phone-to-Relay-to-`lynttyd` round trip。这正是 `android-validation.json` 记录的可选验收模式。
- 未部署 Production Relay。最新 `relay-deploy.yml` run 早于本 Release；本次发布仅增加签名的 immutable GHCR image tag。
- 本地没有 cosign，因此发布后工作站未重复 certificate 验证。受保护 Promotion 在发布前对精确 Relay digest 完成签名并随即验证；独立 registry digest 与 GitHub OCI attestation 检查均已通过。
- 未应用 curated Release Notes；immutable 的工作流生成正文保持权威。
