# 原生 CLI 签名与 staging

Stable 包含五个独立 CLI/`lynttyd` archive。Linux archive 由 Compatibility Candidate 直接产生；两个 macOS archive 和一个 Windows archive 必须先经过受保护的生产签名与独立验证。

## 受保护 environment

建立 `release-native-signing`，只允许 `main`，要求独立 reviewer，并关闭 self-review。

Secrets：

- `LYNTTY_APPLE_DEVELOPER_ID_P12_BASE64`
- `LYNTTY_APPLE_DEVELOPER_ID_P12_PASSWORD`
- `LYNTTY_APPLE_ID`
- `LYNTTY_APPLE_APP_PASSWORD`
- `LYNTTY_WINDOWS_CODESIGN_PFX_BASE64`
- `LYNTTY_WINDOWS_CODESIGN_PFX_PASSWORD`

Variables：

- `LYNTTY_APPLE_TEAM_ID`
- `LYNTTY_APPLE_SIGNING_AUTHORITY`
- `LYNTTY_WINDOWS_CERT_THUMBPRINT`
- 使用 HTTPS 的 `LYNTTY_WINDOWS_RFC3161_TIMESTAMP_URL`
- 与 `config/release-trust-roots/stable.json` 精确一致的 `LYNTTY_RELEASE_TRUST_ROOTS`
- `LYNTTY_IMMUTABLE_RELEASES_ENABLED=true`
- `LYNTTY_NATIVE_SIGNING_TAG_RULESET_ID`

对应 ruleset 必须 active、无 bypass，并禁止更新/删除 `refs/tags/native-signing-*`。P12/PFX 字节和密码不得写入 workflow input、日志、evidence 或聊天。

## 产生不可变 staging 字节

从当前受保护 `main` dispatch `.github/workflows/native-signing-producer.yml`。它没有可变发布输入，tag 由版本、完整 source SHA、run ID 和 attempt 唯一生成。

原生 job 会：

1. 嵌入已审核 Stable roots，构建目标 root；
2. 固定 `lyntty`、`lynttyd`、`rg`、`difft` 四个 executable；
3. 只把证书导入临时 keychain/certificate store；
4. 逐个签名 executable；
5. 只允许 executable 字节变化，再从最终签名字节重建 manifest；
6. 对完整 macOS root notarize，或要求 Windows RFC3161 timestamp；
7. 校验 signer、timestamp、Gatekeeper/Authenticode、架构和 compiled self-check；
8. 删除凭据材料后，只上传不含凭据的 transport artifact。

Ubuntu publisher 会再次验证 transport root、生成确定性 archive，并通过 `scripts/github-release.ts` 发布不可变 prerelease。它不会删除、替换或 clobber 既有 Release、tag 或 asset。

## 独立验证

不要立刻把 staging URL 配给 Stable Candidate。先 dispatch `.github/workflows/native-signing.yml`，传入精确 source SHA、CLI version、release tag、metadata URL/hash、三个 archive URL/hash，以及 metadata 中两个 notarization UUID。

Verifier 在匹配架构的 macOS/Windows runner 上重新检查不可变 Release、metadata、每个 archive 字节、平台签名和 runtime，并分别生成 GitHub attestation。Stable Candidate 只接受这个 verifier 在同一 source commit 上生成的 attestation。

三个 attestation 全部成功后，才能把 archive URL/hash 写入 `release-stable-candidate` variables。Verifier 失败的 prerelease 不可信；瞬时验证失败可以对同一字节重跑，字节错误必须重新运行 producer 并使用新 tag。

裸 Mach-O 不能像 PKG/DMG 一样 staple ticket，因此当前链使用包含最终 root 的 ZIP、在线 notary acceptance 和每个 executable 的 Gatekeeper assessment。若 Apple 不再支持，必须停止并通过受保护 PR 改为 PKG/DMG，不能绕过。硬件或云托管 Windows 证书同样需要专用 provider 集成，不能伪造或导出替代品。
