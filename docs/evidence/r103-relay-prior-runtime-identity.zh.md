# R103 — 生产 prior Relay runtime 的精确历史身份

日期：2026-07-22

分支：`fix/relay-prior-identity`

Bead：`lyntty-24v.3`

## 为什么只有 R65 不够

受保护 run `29880608810` 证明生产配置和 running container 都使用 `alternate-sha-tag`，而不是最初的 R65 tag。显式 stale-config repair 在修改 `.env` 或停止服务前正确拒绝了该状态。

审计 GitHub 历史后发现，此前迁移证据遗漏了一次更晚且合法的生产部署。

## 后续 runtime 身份证据

- source commit：`e243429200bd83288f1dac1454a2db43a4024003`（GitHub verification：valid）；
- Git ref `android-v1.0.0-5` 当前解析到该 commit（GitHub Release 未标记 immutable，因此 authority 是 verified commit 与 workflow provenance，而不是 tag immutability）；
- Relay image workflow：run `29023065350`，`workflow_dispatch`，success；
- image tag：`ghcr.io/jczhang02/lyntty-relay:sha-e243429200bd`；
- OCI index digest：`sha256:fe3bf95fd7e19cd34c3f94ff2aedeced9497535db797f07ba37241083dd8e83d`；
- amd64 manifest digest：`sha256:342869c8f79e9affb77a1e29ae2aa616e74816803277edc96c406a64870b1012`；
- OCI attestation manifest：`sha256:eaaa162f018dc93af891ed2f5725d1e24ea3b54c4df6fb5eb959d670c46e4669`；
- SLSA provenance builder：`https://github.com/jczhang02/lyntty/actions/runs/29023065350/attempts/1`；
- provenance 记录 workflow/source revision `e243429200bd83288f1dac1454a2db43a4024003` 与上述 amd64 subject；
- production deploy workflow：run `29023552000`，`workflow_dispatch`，success；其最终 `docker compose ps` 记录相同 `sha-e243429200bd` tag；
- 2026-07-22 匿名 GHCR manifest HEAD 仍返回同一个 index digest。

诊断期间，公网生产 Relay 始终健康，并继续提供与该历史部署对应的 Android `versionCode=5` contract。

## 精确 prior-runtime allowlist

Legacy migration 只识别以下两个历史 tag-to-index-digest 身份：

1. R65：
   - tag `sha-9752c689c927`；
   - image run `28847187170`；
   - digest `sha256:2eb926b37741e9b047b6e6f178ffdb0e84ed41c6649180421b3f4861838ff715`。
2. Android-v1.0.0-5 后续部署：
   - tag `sha-e243429200bd`；
   - image run `29023065350`；
   - deploy run `29023552000`；
   - digest `sha256:fe3bf95fd7e19cd34c3f94ff2aedeced9497535db797f07ba37241083dd8e83d`。

只有 rendered Compose reference、running container reference、container/local image ID、expected RepoTag、唯一同仓库 RepoDigest、immutable pull 结果和 hardcoded tag-to-digest mapping 全部一致，source tag 才能作为 prior runtime identity 通过。任意 alternate SHA runtime，或 documented tag 搭配另一个 digest，都会被拒绝。独立的 R102 stale-configuration repair 只在 running container 与完整 byte-identity chain 仍证明精确 R65 identity 时，才会归一化一个未列出的 configured SHA；它不会把该 SHA 当作 runtime 接受。

Canonical state 只接受 documented historical prior digest、workflow 传入的 current signed BOM target digest，或 root-owned mode-600 `deployed-bom.txt` 中记录并与单行 `deployed-sequence.txt` 配对的精确 predecessor digest。该 recorded predecessor 路径保证未来 signed N→N+1 upgrade，而不会接受任意 canonical digest。

## 验证

抽取的 remote seam 覆盖两个 documented identity、current signed target retry state、recorded predecessor N→N+1 state、successor tag/digest mismatch rejection、unknown canonical digest rejection、immutable pull identity、paired layout restoration 与已有 secret-redaction checks。

Protected integration 前必须通过 repository hardening、audit、YAML/shell syntax、error-level ShellCheck 与 `git diff --check`。

## Live 后续

受保护 run `29883473315` 已证明 live running bytes 命中精确 successor mapping，并完成 backup/migrate/doctor/deploy，把生产切换到 signed Stable digest。Run `29883633696` 随后证明 idempotent replay。见 R104。
