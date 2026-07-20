# R86 — Android Preview APK prerelease（中文）

日期：2026-07-20

状态：PR #16 已合入；首次 Candidate 在生成 artifact 前停止；bundle 修复等待受保护 PR

## 范围

本发布路径只处理 Android 开发测试包：

```text
applicationId: dev.jczhang.lyntty.preview
versionName: 1.2.0
versionCode: 920001
ABIs: arm64-v8a, x86_64
Tag: android-preview-v1.2.0-920001
Title: V1.2.0 Local First 📡
```

不发布或部署 Stable Android、CLI/daemon archive、Relay OCI、Compatibility BOM、托管 Preview Relay、Google Play 或 OTA。

## Preview 首启契约

Preview 必须先持久化并验证 Relay，之后才能初始化认证或同步：

- 未配置或不符合策略的 Relay 时，直接清理旧凭据，不读取、不恢复同步；
- 凭据删除失败会在写入新 URL 前阻止启动或 Relay 更换；
- 深链页面不会在门禁期间挂载；同步与主导航依赖仅在设置完成后惰性加载，**连接到 Relay** 使用不含业务首页的独立 route group；
- 通过规范 `GET /health` 验证精确 `status: ok` 与 `service: lyntty-relay`；
- Preview HTTP 仅允许 localhost、loopback、RFC1918/CGNAT 私有 IPv4 或本地 IPv6；HTTPS 仍可使用；
- 已有有效自定义 Relay 的 Preview 原位升级会保留设置；
- 更换或清除 Relay 会清理旧认证与同步状态；
- Stable 继续使用 production HTTPS 和公网默认行为。

## Candidate 与 Promotion 边界

`.github/workflows/android-preview-candidate.yml` 只从精确受保护 `main` 构建一次，审计 APK、唯一 signer 与 Bun-only 执行边界，生成 SHA-256、provenance、Mole 风格中英文说明和严格内容 manifest，对 APK 与 manifest 分别做 attestation，并上传保留 30 天的 Candidate artifact。它没有 contents-write 权限，不能创建 Release。

Candidate SHA-256 经 `scripts/preview-apk-allowlist.json` 审阅后，必须用同一 APK 完成实体 Android 原位升级和全新数据测试。Candidate 到 Promotion 只允许出现精确 allowlist 与 R86 Candidate evidence 文件。仓库 immutable releases 和禁止更新/删除 `android-preview-v*` 的 tag ruleset 是外部 Promotion 门禁，经 admin API 核实后以独立仓库变量持久化。`.github/workflows/android-preview-promote.yml` 只接受该 run id 和已测试 SHA-256，要求显式物理机验收，并复核 protected ref、精确审阅 delta、双 attestation、全部 manifest/provenance/audit 字段、发布前后五个精确资产、不可变 tag、`isImmutable=true` 与最终受保护 `main`。Promotion 不构建；若已存在完全一致的 immutable prerelease，可幂等成功。

## Candidate 前已完成

- URL/health policy 聚焦测试先红后绿；
- bootstrap policy 聚焦测试先红后绿，覆盖凭据删除失败和深链路由阻断；
- 两个 workflow 缺失时 hardening 测试为红，实现后转绿；
- GitHub admin API 已确认 immutable releases 启用；active、无 bypass 的 tag ruleset `19203462` 禁止更新和删除 `refs/tags/android-preview-v*`，对应仓库门禁变量已设置；
- 当前 App TypeScript 和 i18n 门禁通过。

最终评审加固 head 的本地 `bun run ci:fast` 已通过：repo hardening 19、Wire 33、CLI 585、Relay 119 / 332 assertions、App 809 / 3,268 assertions（89 个隔离文件）、dev/Preview lifecycle 35 / 194 assertions。两个 workflow 还通过 YAML parse、提取 Bash ShellCheck 和 `git diff --check`。PR [#16](https://github.com/jczhang02/lyntty/pull/16) 随后通过全部受保护检查，并以 `5b45d37989cc13a8eb2db1d46a8876a0c3227036` 合入。

## 首次 Candidate 中断

Candidate run [`29739227276`](https://github.com/jczhang02/lyntty/actions/runs/29739227276) 在 `:app:createBundleReleaseJsAndAssets` 中停止，尚未进入 APK audit、attestation 或 artifact 上传。该 run 的 artifact 数量为 0，也没有创建 Preview tag 或 Release。

本地使用相同 Expo `export:embed` 路径稳定复现了 `ResolveMessage is not constructable`。聚焦诊断还原出的原始错误是：`babel.config.js` 直接加载 `babel-preset-expo`，但 App 没有直接声明该依赖；因此 Bun 的 isolated workspace linker 正确阻止 Babel Core 访问 Expo 的传递依赖。该问题并非 `EMFILE` 或 GitHub runner 故障。

修复补充匹配的 `babel-preset-expo ~55.0.23` 直接构建依赖，并将真实 Preview Android bundle smoke 纳入 `ci:app`。修复前，`bun run --filter lyntty-app test:bundle` 可复现 exit 7 和 Candidate 错误；修复后，同一命令完成 3,182 个模块的 bundle，验证非空 13,068,103-byte 输出后删除隔离产物。

干净 staged snapshot 随后通过 `bun run ci:fast`：repo hardening 19、Wire 33、CLI 585、Relay 119 / 332 assertions、App 809 / 3,268 assertions（89 个隔离文件）及 Preview bundle smoke、dev/Preview lifecycle 35 / 194 assertions，以及 `git diff --check`。

## 尚未执行

- 修复后的 GitHub Candidate workflow；
- `920001` Candidate APK audit；
- 实体手机 `910003 → 920001` 原位升级；
- 清除数据后的强制 Relay 设置、Android 返回键、Clear Relay 重新门禁、配对、Pi 消息往返和重开；
- 公开 Promotion workflow。

当前没有由本工作创建的公开 Release。
