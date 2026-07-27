# R122 — Stable Compatibility 1.2.2 发布准备

日期：2026-07-27

分支：`release/stable-1.2.2`

Bead：`lyntty-90z`

基线：`4a20aec65b76e3aa005be23402a12fc9a4fd80f9`

## 发布身份

下一组 Stable Compatibility 组件为：

| 组件 | 版本 |
| --- | --- |
| App | `1.2.2` |
| CLI + `lynttyd` | `1.2.2` |
| Relay | `1.2.2` |
| Wire | `0.2.0` |

计划中的不可变身份为：

```text
Sequence: 3
Android versionCode: 8
Tag: compat-v1.2.2_1.2.2_1.2.2_0.2.0-s3
Predecessor 1: compat-v1.2.1_1.2.1_1.2.1_0.2.0-s2
Predecessor 2: compat-v1.2.0_1.2.0_1.2.0_0.2.0-s1
```

当前不可变 Stable Latest 为 sequence `2`、Android `versionCode` `7`、Release ID `360246346`，源提交为 `f9698f4930294ee38ff914dfa6d7d0705bebc485`。Sequence `3` 同时推进两个单调坐标，并保留“当前版本加两个前序版本”的完整 Stable 支持窗口。

## 组件版本决策

App、CLI 和 Relay 在 Stable 1.2.1 之后均有变化：

- App 集成 canonical Pi 名称持久化、稳定 tag 删除墓碑、generation 安全的渐进发现、延迟分页防回退和权威历史 cursor。
- CLI/`lynttyd` 集成单次加密 outbox 重试、精确 localId inventory、append checkpoint 恢复、渐进历史覆盖、有界 metadata ACK、managed runtime rebind 安全和修正后的 service PATH。
- Relay 在继续严格拒绝“同 localId、不同密文”的同时，返回结构化 localId 内容冲突。

因此这三个组件升级到 `1.2.2`。Wire schema、协议 `1.1` 和 capability 协商没有变化，Wire 保持 `0.2.0`。

`bun.lock` 同步记录三个 workspace 版本更新。Relay standalone build identity 回归测试期望 `1.2.2`。

## 测试先行的版本绑定

三个 package 身份和 lockfile 升级后，尚未更新的 Relay identity 测试按预期失败：

```text
Expected version: 1.2.1
Received version: 1.2.2
5 pass, 1 fail
```

更新显式发布身份断言后：

```text
packages/lyntty-relay: bun test --isolate sources/standalone.spec.ts
6 pass, 0 fail
```

该回归可防止 package metadata 与编译后的 Relay runtime identity 独立漂移。

## 本地验证

```text
bun install --frozen-lockfile
bun pm untrusted
bun run ci:fast
```

结果：

- frozen install：通过；
- 不受信任依赖脚本：`0`；
- repository hardening：`85 pass`、`0 fail`；
- 依赖审计：无漏洞；
- Wire：`36 pass`、`0 fail`；
- CLI：`656 pass`、`0 fail`；
- Relay：`120 pass`、`0 fail`；
- App：`878 pass`、`0 fail`，`99` 个文件共 `3411` 个断言，bundle smoke 通过；
- 隔离开发脚本：`36 pass`、`0 fail`；
- 独立 docs frozen install/audit/check：无漏洞，准备 `42` 个页面，MDX 生成与 TypeScript 检查通过；
- `git diff --check`：通过。

## 发布状态

发布准备期间未触发 Candidate workflow，未创建 tag、GitHub Release 或 GHCR promotion，也未部署生产 Relay、更新本机 CLI、重启 daemon、reload extension 或修复现场会话。

Candidate 与 Promotion 必须从触发时精确的受保护 `main` 运行。Candidate 必须使用 Stable sequence `3`、Android `versionCode` `8` 和上述两个精确 predecessor。Promotion 必须消费这一精确成功 Candidate，且不得重新构建任何 artifact。

## 未执行项与剩余风险

- 生产签名 APK、五个平台的 standalone CLI archive、多架构 Relay OCI layout、签名 BOM、SPDX SBOM、provenance 和 attestation 只由受保护 Candidate workflow 生成，本阶段不作声明。
- 未执行或声明实体 Android 验证。Promotion 必须使用 workflow 输入 `physical_phone_accepted=false` 和空的 `accepted_android_apk_sha256`；生成的 schema-2 `android-validation.json` 会记录 `mode: false`、`physicalPhoneAccepted: false`、`authorizationMode: "optional-not-performed"` 以及精确 Candidate `apkSha256`。
- 生产 Relay 部署以及本机 `lyntty`/`lynttyd` 更新属于发布后的独立操作。
- workflow 生成的 Release notes 保持权威；本次不包含 curated title/body 编辑。
- Preview、Expo Dev、native-signing staging、rollback、现有 tag 和现有 Release 均未触碰。
