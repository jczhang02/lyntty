# R95 — 生产 Relay legacy `.env` canonicalization

日期：2026-07-22

分支：`fix/relay-env-canonicalization`

Bead：`lyntty-24v`

## 失败

生产部署 run `29858379372` 已验证 immutable Stable Release、签名 BOM、精确 Relay OCI digest、attestations、protected main 与 pinned SSH host key，并成功登录 VPS；随后因现有 `LYNTTY_MASTER_SECRET` 不是唯一 canonical unprefixed assignment，在停服务、修改 `.env`、备份、迁移和替换容器之前安全停止。

该失败只证明 legacy environment 需要窄迁移，不能据此 source `.env`、在重复值中选择、打印 secret 或削弱 canonical-state gate。

## 修复

受保护部署只接受两种 required assignment：已经是唯一 `KEY=value`，或恰好一个可在不改变原始值的前提下规范化的 exported assignment。

第二种情况会：

- 拒绝 missing、duplicate、empty、unsupported、symlink 或 ambiguous 状态；
- 先创建 root-private `0600` backup；
- 在同目录独立 `0600` 文件中转换并 atomic rename；
- transform/inspection/install 失败时保持原文件不变；
- unset 相关 ambient variables，并通过 `docker compose --env-file .env config --format json` 验证实际 rendered `lyntty-relay` service environment/image；
- 拒绝 semantic empty、纯空白和 comment-only deployed value；
- rendered-config 失败时 atomic restore 精确 backup，并验证 bytes 与 `root:600`；
- 只向非 symlink `0600` receipt 写入 key/form/backup metadata，绝不写入值。

原有 incomplete-migration、rollback、prior runtime、backup、doctor、digest、本地 `/health`、本地 `/v1/version` 和公网 `/v1/version` gates 均保留。

## 验证

- hardening/redaction/Relay-SBOM：`33 pass / 0 fail`；
- behavioral tests 覆盖两个 required keys、精确 backup bytes/modes、幂等 retry、duplicates/missing/raw 与 semantic empty、comment-only、ambient override isolation、parser-failure restore、secret non-output 和 dangling receipt symlink；
- 全部 workflow YAML 可解析；
- Relay deployment 的 `5` 个 shell blocks 均通过 `bash -n` 与 error-level ShellCheck；
- `git diff --check`：通过；
- 最终对抗复核：`PASS`，无 P0/P1/P2。

## 残余风险

下次 protected deployment 才能验证真实生产 Compose 与 legacy assignment form。任何超出“恰好一个可安全规范化 exported assignment”的状态仍会 fail-closed，并要求显式 operator repair。
