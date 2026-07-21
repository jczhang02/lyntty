# R94 — Release identity read 换行修复

日期：2026-07-22

分支：`fix/release-read-newline`

Bead：`lyntty-24v`

实现 commit：`cf0100501356861fc91538b60a368678e087b380`（本地 GPG signature 验证通过）。

## 失败

Stable Promotion run `29853303938` 已独立验证 Candidate `29849923597`、protected main 和 channel head，并安装 registry tools、登录 GHCR；随后在 `Promote existing Relay OCI bytes by digest` 第一行安全停止。

Process substitution 使用无末尾换行的 `process.stdout.write(...)` 输出 repository/digest。Bash `read` 虽填入字段，但在 EOF 返回非零，`set -e` 因此在 `skopeo inspect/copy`、image signing、资产准备、tag/Release 创建和生产部署前终止。没有 GHCR 写入或公开 Release。

生产 Relay deployment workflow 的八项 BOM identity read 也有同类潜在问题。

## 修复

两个 Bun producer 均改用保证末尾换行的 `console.log(...)`，使 Bash `read` 成功返回。Hardening tests 会绑定两个 `read` consumer 与 newline-terminated producer，并拒绝旧 `process.stdout.write` 形式。

Promotion 的 current-main gate 意味着本修复合并后 Candidate `29849923597` 会变旧；下次尝试必须从新的 protected main 重建全部 Candidate 字节。

## 验证

- hardening/redaction/Relay-SBOM：`32 pass / 0 fail`；
- 全部 workflow YAML 可解析；
- Promotion/deployment 的 `14` 个 shell blocks 均通过 `bash -n` 与 error-level ShellCheck；
- `git diff --check`：通过。

## 残余风险

Replacement Promotion 仍是真实 GHCR/Release transaction 测试。生产 Relay deployment 仍要求独立 protected environment 与可信 VPS inputs。
