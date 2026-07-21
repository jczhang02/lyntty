# R97 — 生产 Relay legacy master-secret key

日期：2026-07-22

分支：`fix/relay-legacy-secret`

Bead：`lyntty-24v.2`

## 生产证据

受保护部署 run `29864206703` 重新验证 current protected main、immutable Stable Release、签名 BOM、精确 Relay OCI digest 与 attestations，并通过 pinned SSH trust 登录；随后因 `LYNTTY_MASTER_SECRET` recognized assignments 为 0，在 backup、停服务、migration、configuration write 和 container replacement 前安全停止。

这会细化 R95，而不是削弱门禁。已有部署证据 R65 明确记录 schema-1 VPS `.env` 使用 `HANDY_MASTER_SECRET`；R80 与部署指南要求在 schema-2 boundary 前把完全相同的 bytes 迁移到 `LYNTTY_MASTER_SECRET`。

## 修复

Canonicalization primitive 仅在以下条件同时成立时接受 `HANDY_MASTER_SECRET`：

- `LYNTTY_MASTER_SECRET` 完全不存在；
- legacy key 恰好一个 canonical 或 exported assignment；
- 文件没有 UTF-8 BOM 或 hidden/noncanonical target assignment；
- ambient-isolated Docker Compose render 能证明 transform 前 target key 不存在；
- 原始值非空，transform 后实际 service value 不是空值、纯空白或 comment-only。

流程先创建 root-private `0600` backup，只在同目录 staged file 中替换 key prefix，验证 raw value 逐字节相同且 legacy assignment 已消失，再 atomic install；receipt 只记录 key/form/backup metadata。Aliases coexist、duplicate legacy keys、semantic empty、BOM-hidden target、parser failure 或 value change 均 fail-closed；post-transform validation 失败会 atomic restore 并验证原始 bytes 与权限。

原有 signed-BOM、digest、attestation、protected-main、SSH、prior-runtime、incomplete-migration、backup、migrate、doctor、rollback、本地 health/version 和公网 version gates 均不变。

## 验证

- behavioral tests 覆盖 canonical/exported legacy forms、精确 backup 与 mode、byte-preserved value、幂等 retry、coexistence、duplicates、semantic empty、ambient override、BOM-hidden target、restore 和 secret non-output；
- hardening/redaction/Relay-SBOM：`33 pass / 0 fail`；
- 全部 workflow YAML 可解析；
- Relay deployment 的 `5` 个 shell blocks 均通过 `bash -n` 与 error-level ShellCheck；
- `git diff --check`：通过。

## 残余风险

下次 protected deployment 才能证明生产环境仍是恰好一个受支持 legacy assignment，且 Compose model 能通过 `env_file` 暴露 renamed target。任何不符仍会在 service mutation 前 fail-closed。
