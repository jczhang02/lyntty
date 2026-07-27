# R119 — Stable 前序路径可移植性

日期：2026-07-27

分支：`fix/stable-predecessor-paths`

Bead：`lyntty-mpr`

基线：`6bd9db80e1092616c781550165c1f797767dfc88`

## 观察到的发布失败

Stable Candidate run [`30236540399`](https://github.com/jczhang02/lyntty/actions/runs/30236540399) 从受保护 `main` 的 `6bd9db80e1092616c781550165c1f797767dfc88` 成功完成。唯一 Candidate artifact 绑定到预期身份 `compat-v1.2.1_1.2.1_1.2.1_0.2.0-s2`。

Promotion run [`30238922664`](https://github.com/jczhang02/lyntty/actions/runs/30238922664) 下载了这个精确 Candidate，并通过 attestation 和完整 checksum 验证。随后在发布前调用 Compatibility 历史验证时失败。保留 BOM 路径来自 Candidate 的首个构建 runner：

```text
/home/runner/work/_temp/candidate/predecessors/<tag>/compatibility-bom.json
```

bundle 在另一台 Promotion runner 上解包后，该绝对路径不再存在。GitHub 跳过了之后所有会产生变更的步骤，包括 Relay 镜像晋级、Release 资产准备、tag/Release 发布和 Latest 验证。失败后目标 tag 和 Release 均不存在。

## 根因

`release-candidate.yml` 将 `predecessorEntries[].path` 直接写入 `predecessor-paths.txt`。这些值是以 Candidate runner 的 `$RUNNER_TEMP` 为根的绝对路径。Candidate 组装在同一 runner 上读取该文件，因此能够通过；Promotion 在另一台 runner 上读取已封存的文件时，原临时根目录已经无效。

Stable sequence 1 没有前序版本，因此无法覆盖这条路径。Sequence 2 是首个暴露跨 runner 可移植性缺陷的 Stable Candidate。

## 修复

- Candidate 组装现在将每个保留 BOM 路径保存为相对于 Candidate 根目录的路径。
- Candidate 验证与 Promotion 仅接受 `predecessors/` 下符合 channel tag 形状的路径。
- 两个工作流都以当前 `$CANDIDATE` 根目录解析已验证路径，并要求对应 BOM 文件存在。
- 构建 runner 绝对路径和格式错误路径均 fail closed。

签名 BOM 本身已经使用相对于 artifact 根目录的引用；本次修改让内部历史验证输入与这一可移植模型保持一致。BOM 签名、前序链、source、sequence、Android `versionCode`、attestation、checksum、tag ruleset 和 immutable Release 门禁均未削弱。

## 测试先行验证

实现前先运行新增回归：

```text
bun test scripts/workflow-hardening.test.mjs
31 pass, 1 fail
```

失败项要求使用相对路径序列化并跨 runner 解析。实现后，测试会在 runner-A Candidate 根目录执行工作流中的序列化片段，将封存目录复制到不同的 runner-B 根目录，再执行两个工作流的 resolver block。覆盖有结尾换行与无结尾换行记录、sequence-1 空列表、旧绝对路径、穿越路径、空记录和格式合法但文件缺失的情况：

```text
bun test scripts/workflow-hardening.test.mjs
32 pass, 0 fail
```

工作流语法和 shell 验证：

```text
Ruby YAML parse：release-candidate.yml 与 release-promote.yml 通过
release-candidate.yml：15 个 Bash run block
release-promote.yml：9 个 Bash run block
全部 24 个 block：bash -n 与 shellcheck --shell=bash -S error 通过
git diff --check：通过
```

完整本地门禁：

```text
bun install --frozen-lockfile
bun pm untrusted
bun run ci:fast
```

结果：

- frozen install：通过；
- 不受信任的依赖脚本：`0`；
- repository hardening：`85 pass`、`0 fail`；
- 依赖审计：无漏洞；
- Wire：`36 pass`、`0 fail`；
- CLI：`606 pass`、`0 fail`；
- Relay：`119 pass`、`0 fail`；
- App：`863 pass`、`0 fail`，共 `98` 个文件、`3381` 条断言；
- 隔离开发脚本：`36 pass`、`0 fail`；
- 独立 docs install/audit/check：无漏洞，准备 `42` 个页面，MDX 生成与 TypeScript 检查通过。

## 发布状态与残余风险

失败的 Promotion 没有发布任何内容。受保护 Promotion 要求 Candidate source 仍然是当前受保护 `main`，因此必须先合并此工作流修复，再从新的精确 source 重建 Candidate，之后才能重试 Promotion。

Stable 可选政策下仍有意不执行实体 Android 验收。Production Relay 部署仍不在本发布任务范围内。只有受保护 Candidate 与 Promotion 继续证明重建 artifact、签名 BOM 历史、精确 source、Relay digest 和 immutable Release transaction 后，才能宣称本次发布完成。
