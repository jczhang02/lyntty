# Relay VPS 部署（中文同步说明）

> 同步状态（2026-07-21）：Bun-only 部署契约完整维护于英文版 [`relay-vps.md`](./relay-vps.md)。中文版以英文版的迁移、备份、`doctor`、fail-stop 与回滚要求为准。

生产部署只能解析当前、不可变、已签名 Stable BOM 中的 Relay digest，并在受保护 `production-relay` environment 内执行；本地验证不得冒充生产部署证据。

首次正式 rollout 前必须完成：

- `.env` 由 root 持有且 mode `0600`；
- 正好一个非空且 canonical 的 `LYNTTY_MASTER_SECRET=...`；禁止 `export`、前导空格、替代赋值或重复定义；历史 `HANDY_MASTER_SECRET` 要复制相同字节，不能顺便轮换；
- `LYNTTY_RELAY_IMAGE` 必须为经过核验的 `@sha256:` digest；受保护部署只允许从精确 R65 `LYNTTY_RELAY_IMAGE_TAG=sha-9752c689c927` 布局做一次 backup-first 迁移，禁止手工 `sed`；
- 安装 `jq`、`curl`、`sha256sum`，并提供已核验的 `LYNTTY_VPS_KNOWN_HOSTS`；
- 备份路径、`.sha256` sidecar 和 restore/`doctor` 流程已演练。

Hardened deploy 会在停服务前证明历史 Compose tag、运行容器、local image ID、唯一 GHCR `RepoDigest` 与可拉取 immutable digest 是同一组 bytes；随后 paired-backup 并原子迁移 Compose image scalar、digest env 和 `/opt/lyntty/backups:/backups` bind。任何 YAML/identity/digest/container 歧义都会在 service/database mutation 前停止。

正式事务会原子写入精确 Stable trust roots 与 minimum sequence，核验持久 backup/sidecar，再执行 migrate 与 `doctor`。启动后，本地及公网 `/v1/version` 必须返回预期 BOM id、sequence、BOM hash、APK URL/hash；只有 `/health` 绿色不算验收。

Compose one-shot job 使用 `-T </dev/null`，不能消耗远端 `bash -s` 的脚本 stdin。Schema mutation 前失败时，workflow 通过 root-private override 将 canonical `LYNTTY_MASTER_SECRET` 映射给旧 R65 runtime 所需的 `HANDY_MASTER_SECRET`，并验证 exact prior image bytes；恢复失败写 `.rollback-incomplete`。一旦 schema mutation 开始，任何失败都保持 Relay 停机并保留 `.migration-incomplete`。必须人工确认 prior runtime 或 backup/restore 与 `doctor` 后才能继续。首次 Stable 尚无 predecessor rollback BOM，因此仍需保留精确 predeploy backup 与 sidecar。
