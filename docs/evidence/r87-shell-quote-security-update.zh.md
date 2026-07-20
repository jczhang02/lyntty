# R87 — `shell-quote` 安全升级（中文）

日期：2026-07-21

状态：本地安全修复已验证；受保护 PR 与替代 Android Preview Candidate 尚待执行。

## 触发原因

最终发布策略验证首次运行时依赖审计为零漏洞，随后 GitHub 发布 reviewed advisory [GHSA-395f-4hp3-45gv](https://github.com/advisories/GHSA-395f-4hp3-45gv)，重复执行 `bun audit` 开始稳定拒绝仓库精确覆盖的 `shell-quote@1.8.4`。

GitHub 将 CVE-2026-13311 标记为 high：`shell-quote.parse()` 在版本 `<=1.8.4` 中存在二次复杂度拒绝服务，首个修复版本为 `1.9.0`。攻击者可利用足够长的 token 字符串触发输出数组反复复制，从而长时间阻塞 JavaScript event loop。

## 变更

根 `overrides` 与 Bun lock entry 从 `shell-quote@1.8.4` 精确升级到 `shell-quote@1.9.0`。没有改动其他 package 版本或 lock entry。新增 repository-hardening 回归，同时绑定 `package.json` 与 `bun.lock` 的修复版本，并拒绝旧的脆弱 lock entry。

该依赖由 React Native tooling 间接引入。本修复不增加新 runtime、package surface、App 功能或 Release 资产。

## 验证

由于 `package.json` 与 `bun.lock` 是源码完整性输入，dirty 工作树在正式提交前被 Preview import fixture 拒绝属于预期行为。因此先把精确 staged tree 生成为一次性 clean synthetic commit，并在没有 durable commit 的前提下完成验证。

```bash
bun install --frozen-lockfile
bun audit
bun test scripts/workflow-hardening.test.mjs scripts/evidence-redaction.test.mjs
bun run ci:fast
git diff --check
```

结果：

- frozen install：2,704 packages，lockfile 无变化；
- `bun audit`：零漏洞；
- hardening/redaction：20 项通过；
- Wire：33 tests / 76 assertions；
- CLI：585 / 1,272；
- Relay：119 / 332，另含 compiled runtime smoke；
- App：90 个隔离文件 812 / 3,276，另含 13,068,103-byte Preview bundle smoke；
- 隔离 development/Preview lifecycle：35 / 194；
- `git diff --check`：通过。

额外 focused verification 将 React Native 依赖中的 `shell-quote/package.json` 解析为 `1.9.0`，并在五秒 deadline 内用 105 ms 解析 128,000 个 token。输出精确包含 128,000 个未改变的 token，证明安装的修复实现不会在 advisory 展示的输入规模上出现旧版停顿。

## Preview Candidate 边界

`package.json` 与 `bun.lock` 都是 Android Candidate 构建输入。因此 Candidate run `29762476280` 与 APK SHA-256 `9025d83a142ded5a618ef15c56c9bdd5486fed8336a53f1b9f0c7336b325aae9` 仍是有效历史证据，但本安全修复合入后不能再用于公开 Promotion。

发布必须暂停：先让本修复通过受保护检查并合入，再从新的 protected `main` 重新构建、审计和 attest `1.2.0` / `920001` Candidate。新 Candidate 的精确 SHA-256、manifest、provenance、sidecar、allowlist 与公开 waiver evidence 均须审阅后才能 Promotion。本 PR 不创建 tag、draft 或 Release。

## 残余风险

替代 `920001` Candidate 仍将在所有者明确授权的 truthful waiver 下缺少实体 Android 验证。该 waiver 属于单独的受保护发布策略变更，必须在公开正文加入中英文未验证警告；本安全 PR 不声称实体机通过，也不放宽任何发布门禁。
