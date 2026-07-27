# R118 — Stable Compatibility 1.2.1 发布准备

日期：2026-07-26

分支：`release/stable-1.2.1`

Bead：`lyntty-mpr`

基线：`57ae1ccf0bff974b29bd7dcf7e356b06fa648ed4`

## Release identity

下一组 Stable Compatibility 计划版本为：

| 组件 | 版本 |
| --- | --- |
| App | `1.2.1` |
| CLI + `lynttyd` | `1.2.1` |
| Relay | `1.2.1` |
| Wire | `0.2.0` |

计划中的 immutable identity：

```text
Sequence: 2
Android versionCode: 7
Tag: compat-v1.2.1_1.2.1_1.2.1_0.2.0-s2
Predecessor 1: compat-v1.2.0_1.2.0_1.2.0_0.2.0-s1
Predecessor 2: empty
```

App 与 CLI 在 Stable sequence 1 之后包含 runtime 变更，包括 Sessions Home 渐进检索，以及 daemon 的持久增量 Pi session index。Relay artifact 输入也因 `find-my-way` 等 runtime dependency 安全升级而变化，因此这三个组件均提升一个 patch 版本。Wire schema 与 protocol negotiation 没有变化，继续使用 `0.2.0`。

`bun.lock` 包含同样的三个 workspace version 更新；Relay runtime identity 回归测试预期 `1.2.1`。

## Source 中包含的政策

R117 只修改 Stable 的实体设备政策：验收改为可选；false 要求 accepted hash 为空且不在 Release 正文添加 warning；true 仍绑定精确 Candidate APK SHA-256。APK-only Preview 和所有非设备 supply-chain 门禁保持不变。

## 本地验证

```text
bun install --frozen-lockfile
bun pm untrusted
bun run ci:fast
```

结果：

- frozen install：通过；
- untrusted dependency script：`0`；
- repository hardening：`84 pass`、`0 fail`；
- dependency audit：无漏洞；
- Wire：`36 pass`、`0 fail`；
- CLI：`606 pass`、`0 fail`；
- Relay：`119 pass`、`0 fail`；
- App：`863 pass`、`0 fail`，`98` 个文件共 `3381` 项 assertion；
- isolated development scripts：`36 pass`、`0 fail`；
- `git diff --check`：通过。

其他 release-policy 检查：

```text
bun test --timeout 20000 scripts/workflow-hardening.test.mjs \
  scripts/release-agent-rules.test.mjs scripts/evidence-redaction.test.mjs
39 pass, 0 fail

Ruby 解析 .github/workflows/release-promote.yml
9 个 Promotion run block：bash -n 与 shellcheck -S error
packages/lyntty-relay: bun test --isolate sources/standalone.spec.ts
6 pass, 0 fail
```

文档站使用独立 frozen install 验证：

```text
cd docs/.site
bun install --frozen-lockfile
bun audit --audit-level=high
bun run docs:check
```

结果：无漏洞，准备 42 个页面，MDX 生成与 TypeScript 检查通过。

第一次 `ci:fast` 在 package gate 前停止，因为本地 task worktree 中缺少三条已跟踪的 cross-agent guidance symlink。恢复精确 `HEAD` 中的 `CLAUDE.md` 和两条 `.claude/skills/*` symlink 后，该环境问题消失，完整 rerun 全部通过。最终运行中没有 product 或 release-policy assertion 失败。

## 发布状态

发布准备阶段没有创建 Candidate workflow、tag、GitHub Release、GHCR promotion 或 production Relay deployment。Candidate 与 Promotion 仍必须来自执行时精确的受保护 `main`；任何 source drift 都会使 Candidate 失效并要求重建。

## 未运行项与残余风险

- 真正 production-signed APK、五个平台 CLI archive、multiarchitecture Relay OCI layout、签名 BOM、provenance 和 attestation 只由受保护 Candidate workflow 生成，本地检查不对此作出声明。
- R117 明确不要求实体 Android 验收。本次没有声称完成实体机安装、启动或 phone-to-Relay-to-`lynttyd` 往返。
- Production Relay deployment 不在本 release task 范围内，仍需要单独授权和 `production-relay` 审批。
