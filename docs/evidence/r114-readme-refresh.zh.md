# R114 — 根 README 展示刷新

日期：2026-07-24

分支：`docs/readme-refresh`

Bead：`lyntty-3ll`

## 结果

根 `README.md` 已从简短的内部索引重写为公开项目入口。新版加入居中的 Lyntty 品牌区、实时仓库徽章、精简功能说明、架构图、安全的自托管快速开始、平台范围、包职责，以及彼此分开的当前文档与历史记录入口。

最终 README 共 164 行、9,119 字节，SHA-256 为：

```text
e9a099549ce54848b50b0f644600f33b29d5662f367354f5773b07486828b332
```

## 参考与产品过滤

展示参考为 `tw93/Mole` commit `17683e1ac501b80456c37b23b2895398c1fe6380` 的 `README.md`，源文件 SHA-256 为 `fd9c9f06aca1f36545903428d321fa1996c4ea575665f7c4c0a093e935735b1c`。Lyntty 借鉴了其便于浏览的层级：居中品牌区、徽章、功能摘要、快速开始和明确的安全说明；没有复制 Mole 的 macOS 命令、产品能力、社区章节或安装模式。

重写后的内容继续遵守当前 Lyntty 权威约束：

- Android 是主要客户端，`pi` 是唯一产品运行时。
- 普通控制路径为 `phone -> relay -> lynttyd -> local Pi extension -> pi`。
- Pi extension 仅连接本机，operator `lyntty remote` 被单独说明。
- Pi JSONL 保持 canonical，每个 session 只有一个 `active runtime`。
- Stable 安装使用同一组签名 Compatibility Release，而不是混用各自的 latest 文件或执行未经验证的网络脚本。
- README 没有宣称公共 Relay 服务、Play Store 分发、完整端到端加密、npm 安装、Windows user service 支持或 iOS 发布验收。

README 只引用当前 launcher icon 作为新的首屏视觉元素。历史截图代表旧的时间点 UI 和版本状态，因此没有被提升为项目入口素材。

## 验证

- 首次 `bun install --frozen-lockfile` 在已安装 2,702 个包后，因解包 `expo-modules-core@55.0.25` tarball 失败而退出。
- 随后运行 `bun install --frozen-lockfile --force`，成功安装 2,704 个包，lockfile 未变化。
- 首次 `bun run test:repo-hardening` 为 52/53，通过的契约正确拒绝了被合并的文档标题。恢复独立的 `## Current documentation` 和 `## Historical records` 后解决。
- 最终 `bun run test:repo-hardening`：53 passed、0 failed。
- `bun pm untrusted`：0 个带 lifecycle script 的未信任依赖。
- README 聚焦链接扫描共发现 42 个引用、22 个唯一的本地目标、0 个缺失目标。
- GitHub Markdown API 接受该文档，并保留居中标题区、IMPORTANT 提示、Mermaid enrichment block 和 App icon。
- 文档站、Latest Release、CI workflow、stars badge、Release badge 与 CI badge 在验证时均返回 HTTP 200。
- `git diff --check`：通过。
- 一名独立只读 reviewer 对照 Mole 与当前 Lyntty 产品、架构、开发、发布和 CLI 权威文档复核，结论为 `PASS`。

## 未运行与剩余风险

- 未运行 `bun run ci:fast`、APK、Maestro、模拟器、实体设备、live Pi-extension、Relay 部署或发布 workflow，因为 runtime/product code 未变化。
- 未运行 `docs:check` 与 `docs:build`，因为根 README 不是 Fumadocs source 或站点配置；本次变化面已通过 GitHub 渲染和直接链接检查覆盖。
- 外部 URL 仅代表审查时可用，后续仍依赖 GitHub、GitHub Pages 与 Shields。
- Mermaid 已被 GitHub enrichment pipeline 接受，但没有保存浏览器截图对比。
