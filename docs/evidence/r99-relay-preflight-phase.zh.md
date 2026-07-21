# R99 — 生产 Relay preflight phase diagnostics

日期：2026-07-22

分支：`fix/relay-preflight-phase`

Bead：`lyntty-24v.3`

> 后续：受保护重试 `29873580305` 已证明诊断有效，并将拒绝定位到 `legacy-image-layout`。下一版会继续细分固定标签，但不输出任何状态值。

## 触发

受保护 run `29872651065` 已通过 release/BOM/digest/attestation 与 SSH gates，但 remote pre-stop preflight 未指出是哪项 fail-closed assertion 拒绝了真实 R65 状态。公网 Relay 仍健康并返回旧 metadata（`versionCode=5`）；日志中没有 service stop、database backup/migration 或 target container start。

## 变更

Remote transaction 现在维护固定且不敏感的 phase label，仅在 preflight 非零退出时输出该 label。阶段覆盖 argument、filesystem/marker、master-secret、image assignment、optional environment、prior runtime 与 rollback-compatibility；legacy image layout 继续细分为 source model、rendered model、running container、repository digest、staging 与 install。Image-layout restoration trap 会在 paired restoration 后输出相同标签；正常 deployment rollback trap 启用后会替换诊断 trap。

不会输出 environment value、image credential、host、key、URL query 或 secret；没有删除或放宽任何 acceptance gate。

## 验证

- hardening/redaction/Relay-SBOM：`35 pass / 0 fail`；
- `bun run ci:audit`：no vulnerabilities；
- workflow YAML parse、全部 `5` 个 shell block 的 `bash -n` 与 error-level ShellCheck、`git diff --check`：通过。

## 残余风险

必须由下一次 protected retry 识别精确 live preflight boundary。Phase marker 只是诊断证据，不能授权 mutation。
