# R86 — Android Preview APK 替代 Candidate（中文）

日期：2026-07-21

状态：替代 Candidate 字节已完成独立验证。未执行该精确 APK 的实体 Android 测试；所有者已明确授权如实标注“未验证”后发布。受保护 evidence/waiver PR 与公开 Promotion 尚待执行。

## Candidate 身份

```text
Candidate run: 29786815855
Candidate URL: https://github.com/jczhang02/lyntty/actions/runs/29786815855
Artifact: android-preview-candidate-29786815855
Artifact ID: 8479510751
Artifact archive digest: sha256:f6360f9b32a1cc2f1b4d19ac9d1cc464a3d637d7282fa2d93bebe32b3bbafbcf
Artifact expires: 2026-08-19T23:59:44Z
APK: lyntty-preview-v1.2.0-920001.apk
APK size: 126797859 bytes
APK SHA-256: 7139219f0051ab0ad705932f15175ea1e5d8903f91e0491b19f800aa97d4038b
Source commit: ef0853524fb78ecf31697103ff5597a0b20b1ed6
Source tree: 52adba99fc9da895efd00a933e130930cc05af11
applicationId: dev.jczhang.lyntty.preview
versionName: 1.2.0
versionCode: 920001
ABIs: arm64-v8a, x86_64
Signer SHA-256: ebd23c222b690e2be635fe3e52bd70b6fb86c5570ab279bc4e8c1f22ed90ef9c
```

## 替代旧 Candidate 的原因

Candidate run `29762476280` 对 source `33d7a99c57cce0783d069e95ba6d4abc59a53c1d` 是有效产物，但 GitHub 随后发布 high-severity GHSA-395f-4hp3-45gv。受保护 PR #20 将审计依赖图升级到 `shell-quote@1.9.0`；根 `package.json` 与 `bun.lock` 都是 Android 构建输入，因此旧 APK 不能再从当前 protected `main` Promotion。

受保护 PR #21 只撤销旧 `920001` allowlist 条目，同时保留其历史证据和 `910003` 升级 fixture。目标 tag 与 Release 从未存在。未放宽的 Candidate workflow 随后从 protected `main` 以同一未发布 `versionCode` 构建本替代产物，没有新增通用的同版本替换绕过。

## Candidate 验证

Run `29786815855` 的一个 job 共 17 个步骤全部成功：protected-source 验证、frozen install、未审阅配置拒绝、Bun-only 双 ABI 构建审计、APK staging/audit、APK attestation、manifest attestation 与 artifact 上传。没有创建 tag、draft 或 Release。

下载后的 artifact 精确包含 APK、SHA-256 sidecar、APK audit、runtime audit、provenance、Release Notes、标题和 Candidate manifest。独立复核确认：

- 该 archive 是 run 唯一且未过期的 artifact，并绑定 protected source `ef0853524fb78ecf31697103ff5597a0b20b1ed6`；
- manifest 以精确名称、大小和 SHA-256 绑定七项发行输入，逐文件重哈希全部通过；
- APK sidecar、manifest 与 provenance 均绑定 SHA-256 `7139219f0051ab0ad705932f15175ea1e5d8903f91e0491b19f800aa97d4038b` 和大小 `126797859`；
- provenance 以精确 schema keys 绑定 run/source/tree、package、版本、signer、ABI、tag、标题、APK hash 和大小；
- App 内嵌 source commit 为 `ef0853524fb78ecf31697103ff5597a0b20b1ed6`；
- 新的真实 APK audit 与 Candidate audit 逐字节相同：唯一 signer、v2 signature、非 debuggable package、standalone bundle，以及精确 `arm64-v8a,x86_64`；
- runtime audit 显示 Node-family `execve` 命中为 0，sentinel 调用为 0；
- 严格 GitHub attestation verification 分别只返回一个 APK attestation 和一个 manifest attestation，二者均绑定 Candidate workflow、protected `main` 和 signer/source digest `ef0853524fb78ecf31697103ff5597a0b20b1ed6`；
- Release 标题和已解析 Notes 与审阅模板完全一致，不含占位符；
- 目标 tag `android-preview-v1.2.0-920001` 与 GitHub Release 仍不存在。

五个 tracked sidecar 均与替代 artifact 逐字节一致。其中四个相对旧 Candidate 改变；runtime audit 保持不变，因为两次审计构建都只含相同三条零执行声明。APK 本身不提交。`scripts/preview-apk-allowlist.json` 为替代 source/hash 增加一条唯一绑定，同时仅保留 `910003` fixture 与之并列。

## Replacement 复审验证

受保护复审变更在未创建 tag、draft 或 Release 的前提下完成验证：

- `bun install --frozen-lockfile` 完成，lockfile 无变化；
- 八文件 artifact 清单、manifest 绑定的七项输入、五个 tracked sidecar、唯一两行 allowlist、精确 source tree、APK SHA/size、解析后的标题/正文及两项严格 GitHub attestation 均重新验证；
- Promotion 两处序列化 delta block 完全一致，并精确匹配 replacement source `ef0853524fb78ecf31697103ff5597a0b20b1ed6` 到当前变更的 11 个修改路径；
- Promotion YAML 解析通过，三个 shell block 全部通过 `bash -n` 与 error-level ShellCheck；
- hardening/redaction 通过 24 项测试，包含可执行授权 XOR、physical/waiver 正文逐字节生成、精确 Draft 发布恢复及仅允许 reviewed target 的 retarget；waiver 正文 SHA-256 为 `9cdc3d6fade06530de3440cfe3e6df1f4f35ae9ae7a86dda2b312b899094f08a`；
- `bun run ci:fast` 通过：hardening/redaction 24、Wire 33/76、CLI 585/1272、Relay 119/332、App 90 个文件 812/3276 加真实 Preview bundle smoke、lifecycle 35/194；
- `git diff --check` 通过。

## 未执行实体 Android 验收

未执行的实体机矩阵仍为：

1. 将已安装的 `1.1.0` / `910003` 升级至 `1.2.0` / `920001`，确认既有有效 Relay 设置保留；
2. 清除 App 数据或全新安装，确认 Relay 设置完成前不能启动认证或同步；
3. 拒绝非法 Relay、接受本地 `/health` 契约，并允许 Android 返回键退出强制设置页；
4. 配对节点、打开 managed Pi、完成独特手机消息/回复往返，并在重开 App 后确认连续性；
5. 清除 Relay，确认 App 回到设置门禁且不复用旧身份。

上述矩阵**没有针对 SHA-256 `7139219f0051ab0ad705932f15175ea1e5d8903f91e0491b19f800aa97d4038b` 的 APK 执行**。此前 `910003` 实体机测试、CI、静态检查、APK/runtime audit、attestation 与隔离 Relay 预检，都不能替代对这些精确字节的实体测试。

所有者已明确接受该残余风险并授权直接 Release。因此 Promotion 必须保持 `physical_phone_accepted=false`，并要求精确短语 `I accept publishing this exact Candidate without physical Android validation`。不可变公开正文必须确定性前置中英文警告；Actions workflow summary 与 run audit trail 必须记录 actor/mode/source/APK hash；任何位置都不得把本 Release 描述为实体机通过。

## Draft Promotion 恢复

Promotion run `29792580712` 已重新验证 replacement Candidate 并创建精确私有 Draft，随后因单独执行 `POST /git/refs` 创建 tag 返回 HTTP 404，在公开发布前停止。该失败没有留下 tag，也没有产生公开 Release。只读恢复核验确认 Draft `357064582` 仍具备精确标题、目标 commit、3334-byte waiver 正文和五项 Candidate 资产；下载后的每项资产都与 escrow Candidate 逐字节一致。

受保护恢复会硬绑定 Release ID `357064582` 及其五个既有 GitHub asset ID，且绝不调用 Release create、资产 upload、Release delete 或单独的 ref 创建端点。资产清单、状态、大小、服务端 digest、下载字节与 Candidate 字节都通过该精确 Release ID 核验，而不是通过待创建 tag 查询。由于合入恢复 PR 会推进 protected `main`，私有 Draft target 只能是已审阅 prior main `47351659bd8e6862abde1521854a8965919c4691` 或 workflow 的 final protected `GITHUB_SHA`；其他 target 都 fail closed。唯一写请求前，workflow 会再次核验精确 Draft 元数据、asset ID/digest、正文、protected-main 新鲜度和 tag 状态。一个完整 Release-ID 发布 payload 会钉死 tag、final target、标题、精确正文、draft/prerelease 状态及 non-Latest 状态，使 retarget 与发布在同一请求完成。Release API 从该 target 创建 tag。未发布 Draft 要求 tag 明确以 HTTP 404 证明不存在；只有已发布 immutable retry 才可接受既有 tag，且该 tag 必须直接指向 final commit。其他 tag 查询结果都会停止发布。可执行回归测试证明 reviewed-target-only 授权、精确/错误/既有 tag 处理、already-published retry、无 ref POST 的 404 发布及 HTTP 500 拒绝。既有 Draft 与资产不删除、不重建、不重新上传。

只读恢复核验通过 Release asset API 下载 asset ID `484098553`、`484098498`、`484098319`、`484098422`、`484098446`，并逐项与 escrow Candidate 做字节比较；五项全部一致，其中 APK SHA-256 为 `7139219f0051ab0ad705932f15175ea1e5d8903f91e0491b19f800aa97d4038b`。

GitHub 不支持对 Release `PATCH` 这类 unsafe 方法做条件请求。因此，本 workflow 将获授权的仓库写入者视为可信发布参与者，只允许 owner `jczhang02` dispatch，串行化全部 Preview Promotion run，并以完整字段请求缩短最终核验到发布之间的窗口。管理员蓄意并发修改不属于本 workflow 的威胁边界；不存在这种可信参与者竞态时，所有已观测不一致都会 fail closed。

## 发布边界

本受保护审阅 PR 本身不发布。Promotion 只有在重新验证 protected `main`、精确 source-to-final delta、唯一 allowlist、sidecar、provenance、双 attestation、immutable tag 规则、Release 正文及发布前后资产字节后，才可在 tag `android-preview-v1.2.0-920001`、标题 `V1.2.0 Local First 📡` 下发布五项替代 Candidate 资产。

不授权 Stable APK、CLI archive、Relay image、Compatibility BOM、托管 Preview Relay、Google Play artifact、OTA update 或生产部署。
