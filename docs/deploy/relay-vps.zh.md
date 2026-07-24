# Relay VPS 部署（中文同步说明）

> 同步状态（2026-07-23）：Bun-only 部署契约完整维护于英文版 [`relay-vps.md`](./relay-vps.md)。中文版以英文版的迁移、备份、`doctor`、fail-stop 与回滚要求为准。

生产部署只能解析当前、不可变、已签名 Stable BOM 中的 Relay digest，并在受保护 `production-relay` environment 内执行；本地验证不得冒充生产部署证据。

Android app、`lynttyd` 和显式 operator `lyntty remote` client 可以连接 Relay；只有 `lynttyd` 负责 node-side Pi session bridge，Pi extension 仍只连接本机 daemon。

首次 Stable rollout 已按 `docs/evidence/r104-stable-relay-production-deployment.md` 完成；后续 deployment 必须继续满足：

- `.env` 由 root 持有且 mode `0600`；
- 正好一个非空且 canonical 的 `LYNTTY_MASTER_SECRET=...`；禁止 `export`、前导空格、替代赋值或重复定义；历史 `HANDY_MASTER_SECRET` 要复制相同字节，不能顺便轮换；
- `LYNTTY_RELAY_IMAGE` 必须为经过核验的 `@sha256:` digest；受保护部署只允许从两个经审计的生产身份做一次 backup-first 迁移：R65 `sha-9752c689c927` → `sha256:2eb926b37741e9b047b6e6f178ffdb0e84ed41c6649180421b3f4861838ff715`，或后续已部署的 `sha-e243429200bd` → `sha256:fe3bf95fd7e19cd34c3f94ff2aedeced9497535db797f07ba37241083dd8e83d`（R103）；禁止手工 `sed`；
- 安装 `jq`、`curl`、`sha256sum`，并提供已核验的 `LYNTTY_VPS_KNOWN_HOSTS`；
- 备份路径、`.sha256` sidecar、migration 与 `doctor` 已在正式 rollout 中验证；compiled/isolated restore coverage 已通过，但 VPS copied-data 或 maintenance-window restore drill 仍待执行，不能冒充已完成。

Hardened deploy 会在停服务前证明历史 Compose tag、运行容器、local image ID、expected RepoTag、唯一 GHCR `RepoDigest`、可拉取 immutable digest 与精确 tag-to-digest mapping 是同一组 bytes；随后 paired-backup 并原子迁移 Compose image scalar、digest env 和 `/opt/lyntty/backups:/backups` bind。任何未列出的 runtime tag/digest 或 YAML/identity/container 歧义都会在 service/database mutation 前停止。R102 例外只把 stale configuration 修回已精确证明的 R65 running bytes，不会把未列出的 configured SHA 当作 runtime 接受。后续 Stable N→N+1 upgrade 只从配对且 root-owned mode-600 的 `deployed-bom.txt` 与 `deployed-sequence.txt` 接受 canonical predecessor digest，并继续执行 running-byte check。

正式事务会原子写入精确 Stable trust roots 与 minimum sequence，核验持久 backup/sidecar，再执行 migrate 与 `doctor`。启动后，本地及公网 `/v1/version` 必须返回预期 BOM id、sequence、BOM hash、APK URL/hash；只有 `/health` 绿色不算验收。

Compose one-shot job 使用 `-T </dev/null`，不能消耗远端 `bash -s` 的脚本 stdin。Schema mutation 前失败时，workflow 通过 root-private override 将 canonical `LYNTTY_MASTER_SECRET` 映射给经验证的 pre-Stable runtime 所需的 `HANDY_MASTER_SECRET`，并验证 exact prior image bytes；恢复失败写 `.rollback-incomplete`。一旦 schema mutation 开始，任何失败都保持 Relay 停机并保留 `.migration-incomplete`。必须人工确认 prior runtime 或 backup/restore 与 `doctor` 后才能继续。首次 Stable 尚无 predecessor rollback BOM，因此仍需保留精确 predeploy backup 与 sidecar。
