# R92 — Stable Android 实体验收 owner waiver

日期：2026-07-21

分支：`fix/stable-owner-validation-waiver`

Bead：`lyntty-24v`

实现 commit：`895901a9b645122d0b9b188d5d934a2d3bfef5a4`（本地 GPG signature 验证通过）。

## 决策

Owner 明确决定：本次 owner-operated 自用 Stable 不需要实体 Android 验收。该决定替代此前“首次 Stable 无 waiver”的策略，但不会把未执行的测试写成通过。

最近一次已审计 Candidate run `29836884743` 仍记录为 `physicalPhoneAccepted=false`。Promotion 要求 Candidate source 等于当前 protected `main`，因此本策略合并后该 Candidate 会变旧，必须从新的 protected main 完整重建，不能静默复用旧字节。

## 受保护 waiver

Stable Promotion 只允许两条互斥路径：

1. `physical_phone_accepted=true`、空 waiver，并提供精确实体机验收 APK SHA-256；或
2. `physical_phone_accepted=false`、空 accepted hash，并提供精确短语 `I accept publishing this exact Stable Candidate without physical Android validation`。

Preview 必须保持 Stable waiver 输入为空。两条路径都保留 protected-main freshness、Candidate attestation/checksums、签名 BOM、Android production signer pin、immutable APK digest、受保护 Environment 审批、tag ruleset、Release/asset ID 绑定及发布后字节验证。

waiver 发布会将 `android-validation.json` 纳入 checksums、attestation 和公开资产，其中明确记录 boolean `mode=false`、`authorizationMode=owner-waiver-unverified`、`physicalPhoneAccepted=false`、精确 Candidate APK SHA-256 和 owner 确认短语。

Immutable Release body 会以确定性的中英文警告开头，说明精确 APK 未做实体机验收；同时继续披露 macOS/Windows archives 未做平台代码签名。

## 验证

- `bun run ci:fast`：通过；
- hardening/redaction/Relay-SBOM：`32 pass / 0 fail`；
- behavioral tests 覆盖 physical/waiver 互斥、精确短语、空 accepted hash、boolean `mode=false`、精确 APK digest、确定性顶部警告及不一致记录拒绝；
- 全部 workflow YAML 可解析；
- Promotion workflow 的 `9` 个 shell blocks 均通过 `bash -n` 与 error-level ShellCheck；
- `git diff --check`：通过。

## 残余风险

依据 owner 明确决定，实体设备安装、`versionCode 5 → 6` 升级、启动和 Relay 行为仍未验证。完整性与身份校验不能替代这些用户路径测试；公开警告和审计资产会保留这一事实。
