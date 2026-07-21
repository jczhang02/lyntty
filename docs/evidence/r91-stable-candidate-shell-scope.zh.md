# R91 — Stable Candidate BOM shell scope 恢复

日期：2026-07-21

分支：`fix/stable-candidate-shell-scope`

Bead：`lyntty-24v`

实现 commit：`23dfb77dacd42df3bad2596b32a4252d7ca1a427`（本地 GPG signature 验证通过）。

## 失败

Replacement Stable Candidate run `29832857951` 基于 protected main `9dd1e91e8c7c8bd31003e7053cef4afbdf81beb0`。五平台 CLI、生产签名 Android APK、Relay multiarch OCI 和新的双平台 Syft/SPDX 均通过，随后在 `Assemble, sign, and verify immutable Compatibility BOM` 安全停止。

原因是 `CANDIDATE` 只作为 heredoc Bun process 的单命令 environment prefix：

```sh
CANDIDATE="$RUNNER_TEMP/candidate" bun - <<'BUN'
```

该 process 退出后，`set -u` 正确拒绝后续未绑定的 `$CANDIDATE`。因此 run 没有 assemble/sign BOM、seal/upload Candidate bundle、创建 tag/Release、push GHCR 或部署生产。GitHub 仅保留 Buildx 自动诊断 artifact `jczhang02~lyntty~R8HLIC.dockerbuild`（artifact ID `8497144754`）；它不是可 Promotion 的 release input。

## 修复

Workflow 现在先设置并导出 shell variable：

```sh
CANDIDATE="$RUNNER_TEMP/candidate"
export CANDIDATE
bun - <<'BUN'
```

同一值会同时提供给 Bun inventory generator 与后续全部 BOM assemble/sign/verify 命令。静态 regression assertion 要求精确 export，并拒绝旧的单命令 environment prefix。

## 验证

- `bun run test:repo-hardening`：`30 pass / 0 fail`；
- 全部 workflow YAML 可解析；
- Candidate workflow 的 `15` 个 shell blocks 均通过 `bash -n` 和 error-level ShellCheck；
- `git diff --check`：通过。

Replacement Candidate 必须从包含此修复的新 protected main 重建全部字节；不得复用失败 runs `29825007418` 或 `29832857951` 的任何字节。
