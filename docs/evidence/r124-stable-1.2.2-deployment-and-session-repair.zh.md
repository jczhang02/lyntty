# R124 — Stable 1.2.2 生产部署与目标会话修复

日期：2026-07-27

分支：`docs/r124-stable-1.2.2-deployment`

Beads：`lyntty-eci`，后续 `lyntty-ea7`

Release：[`compat-v1.2.2_1.2.2_1.2.2_0.2.0-s3`](https://github.com/jczhang02/lyntty/releases/tag/compat-v1.2.2_1.2.2_1.2.2_0.2.0-s3)

## 结果

Stable 1.2.2 已部署到生产 `relay`，本机 `lyntty`/`lynttyd` 也已更新。目标 Pi 会话通过 canonical Pi JSONL 修复到了原有 Relay 行中：

| 项目 | 修复前 | 修复后 |
| --- | --- | --- |
| 生产 Relay | 较早的 Stable runtime | `1.2.2`，OCI `sha256:65d782...6447` |
| 本机 CLI / `lynttyd` | `1.2.0` | `1.2.2@f2b22a4` |
| daemon PID | `2891` | `1266556` |
| 服务 PATH | 没有 `/opt/bin` | 包含 `/opt/bin` |
| Relay session ID | `cmrwsbw3x015n01mrbagof44g` | 未变化 |
| Relay seq | `1034` | `9021` |
| append checkpoint | `3c3f1042` | `c2068e99` |
| 目标 metadata | 残留 `history_gap` 原因 | `ready`，`piHasHistoryGap=false` |
| canonical 名称 | 原有有效标题 | `lyntty notification upgrade session optimization` |

本次修复新增了恰好 `7,987` 条 canonical session-protocol 记录，每条都使用唯一、确定性的 localId。严格结果为 `7,987 matching`、`0 missing`、`0 conflicting`、`0 outbox conflicts`。stable tag 仍只对应一个原有 Relay session，没有创建重复 runtime 或 Relay 行。

## 生产 Relay 部署

受保护工作流 [`30261452266`](https://github.com/jczhang02/lyntty/actions/runs/30261452266) 从受保护的 `main@5a64b6348c278c39d67528328e8de287159e0836` 部署。不可变 Release 源提交 `f2b22a4da144627aef485e984de9aa2324bbc08c` 是该提交的祖先。GitHub `production-relay` Deployment `5621505334` 最终状态为 `success`。

工作流解析签名 s3 BOM 后固定到：

```text
ghcr.io/jczhang02/lyntty-relay@sha256:65d7823d1938f36867c2a798c7cb37a20b1e60cb9d93cb5bb4c40c100d546447
```

迁移前写入并通过 sidecar 校验的 PGlite 备份大小为 `162,703,305` 字节：

```text
/backups/predeploy-compat-v1.2.2_1.2.2_1.2.2_0.2.0-s3-20260727T112130Z.backup
SHA-256 a7f3415fbad5417bdfc2764391665de7d88390f670388f700b2fefe692a0d56f
```

迁移检查结果为已应用 `39`、待应用 `0`、schema compatibility `ok`。随后工作流核验了精确镜像 revision/version、本地 health、公共 health 以及完整的签名 BOM/APK 响应。修复后再次请求，结果仍为 `status=ok`、App `1.2.2`、`versionCode=8`、s3 sequence `3`、BOM SHA-256 `9453da...8b2b`、APK SHA-256 `5ccb63...caae`。

## 本机签名更新

已安装的 1.2.0 updater 使用 Stable 信任根验证并选中了精确的 Linux x64 产物：

```text
Archive: lyntty-cli-1.2.2-linux-x64.tar.gz
Size: 93,642,529 bytes
SHA-256: 1722b8dcc0a0c3f0ec3ee48b73e717541b671db8659f858883d37425855a1ca5
Manifest SHA-256: d5b3666941ffeb14c3f80f57b1aa603e55b0e2bdbfcca0b9d2a16cb311c04b84
```

候选 self-check 校验了 `178` 个文件、源提交 `f2b22a4`、CLI/daemon `1.2.2`、目标 `linux-x64-glibc` 和 Wire protocol `1.1`。原子 updater 停止旧服务、替换托管扩展和 `current` 指针、重装用户服务、启动匹配版本的 daemon，并且只在 daemon health identity 一致后提交。回滚状态保留 `lyntty-cli-1.2.0-linux-x64` 作为上一个 known-good Release。

最终 unit 直接运行 `current/lynttyd`，PATH 为：

```text
PATH=/home/jc/.local/bin:/home/jc/.cargo/bin:/opt/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin
```

最终 daemon PID `1266556` 持续处于 `active/running`，报告 Release `lyntty-cli-1.2.2-linux-x64`；从最后一次受控启动起 `NRestarts=0`。

## Canonical 数据与 active runtime 安全

active Pi 进程没有被停止、发信号、reload 或替换：

```text
PID: 1078376
start ticks: 38315346
executable: /opt/pi-coding-agent/pi
cwd: /home/jc/dev/lyntty
extension instance: 23382957-400e-42bd-99d4-787fc74a68db
```

同一个 extension instance 已连接到最终 daemon。Updater 将磁盘上的托管扩展从 SHA-256 `27ccaa...a56` 更新为 `0128a7...44f`，供后续新会话使用，但没有对运行中的 Pi 强制执行 `/reload`。

Canonical JSONL 的 inode 始终为 `10357666`。更新前完整的 `22,056,176` 字节前缀在部署和修复后逐字节一致：

```text
SHA-256 d053f3b7be83c72780e9920d7bdcf9e7c9ffba64746bb9c25713f70eb1b807f1
```

active 根 checkout 也一直停在 `4043171d3b6e89ef32a5a7a3c56d5c7b7ab9b40c`，原有 status 摘要未变化。没有发生 canonical JSONL 重写、根目录 pull、Pi 重启、扩展 reload 或会话替换。

## 自动恢复阻塞与受限修复

1.2.2 daemon 首次重启后正确地 fail-closed，没有盲目 replay。它的启动 inventory 总预算为 `10,000 ms`，同时需要从 seq 0 开始分页读取 Relay history。只读生产测量结果为：

```text
1,034 messages
11 pages of 100
51,362 ms cold elapsed
```

缓存预热后的严格、精确 Release inventory 找到 `7,987` 个缺失 canonical envelope，冲突为零。因此 checkpoint 正确地保持在 `3c3f1042`，没有把失败的自动恢复误判为成功。

直接延长启动预算会破坏 Session Remote 的有界打开要求，所以现场修复只在停止 `lynttyd` 的时间内执行一次精确 Release reconciliation。它复用了 1.2.2 已提交的 `ApiSessionClient`、canonical mapper、分组、冲突处理、encrypt-once outbox 和 checkpoint 持久化，只把 inventory/ACK 预算显式调整为 `180 s`/`600 s`。临时修复源码 SHA-256 为 `3565da...3f81`；证据中没有保存 token、key、ciphertext 或私有消息内容。

只有得到以下严格结果后，checkpoint 才推进：

```text
sent: 7987
matching: 7987
missing: 0
conflicting: 0
outboxConflictLocalIds: []
contiguousAppendCheckpointEntryId: c2068e99
```

独立的修复后 Relay 审计进一步确认：

- Relay seq 恰好从 `1034` 变为 `9021`；
- seq `1035..9021` 恰好有 `7,987` 行和 `7,987` 个唯一 canonical localId；
- delta 内每个 localId 都以 `session:pi-history-` 开头；
- 最新 50 个解密 envelope 全部满足 `localId == session:<envelope.id>`；
- 最高一行为 `session:pi-history-a5d093ae-end`，事件类型是 `turn-end`；
- 加密 metadata 版本为 `13`，指向目标 Pi session，且 `runtimeOwner=pi-extension`、`controlState=ready`、`piHasHistoryGap=false`，没有 recovery reason；
- 最终 daemon 日志包含目标 extension heartbeat，不包含该目标的 inventory、conflict 或 `history_gap` 警告。

## 验证产物

- [`artifacts/r124/relay-deployment.json`](./artifacts/r124/relay-deployment.json)
- [`artifacts/r124/local-update-repair.json`](./artifacts/r124/local-update-repair.json)
- [`artifacts/r124/repair-target-session.ts.txt`](./artifacts/r124/repair-target-session.ts.txt)
- [`artifacts/r124/verification.log`](./artifacts/r124/verification.log)

临时修复的精确源码以不可执行的历史证据形式保留，SHA-256 与 `3565da...3f81` 一致。它不是受支持的运维命令：源码固定到本次单一会话，依赖外部受控事务先停止 `lynttyd`，不得再次执行。JSON 产物只保留选定的身份和聚合结果。Credentials、Release 信任材料、请求头、加密 payload、配对 URL 和私有消息文本均未写入证据。

Evidence 变更通过了仓库 hardening（`85/85`）、root 与 docs 依赖审计（无漏洞）、docs prepare/MDX/TypeScript 检查（`42` 个页面）、JSON 解析、本地链接、双语结构、选定敏感模式扫描和空白检查。在保留历史修复源码并澄清 deployment 时间字段后，独立现场状态 verifier 与 evidence reviewer 均返回 `VERIFIED_NO_P0_P1_P2`。

## 未执行与残余风险

- 没有执行或声称实体 Android 手机安装、启动、timeline 目测或 phone-to-Relay-to-`lynttyd` 往返。服务端最新 tail 的解密和绑定审计已通过，但这不等于实体设备验收。
- 没有强制 reload Pi extension，也没有重启 Pi 进程。
- 部署后没有重复运行完整仓库门禁，因为部署源码和产物均不可变，且已经通过 R122/R123 Candidate 与 Promotion 门禁。本次仅新增 evidence，并已运行上述文档/仓库检查。
- 生产规模 inventory 仍是产品缺陷。`lyntty-ea7` 跟踪可恢复或紧凑 inventory 设计，要求同时保留有界打开和严格 localId 语义。另有三个 active Pi session 记录了相同的 fail-closed timeout；本次目标修复没有修改它们。
- 目标会话当前在 checkpoint `c2068e99` 上是安全的；如果大型 Relay session 未来再次丢失或遇到 stale checkpoint，应优先完成后续产品修复，而不是继续临时放大 timeout。
