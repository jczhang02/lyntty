# R117 — Stable 实体设备验收改为可选

日期：2026-07-26

分支：`release/stable-1.2.1`

Bead：`lyntty-mpr`

基线：`57ae1ccf0bff974b29bd7dcf7e356b06fa648ed4`

## 决策

Owner 明确修改 Stable Compatibility 发布政策：Android 实体机验收改为可选；未执行时不再要求 waiver 短语，也不在公开 Release 正文加入未验收警告。

该政策只影响 Stable Compatibility Promotion。APK-only Preview 的独立 waiver 路径、production Android signer 连续性、Compatibility BOM 签名、source 绑定、受保护 environment、immutable Release、tag ruleset、checksum、provenance、attestation、Relay image identity、predecessor history、sequence 单调性和 Android `versionCode` 单调性均保持不变。

## 实现

- `physical_phone_accepted=false` 只允许搭配空 accepted APK hash。
- `physical_phone_accepted=true` 仍要求 lowercase SHA-256，且 Promotion 必须证明它与精确 Candidate APK 字节一致。
- 删除 Stable waiver 输入与确认短语。
- false 模式不再向 Release 正文加入未验收 warning 或状态行。
- 经 checksum 与 attestation 绑定的 `android-validation.json` 升级到 schema 2，记录 `physical-phone` 或 `optional-not-performed` 模式以及精确 APK digest。
- Stable runbook、FAQ 和 release-agent 规则同步到新政策；APK-only Preview 的披露要求保持不变。

## Test-first 证据

先修改 hardening tests，再修改 workflow 与 helper。第一次 focused run 在预期的三项 Stable policy case 中失败：

```text
bun test --timeout 20000 scripts/workflow-hardening.test.mjs
28 pass, 3 fail
```

完成实现后：

```text
bun test --timeout 20000 scripts/workflow-hardening.test.mjs
31 pass, 0 fail
```

Focused coverage 证明：

- Stable Promotion 不再包含 waiver 输入或 warning generator；
- false 配空 accepted hash 成功；
- false 配非空 hash 失败；
- true 配合规 hash 成功、配空 hash 失败；
- 其他 boolean 表达全部失败；
- 两种模式的 schema-2 audit 输出确定且一致；
- Promotion 仍验证 Candidate 字节，且没有引入任何 build 命令。

## 发布状态

实施政策期间没有创建 Candidate、tag、GitHub Release、GHCR promotion 或 production Relay deployment。Stable `1.2.1` 仍需后续受保护 workflow 才能发布。

## 残余风险

Stable 现在可以在没有实体设备证据的情况下发布，因此无法证明精确 APK 在实体手机上能够安装、启动并完成 phone-to-Relay-to-`lynttyd` 真机链路。这是 owner 明确选择的政策。Workflow 仍禁止把未执行的验收记录为已通过，并保留所有非设备 artifact 与 supply-chain 门禁。
