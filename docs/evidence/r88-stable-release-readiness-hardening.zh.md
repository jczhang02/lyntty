# R88 — 首次 Stable 发布就绪加固

日期：2026-07-21

> 政策更新：R89 只覆盖 R88 中首次 Stable 的审批和原生平台签名要求。R88 仍证明可选签名链及精确发布/部署 seam 已完成加固；owner-operated 自用发布不调用 Apple notarization 或 Windows Authenticode。

分支：`fix/stable-release-hardening`

Bead：`lyntty-24v`

实现 commits：`e6105043698480dd2227a6c184b11b206658c1b0`（签名 supply-chain hardening）和 `13b9c0f4fbf9259c67bf3509aae4fb116d01a068`（隔离 Preview dirty-source fixture）。

## 范围

本轮只准备、不发布首次完整 Compatibility Stable：

- App/CLI/Relay/Wire：`1.2.0` / `1.2.0` / `1.2.0` / `0.2.0`；
- sequence `1`，tag `compat-v1.2.0_1.2.0_1.2.0_0.2.0-s1`；
- Android package `dev.jczhang.lyntty`、`versionCode=6`，继续使用 production certificate SHA-256 `25e3928a7cc228254e8249e684c6ab661f5c87140e23db7406afc64af29f0cf5`；
- 五个平台的 runtime-free CLI/`lynttyd` archive；
- multiarch Relay OCI、签名 BOM、SBOM/provenance、不可变 GitHub Release，以及独立批准的 production Relay 部署。

本轮没有创建 Candidate、native staging Release、Stable tag/Release，没有推送 GHCR、发布 Android 或部署生产 Relay。

## Trust bootstrap

已生成永久 Stable Ed25519 identity `stable-2026-01`，从 sequence 1 生效。公开 store 位于 `config/release-trust-roots/stable.json`，文件 SHA-256 为 `def81e7ccffac1915c5b792674876f0c24fb4b8df648da0f3d39e75e117b0608`。

私钥只保存在受保护 environment secret（待配置）和仓库外 GPG 加密备份 `~/.local/share/lyntty/release-secrets/stable-bom-2026-01.json.gpg`（mode `0600`，加密文件 SHA-256 `974245cea5e15d76d2604d57ff726acff00e85976c7e0c3d75065792fd428482`）。已通过内存派生验证 backup 与公开 root 一致；evidence 不包含 seed、密码、证书、token、配对 URL 或 VPS 凭据。

Candidate、Promotion、rollback、native staging 和 Relay deploy 都要求 environment roots 与 protected source 中的公开 store 一致。Preview 即使使用单独 store，也不能复用 Stable public key。

## 发布与签名链

`scripts/github-release.ts` 统一处理 Compatibility Promotion、rollback 和 native staging：绑定单一 Release ID 与 asset ID，验证 name/state/size/API digest/下载字节，不删除、不替换、不 clobber；发布边界重复检查 protected `main` 和 current latest，用 non-force push 创建精确 direct tag，中断重试只接受同一 tag/commit，再执行一个完整 Release-ID `PATCH`，最后复核 immutable/latest/tag/body/asset。

Stable Promotion 还必须提交精确 Candidate APK 的实体 Android 验收与 SHA-256，没有 waiver。

`native-signing-producer.yml` 在匹配架构的 macOS/Windows runner 上导入临时证书、逐个签名四个 executable、校验架构/runtime/tool、notarization 或 RFC3161 timestamp，再从最终签名字节重建 manifest。Ubuntu publisher 使用 strict 模式，transport 后任何 executable 或普通文件字节变化都会失败。不可变 staging 仍须由独立 `native-signing.yml` 再次验证 metadata、trust roots、archive size/hash、平台签名/runtime，并生成三个 attestation 后才可进入 Candidate。

本轮没有真实 Apple/Windows 证书，未模拟签名结果。

## Relay

Hardened deploy 要求当前 protected workflow、当前不可变 Stable BOM、精确 committed roots、pinned SSH host keys，以及已按 digest 固定且健康的旧容器。迁移前原子更新 `.env`、校验镜像 revision/runtime 与 backup sidecar；schema mutation 前失败必须恢复并验证旧 digest/health，否则写入 `.rollback-incomplete`；mutation 后失败则保持停机并保留 `.migration-incomplete`。临时 secret-bearing `.env` 文件由 trap 清理。

最终验收同时检查运行容器 digest，以及本地和公网 `/v1/version` 的 BOM id/sequence/hash、APK URL/hash；只有 `/health` 绿色不算通过。本轮没有连接生产 VPS。

## 验证

通过：

- `bun run ci:fast`；
- repo hardening/redaction 26 项；
- Wire 34 tests / 77 assertions；
- CLI 585 / 1,272；
- Relay 119 / 332 及 compiled smoke；
- App 812 / 3,276、90 files 及 bundle smoke；
- dev/Preview lifecycle 35 / 194；
- release/finalization focused suite 22 / 96；
- frozen install、`bun pm untrusted`、YAML parse、53 个 Bash block 的 `bash -n`/error-level ShellCheck、`git diff --check`。

首次 `ci:fast` 暴露 test-only dirty-source fixture 问题。Preview import test 现在用临时 Git object/index 生成 synthetic commit 并清理，不再向开发仓库写 unreachable stash object；最终完整 gate 通过。

## 尚未满足的外部门禁

- environment 必须有独立 reviewer 且关闭 self-review；
- `compat-v*`、`native-signing-*` 无 bypass update/delete ruleset；
- Android/Firebase/Expo secrets 迁入 Stable environments，并由 Candidate 证明 signer continuity；
- Apple Developer ID/notarization 与 Windows Authenticode/RFC3161 正式凭据；
- 不可变 native staging 及三个 verifier attestations；
- 精确 Stable Candidate 的实体 Android `5 → 6` 升级/全新启动验收；
- VPS known-host pin、canonical master secret、digest-pinned 旧镜像、backup/restore drill 和维护审批。

这些是正式发布门禁，不是本地已验收声明。不得用 self-signed identity 或伪造 evidence 替代。

## 独立复核

两轮对抗式 review 发现并推动修复了 Release tag binding、首次身份固定、channel key 隔离、native transport strict finalization、PowerShell native-command failure、Relay root/config/rollback 和远端脚本 stdin 消耗问题。最终只读 verifier 结论为 `PASS — no P0/P1/P2 implementation defects found`，同时明确没有外部签名、实体 Android、公开发布或生产部署证据。
