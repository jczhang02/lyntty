# R98 — 生产 Relay legacy image layout

日期：2026-07-22

分支：`fix/relay-legacy-image`

Bead：`lyntty-24v.3`

## 生产证据

受保护部署 run `29866546707` 重新验证 protected main、immutable Stable Release、签名 BOM、精确 Relay OCI digest/attestations 与 pinned SSH trust。它成功完成 R97 的 `HANDY_MASTER_SECRET → LYNTTY_MASTER_SECRET`，在生产环境证明 value-preserving key migration；随后因 `LYNTTY_RELAY_IMAGE` assignments 为 0，在停服务、database backup/migration、target configuration 和 container replacement 前停止。

公网 Relay 保持健康，仍返回旧 Android update metadata（`versionCode=5`）。R65 source 与部署证据明确剩余布局：

- Compose image：`ghcr.io/jczhang02/lyntty-relay:${LYNTTY_RELAY_IMAGE_TAG}`；
- env tag：`LYNTTY_RELAY_IMAGE_TAG=sha-9752c689c927`；
- 原 Compose 有 persistent data bind，但没有 `/backups` bind。

## 修复

受保护部署只接受精确 R65 布局、受限 hardcoded equivalent 及 workflow 自身产生的 interruption states。停服务前会：

1. 拒绝 symlink、incomplete marker、BOM/CR/tab/NUL、external Compose input、YAML anchor/alias/merge/tag/escaped 或 explicit key、重复 service/image 和 ambiguous mount；
2. 固定 Compose project/file/env boundary，并移除 ambient Compose/Lyntty variables；
3. 证明 rendered R65 tag、唯一运行容器 reference、container image ID、configured local image ID、唯一同仓库 `RepoDigest`、immutable pull 与 post-pull image ID 是相同 bytes；
4. 创建逐字节一致的 root-private env/Compose backups；
5. 只 staged image scalar、digest assignment 与缺失的 `/opt/lyntty/backups:/backups` bind，并验证 rendered staged model；
6. 先 atomic install env，再安装 Compose。此阶段保留已验证 legacy tag，使两个可能的 SIGKILL intermediate states 都可重试；后续 target-env transaction 才删除旧键；
7. 任何未 committed exit 都无条件恢复两份 backup，并验证旧 runtime bytes 仍在运行；无法证明恢复时写 `.rollback-incomplete`。

普通 pre-schema rollback 会创建 private Compose override，仅在重启旧 R65 image 时把 exact canonical `LYNTTY_MASTER_SECRET` 映射为其所需的 `HANDY_MASTER_SECRET`。Override 在不输出值的前提下验证 equality；恢复/部署成功后删除，restart verification 失败则与 `0600` blocking marker 一起保留。所有 identity checks 即使在 Bash OR-list 中调用也会显式返回失败。

原有 signed-BOM、target digest、backup checksum、migration marker、`migrate`、`doctor`、本地 health/version、公网 version 和 fail-stop gates 均保留。

## 验证

- 完整 `bun run ci:fast`：通过（Wire、CLI、Relay、App、bundle smoke、isolated lifecycle）；
- hardening/redaction/Relay-SBOM：`35 pass / 0 fail`；
- migration behavioral coverage：精确 R65 variable/hardcoded forms、workflow 生成的 env-first retry、canonical retry、paired backup bytes/modes、persistent backup mount、malformed/escaped/tagged YAML、foreign/multiple digest、image-ID mismatch、stopped/multiple container、env/Compose rename failure、post-install failure 和 secret non-output；
- pre-schema rollback behavioral coverage：compatibility alias equality、prior-image restart/verification、override cleanup 与 blocking-marker；
- workflow YAML parse：通过；
- Relay deployment 的 `5` 个 shell blocks 均通过 `bash -n` 与 error-level ShellCheck；
- `git diff --check`：通过；
- 最终对抗复核：`PASS`，无 P0/P1/P2。

## 残余风险

下次 protected deployment 才能首次证明真实 raw R65 image layout、local `RepoDigests` cardinality、staged backup bind、old-image compatibility restart path 与最终 target deployment。任何不符都保持 pre-stop failure，不允许 waiver。
