# R102 — Legacy Relay image-tag 配置漂移显式修复

日期：2026-07-22

分支：`fix/relay-tag-drift-repair`

Bead：`lyntty-24v.3`

## 线上证据与决策

受保护 run `29878472712` 将生产环境唯一 canonical `LYNTTY_RELAY_IMAGE_TAG` 分类为 `alternate-sha-tag`。该状态不属于有证据的 R65，不能作为另一套 prior runtime 放行。此次运行仍在 service stop、backup、schema migration 与 target start 前 fail-closed。

唯一支持的 operator repair，是把陈旧配置收敛到已经运行且有证据的 R65 runtime；这不授权迁移另一套正在运行的镜像。

## 修复边界

修改 `.env` 前，workflow 必须全部证明：

1. raw Compose 是受支持的 R65 variable layout；
2. source assignment 是同仓库唯一 canonical 的 alternate `sha-*` tag；
3. 只有一个 Relay container 在运行，且 Docker `Config.Image` 精确等于 `ghcr.io/jczhang02/lyntty-relay:sha-9752c689c927`；
4. running container image ID 等于本地 documented-tag image ID；
5. 该镜像只有一个同仓库 `RepoDigest`，并含 documented RepoTag；
6. pull immutable prior digest 后得到相同 image ID。

任何一项失败，都不会修复配置或停止服务。

Identity proof 通过后，repair 会：

- 创建 root-private、逐字节保留的 `.env` backup；
- stage 只修改 `LYNTTY_RELAY_IMAGE_TAG` 为正在运行的 documented tag 的文件；
- 安装前验证 staged Docker Compose image；
- stage root-private receipt；
- 原子安装 `.env`，确认 running container 未变，再安装 receipt；
- 在 receipt commit 前始终保持 EXIT/HUP/INT/TERM rollback trap；
- 任意失败都恢复 `.env` 与原 receipt 状态；恢复失败会写入 mode-600 `.rollback-incomplete` 并阻止重试。

Commit 后，原有 legacy image-layout migration 会从已验证的 running bytes 推导 prior immutable digest，并继续使用自己的 paired rollback。

## 验证

抽取的 remote-transaction seam 覆盖：

- stale-config repair 成功后继续 layout migration；
- 精确 final `.env`、private original backup、无值 receipt 与 idempotent retry；
- alternate running-container 拒绝；
- post-install validation failure 恢复；
- receipt-install failure 恢复；
- `.env` 安装后 TERM 中断恢复；
- restoration failure、mode-600 blocking marker 与 marker-based retry refusal；
- jq mock 对 staged `$expected` image 的真实校验；
- stdout/stderr/receipt 不输出 secret 或 alternate tag。

Repository hardening：`35 pass / 0 fail`；`bun audit`：clean；untrusted lifecycle scripts：`0`；YAML、全部五个 workflow shell block、error-level ShellCheck 与 `git diff --check`：通过。

## 残余风险

下一次受保护部署才是 live proof。如果 running container 不是 documented R65 runtime，本修复会在 mutation 前失败；operator 必须提供新的精确 image identity/provenance 证据，不能扩宽此路径。
