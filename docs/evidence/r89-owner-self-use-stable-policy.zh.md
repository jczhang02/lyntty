# R89 — Owner 自用 Stable 政策

日期：2026-07-21

分支：`fix/stable-self-use-release`

Bead：`lyntty-24v`

实现 commit：`a75ee22916cbe9ee68906a81c1013dde524e8969`（本地 GPG signature 验证通过）。

## 决策

仓库 owner 明确选择自行审批，并确认本次自用发布不需要 Apple Developer ID/notarization 或 Windows Authenticode。首次 Stable 仍发布五个平台 runtime-free CLI/`lynttyd` archive，但 macOS/Windows executable 明确属于 platform-unsigned。

Release body 与 CLI provenance 必须披露这一点。签名 Compatibility BOM 和 GitHub attestation 只证明精确字节、来源与完整性，不能描述成 Apple notarization、Gatekeeper approval 或 Authenticode。

## 保留门禁

- protected source commit 与 clean artifact build；
- 五个唯一 CLI target，以及 archive SHA-256、size、内部 manifest SHA-256；
- compiled runtime identity 与无 Bun/Node-family runtime 依赖；
- CLI provenance 固定 `platformCodeSigning.policy=not-required-self-use`；
- Ed25519 签名 canonical BOM 和 Stable/Preview trust-root 隔离；
- GitHub artifact、release file 与 SBOM attestations；
- 永久 Android package signer、non-debuggable APK、精确 Candidate hash 和 Stable Promotion 前的实体 Android 验收；
- immutable Release ID/asset ID/download-byte 绑定；
- digest-pinned Relay OCI、备份/迁移/回滚和本地/公网 `/v1/version` 验证。

`native-signing-producer.yml` 与 `native-signing.yml` 仅保留为未来可选工具。当前 Candidate 不调用它们，也不接受外部 native archive URL/hash 替换输入。

## Owner 审批配置

GitHub environments 保留 `jczhang02` 为 required reviewer，并允许 self-review。`main` 仍要求 protected PR、签名 commit、线性历史、required checks、无 bypass 和 review thread resolution；不再要求不存在的第二审批人。

## Android key 来源与验证

现有 Android/Firebase repository secrets 于 2026-07-06 配置，随后由 run `29020171652` 发布 `android-v1.0.0-5`，之后未更新。

新的非发布验证 run `29821672497` 使用同名 secrets 和 protected main `94785cea37ae95e257c4d692f2073782414466c5`，结果：

- artifact：`android-stable-candidate-94785cea37ae95e257c4d692f2073782414466c5-6`；
- APK SHA-256：`35a21d770426413d010892fba528517cb318b3ba8d4fb835ad982656b038017b`；
- package/version：`dev.jczhang.lyntty`、`1.2.0`、`versionCode=6`；
- signer SHA-256：`25e3928a7cc228254e8249e684c6ab661f5c87140e23db7406afc64af29f0cf5`；
- signer count：`1`；
- debuggable：`false`。

这证明 GitHub 保存的仍是 `versionCode=5` 生产线的连续签名 key。该验证 APK 不是之后的 Compatibility Candidate，也不能冒充未来精确 hash 的实体机验收。

## 验证

已执行 `bun install --frozen-lockfile`、`bun pm untrusted`、`bun run ci:fast`、repository hardening、policy/release/publication/artifact focused suites、workflow YAML parse、`bash -n`、ShellCheck 和 `git diff --check`。

结果：Wire `35/0`、CLI `585/0`、Relay `119/0`、App `812/0`（3276 assertions）、policy suite `31/0`、release/publication/artifact suite `22/0`、hardening/redaction `26/0`；24 个 Candidate/Promotion Bash block 通过 syntax 与 error-level ShellCheck。独立只读 review 返回 `PASS`，无 P0/P1/P2。合并前仍需 protected-PR CI。

## 发布状态与残余风险

本次政策变更没有创建 Compatibility Candidate、Stable tag/Release、GHCR promotion 或生产 Relay deployment。macOS 可能显示 Gatekeeper 警告，Windows 可能显示 SmartScreen 警告；owner 接受自用场景下的提示，但不能从 BOM signature 推断平台 publisher identity。

剩余外部门禁包括未来精确 Candidate APK 的实体机测试、GHCR package audit 权限、VPS pinned known-host、当前 digest-pinned Relay runtime 识别，以及 backup/restore drill。
