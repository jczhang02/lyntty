# Relay VPS 部署（中文同步说明）

> 同步状态（2026-07-21）：Bun-only 部署契约完整维护于英文版 [`relay-vps.md`](./relay-vps.md)。中文版以英文版的迁移、备份、`doctor`、fail-stop 与回滚要求为准。

生产部署只能解析当前、不可变、已签名 Stable BOM 中的 Relay digest，并在受保护 `production-relay` environment 内执行；本地验证不得冒充生产部署证据。

首次正式 rollout 前必须完成：

- `.env` 由 root 持有且 mode `0600`；
- 正好一个非空且 canonical 的 `LYNTTY_MASTER_SECRET=...`；禁止 `export`、前导空格、替代赋值或重复定义；历史 `HANDY_MASTER_SECRET` 要复制相同字节，不能顺便轮换；
- 当前 `LYNTTY_RELAY_IMAGE` 已从历史 mutable tag 转为经过核验的 `@sha256:` digest；
- 安装 `jq`、`curl`、`sha256sum`，并提供已核验的 `LYNTTY_VPS_KNOWN_HOSTS`；
- 备份路径、`.sha256` sidecar 和 restore/`doctor` 流程已演练。

Hardened deploy 会原子写入精确 Stable trust roots 与 minimum sequence，检查 Compose 和运行容器的 exact image digest，核验备份/sidecar，再执行 migrate 与 `doctor`。启动后，本地及公网 `/v1/version` 必须返回预期 BOM id、sequence、BOM hash、APK URL/hash；只有 `/health` 绿色不算验收。

Compose one-shot job 使用 `-T </dev/null`，不能消耗远端 `bash -s` 的脚本 stdin。一旦 schema mutation 开始，任何失败都保持 Relay 停机并保留 `.migration-incomplete`；schema mutation 前恢复旧 runtime 失败则写 `.rollback-incomplete`。必须人工确认 prior runtime 或 backup/restore 与 `doctor` 后才能继续。首次 Stable 尚无 predecessor rollback BOM，因此发布前必须另行记录并验证手工回滚方案。
