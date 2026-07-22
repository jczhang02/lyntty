# R104 — 首次 Stable Relay 生产部署

日期：2026-07-22

分支：`docs/relay-production-evidence`

Beads：`lyntty-24v.3`、`lyntty-24v`

## 结果

首次已签名 Stable Relay 已完成持久备份、schema 检查、immutable OCI digest 部署，并通过独立公网验收。

- Stable release：`compat-v1.2.0_1.2.0_1.2.0_0.2.0-s1`
- Stable sequence：`1`
- release source：`39745de8dc9d7b7bfa6706320abbabb05c6cc3e1`
- protected deploy implementation：`7b6efde56e98415ab3474e7b6959eceaef7c25b0`
- target Relay digest：`sha256:a2fb96b60c48767b242f920a8a6e4f9637d0d50607a5787bc67a503cc39c64ed`
- production deploy run：`29883473315`
- job：`88809085030`
- GitHub deployment：`5548421896`，final status `success`

所有 workflow step 均成功，包括 signed BOM resolution、OCI attestation verification、pinned SSH trust、backup/migrate/doctor/deploy 与 public contract verification。

## Prior runtime 证明与 layout migration

线上 pre-Stable runtime 命中精确 R103 successor identity：

- tag：`sha-e243429200bd`
- source：`e243429200bd83288f1dac1454a2db43a4024003`
- prior index digest：`sha256:fe3bf95fd7e19cd34c3f94ff2aedeced9497535db797f07ba37241083dd8e83d`

Workflow 在 mutation 前要求 configured/running tag、container/local image ID、expected RepoTag、唯一同仓库 RepoDigest、immutable pull 与 hardcoded historical mapping 全部一致。随后通过 paired root-private backup，把 legacy variable image scalar 迁移到 immutable digest，并安装持久 `/backups` bind。

此前所有 diagnostic/deploy run 均保持 fail-closed：要么在 service mutation 前停止，要么只执行其证据中明确记录的 backup-first configuration canonicalization。成功部署没有遗留 incomplete marker；之后的 idempotent run 也通过了两个 marker guard。

## Backup 与 schema 证据

生产事务创建并验证了一份持久 PGlite predeploy backup：

- provider：`pglite`
- size：`112759908` bytes
- SHA-256：`57a8357256f0e9802ce9fc1ec310b2466f1566e8989a183620794d2e41ec80be`
- path class：`/backups/predeploy-compat-v1.2.0_1.2.0_1.2.0_0.2.0-s1-*.backup`
- checksum sidecar verification：`OK`

GitHub 对日志中时间戳 basename 的部分内容做了 mask；本文不会推测或伪造被隐藏的 bytes。

Migration/doctor 输出：

```text
Migrating database in /data/pglite...
No new migrations to apply.
Relay database provider: pglite
Applied migrations: 39
Pending migrations: 0
Schema compatibility: ok
```

Target container 已 recreate 并运行：

```text
ghcr.io/jczhang02/lyntty-relay@sha256:a2fb96b60c48767b242f920a8a6e4f9637d0d50607a5787bc67a503cc39c64ed
```

启动期间出现过短暂 connection reset；bounded health polling 随后成功，job 继续完成精确 local/public version checks。

## 公网生产验收

Workflow 完成后的独立请求返回：

```json
{"status":"ok","service":"lyntty-relay"}
```

真实 health response 还包含 server timestamp，上述证据刻意省略。

Stable Android 请求的 `POST /v1/version` 返回精确 contract：

```json
{
  "update_required": true,
  "version_name": "1.2.0",
  "version_code": 6,
  "apk_url": "https://github.com/jczhang02/lyntty/releases/download/compat-v1.2.0_1.2.0_1.2.0_0.2.0-s1/lyntty-stable.apk",
  "update_url": "https://github.com/jczhang02/lyntty/releases/download/compat-v1.2.0_1.2.0_1.2.0_0.2.0-s1/lyntty-stable.apk",
  "sha256": "27ee7a3f7adf5f6634129559c8b35b2b1c903f90b0387b45e3a39531b40bede0",
  "release_channel": "stable",
  "bom_release_id": "compat-v1.2.0_1.2.0_1.2.0_0.2.0-s1",
  "bom_sequence": 1,
  "bom_sha256": "df231effa7b3047fb7acdd400cff49434494012b8e17767aee72f1d7049a8bca"
}
```

## 幂等性

同一 BOM 的第二次 owner-approved dispatch 成功：

- run：`29883633696`
- job：`88809570425`
- result：`requested Stable BOM is already healthy, exact, and deployed`

Replay log 中没有 backup JSON、migration、doctor 或 container recreation 输出。它验证了 recorded sequence/BOM、target image identity、local health、完整 local version contract 与 public version contract，未重新部署。

## 命令与检查

- GitHub protected deployment 与 idempotent replay：成功。
- GitHub deployment API final state：`success`。
- public `GET /health`：成功。
- public Stable `POST /v1/version`：精确匹配 release/BOM/APK。
- 独立下载的 Release `compatibility-bom.json`：SHA-256 `df231effa7b3047fb7acdd400cff49434494012b8e17767aee72f1d7049a8bca`，与生产精确一致。
- target OCI digest：精确等于 signed BOM digest。
- persistent backup + `.sha256` sidecar：已验证。
- migration 与 `doctor`：39 applied、0 pending、schema compatible。

## 未执行与残余风险

- 本次 owner-use Stable 没有执行 Android 实体机测试；已发布 owner waiver 仍是 authority。
- 没有执行 destructive production rollback。Rollback 与 failed-restoration behavior 已由 isolated workflow hardening tests 覆盖；predeploy backup 与 sidecar 仍作为 production rollback artifact 保留。
- iOS 与 Google Play 不在范围内。
