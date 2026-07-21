# R101 — Legacy Relay image-tag 语法归一化

日期：2026-07-22

分支：`fix/relay-tag-syntax`

Bead：`lyntty-24v.3`

## 线上诊断

以下受保护重试均保持 fail-closed 且停在 stop 之前：

- `29873580305`：`legacy-image-layout`；
- `29875585755`：`legacy-image-rendered-model`；
- `29876633263`：`legacy Relay source image tag is not the documented R65 value`。

最后一条原因证明生产 `.env` 只有一个 canonical `LYNTTY_RELAY_IMAGE_TAG` assignment，但 raw value 与裸 tag 不是逐字节相等。R65 raw Compose shape 与 rendered service/volume checks 此前已通过。所有重试都没有出现 service stop、database backup/migration 或 target runtime start；公网 prior Relay 始终可用。

## 根因机制与修复

迁移逻辑在进入更强的 rendered/runtime identity chain 之前先比较 raw dotenv bytes。因此，只要固定 R65 tag 带有 dotenv 引号、周围空白或 CR，虽然 Docker Compose 可以把它解析为文档中的 tag，也会被提前拒绝。

Source gate 现在只接受固定值 `sha-9752c689c927` 的以下语法：

- 裸值；
- 单引号；
- 双引号；
- 上述形式周围的 dotenv whitespace，包括 CRLF line ending。

Interpolation、inline comment、错误 tag、重复或非 canonical assignment 及所有其他语法仍会被拒绝。通过 source gate 后仍必须完成：rendered repository/tag equality、running container reference 与 image ID、configured local image ID、唯一同仓库 `RepoDigest`、immutable digest pull 后 image ID 相同、staged Compose validation、paired restoration 与 formal migration rollback。

## 验证

- 接受 fixtures：bare、single-quoted、double-quoted with spaces、CRLF；
- 拒绝 fixtures：可语义展开为预期 tag 的 interpolation、可语义解析为预期 tag 的 comment syntax、错误 tag；每个 raw-syntax fixture 都断言精确拒绝原因；
- hardening/redaction/Relay-SBOM suite：通过；
- `bun run ci:audit`：clean；
- YAML、shell syntax、ShellCheck、`git diff --check`：通过。

## 残余风险

生产上的具体装饰形式被刻意禁止输出。下一次 protected retry 必须证明它属于受限接受集合，并在任何 service mutation 前完成全部 image/runtime identity chain。
