# R86 — Android Preview APK Candidate（中文）

日期：2026-07-21

状态：Candidate 字节已完成审阅；未执行该精确 APK 的实体 Android 测试。所有者已于 2026-07-21 明确授权如实标注“未验证”后直接发布；受保护 waiver 策略 PR 与公开 Promotion 尚待执行。

## Candidate 身份

```text
Candidate run: 29762476280
Candidate URL: https://github.com/jczhang02/lyntty/actions/runs/29762476280
Artifact: android-preview-candidate-29762476280
Artifact ID: 8470552908
Artifact archive digest: sha256:3e9ebcb5b0f401831cc5e2181cd294bf338222b149de8562e68273aea8089973
APK: lyntty-preview-v1.2.0-920001.apk
APK size: 126797863 bytes
APK SHA-256: 9025d83a142ded5a618ef15c56c9bdd5486fed8336a53f1b9f0c7336b325aae9
Source commit: 33d7a99c57cce0783d069e95ba6d4abc59a53c1d
Source tree: 6c6ba760d68d0f68e85d1af839efb90a0ab9c252
applicationId: dev.jczhang.lyntty.preview
versionName: 1.2.0
versionCode: 920001
ABIs: arm64-v8a, x86_64
Signer SHA-256: ebd23c222b690e2be635fe3e52bd70b6fb86c5570ab279bc4e8c1f22ed90ef9c
```

## Candidate 验证

workflow 从受保护 `main` 运行，全部步骤成功：精确源码验证、依赖安装、未审阅配置拒绝检查、Bun-only 双 ABI 构建审计、APK staging/audit、APK attestation、manifest attestation 和 Candidate 上传。最终只保留一个 artifact，没有创建 tag 或 Release。

下载后的 Candidate 精确包含 APK、SHA-256 sidecar、APK audit、runtime audit、provenance、Release Notes、标题和 Candidate manifest。manifest 以名称、大小和 SHA-256 精确绑定七项发行输入。独立复核确认：

- APK sidecar 与 manifest 均绑定 SHA-256 `9025d83a142ded5a618ef15c56c9bdd5486fed8336a53f1b9f0c7336b325aae9` 和大小 `126797863`；
- provenance 绑定 run `29762476280`、source commit/tree、package、版本、signer、ABI、tag、标题、APK hash 和大小；
- App 内嵌 source commit 为 `33d7a99c57cce0783d069e95ba6d4abc59a53c1d`；
- 真实 build-tools 37 审计确认唯一 signer、APK Signature Scheme v2、非 debuggable package、standalone bundle，以及精确 `arm64-v8a,x86_64`；
- runtime audit 显示 Node-family `execve` 命中为 0，sentinel 调用为 0；
- APK 与 manifest 的严格 GitHub attestation verification 均绑定 Candidate workflow、受保护 `main`，以及 signer/source digest `33d7a99c57cce0783d069e95ba6d4abc59a53c1d`；
- Release 标题与 Notes 已完整解析，不含模板占位符；
- 公共 tag `android-preview-v1.2.0-920001` 和 GitHub Release 仍不存在。

`docs/evidence/artifacts/r86-preview-apk-candidate/` 下五个文件是 Candidate 对应 sidecar 的逐字节副本。APK 本身按设计不提交。`scripts/preview-apk-allowlist.json` 只新增一条对此 Candidate 字节的绑定。

## waiver 策略验证

受保护策略变更在未创建 tag、draft 或 Release 的前提下完成验证：

- `bun install --frozen-lockfile` 完成，lockfile 无变化；
- `bun test scripts/workflow-hardening.test.mjs` 通过 18 项测试，包含 physical/waiver XOR 的可执行成功与失败用例，以及两种 Release 正文的逐字节生成验证；
- Promotion YAML 解析通过，三个 shell block 全部通过 `bash -n` 与 error-level ShellCheck；
- 两处序列化 exact-delta 检查完全一致，并与 Candidate source 到当前工作树的精确七个新增、五个修改路径相符；
- 确定性的 waiver 正文以中英文警告开头，SHA-256 为 `087c0ab469b7a08ee09eada6c28db1ef77346eb628ad305184fcc8926f59b7e8`；
- `bun run ci:fast` 在加入最终逐字节正文测试前通过：hardening/redaction 20 项、Wire 33/76、CLI 585/1272、Relay 119/332、App 90 个文件 812/3276 加真实 Preview bundle smoke、lifecycle 35/194；最终 targeted hardening/redaction 重跑通过 21 项；
- `git diff --check` 通过。

## 未执行实体 Android 验收

Promotion 仍必须使用同一 APK 和 hash。原计划的实体机矩阵如下：

1. 将已安装的 `1.1.0` / `910003` Preview APK 原位升级至 `1.2.0` / `920001`，确认既有有效 Relay 配置仍可使用；
2. 清除 App 数据或全新安装，确认 Relay 设置完成前不能启动认证或同步；
3. 确认非法 Relay 被拒绝、本地 Relay `/health` 契约可通过，且 Android 返回键能退出强制设置页；
4. 配对节点，打开 managed Pi session，从手机发送独特消息，收到独特 assistant 回复，并在重开 App 后确认连续性；
5. 清除 Relay，确认 App 回到设置门禁，且不复用旧身份。

上述矩阵**没有针对 SHA-256 `9025d83a142ded5a618ef15c56c9bdd5486fed8336a53f1b9f0c7336b325aae9` 的 APK 执行**。此前 `1.1.0` / `910003` 的实体机通过、当前 CI、APK/runtime audit、attestation 以及最终 `main` 的隔离 Relay 预检，都不能替代对这份 `920001` 精确字节的实体测试。

所有者于 2026-07-21 明确接受该残余风险并授权直接 Release。受保护 waiver 路径会保持 `physical_phone_accepted=false`，并要求 dispatch 精确输入 `I accept publishing this exact Candidate without physical Android validation`，不会生成虚假的实体机通过记录。公开 Release 正文必须以确定性的中英文警告开头，说明实体 Android 安装、升级和端到端行为仍未验证。

## 发布边界

本策略 PR 本身不创建公开 Release。它通过受保护检查并合入后，Promotion 只可在审阅过的 tag/title 下发布同一份五项 Candidate 资产。不授权 Stable APK、CLI archive、Relay image、Compatibility BOM、托管 Preview Relay、Google Play artifact 或 OTA update。Candidate APK 字节、SHA-256、signer、provenance、attestation 与 allowlist 绑定保持不变。
