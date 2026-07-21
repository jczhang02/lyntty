# R93 — Stable Promotion bootstrap 顺序

日期：2026-07-22

分支：`fix/stable-promotion-bootstrap`

Bead：`lyntty-24v`

实现 commit：`555808b9b73b35a895a6393b8b080468a12708c3`（本地 GPG signature 验证通过）。

## 失败

Stable Promotion run `29848838205` 在 `Validate protected promotion request` 以 `bun: command not found` 安全停止。actor、protected ref、immutable Release、tag ruleset 和明确 owner waiver 均已通过，但 workflow 在后面的 `Setup Bun` 之前用 Bun 解析 `gh run view` 输出。

失败发生在 Candidate 下载、GHCR login/push、image signing、资产准备、tag/Release 创建和生产部署之前，没有发布副作用。

## 修复

Pre-bootstrap Candidate-run identity 检查改用 runner 已有的 `jq`。真正的 Bun 命令仍在 pinned `Setup Bun` 后执行。Regression assertion 会扫描 `Setup Bun` 前的全部 workflow 文本，拒绝任何 Bun command，并要求 Candidate workflow identity 检查存在。

Promotion 要求 Candidate source 等于当前 protected `main`，因此本修复合并后 Candidate run `29844664891` 会变旧。必须从新的 protected main 重建全部字节；不得复用失败 Promotion 或 stale Candidate。

## 验证

- hardening/redaction/Relay-SBOM：`32 pass / 0 fail`；
- 全部 workflow YAML 可解析；
- Promotion workflow 的 `9` 个 shell blocks 均通过 `bash -n` 与 error-level ShellCheck；
- `git diff --check`：通过。

## 残余风险

本修复通过静态检查和 protected PR CI 证明 bootstrap 顺序。Replacement Promotion 仍是端到端发布测试，必须继续通过全部 immutable identity 与 byte gates。
