# 参与 Lyntty 开发

[English](./CONTRIBUTING.md)

Lyntty 接受范围清晰的修复和文档改进，但必须保留 Android-first、自托管和仅支持 `pi` 的产品边界。报告漏洞前请阅读 [SECURITY.md](./SECURITY.md)。

## 选择贡献内容

先检查现有 [GitHub issues](https://github.com/jczhang02/lyntty/issues)。新建问题时使用 bug 或 feature form。修改应改善 Android 对本机 `pi` session 的控制、自托管运行，或者这些路径的安全性和可维护性。

不要新增 Claude、Codex、Gemini、OpenClaw、通用远程桌面或多用户 SaaS 产品面。当前产品和架构来源列在 [`CONTEXT-MAP.md`](./CONTEXT-MAP.md) 中。

## 创建分支

外部贡献者可以使用普通 fork 流程：

```bash
git clone https://github.com/<your-account>/lyntty.git
cd lyntty
git remote add upstream https://github.com/jczhang02/lyntty.git
git switch -c fix/short-topic
```

完成修改后，把分支 push 到自己的 fork，再创建 pull request：

```bash
git push -u origin fix/short-topic
```

外部贡献者可以选择是否使用独立 worktree。维护者和 coding agent 使用 `worktrees/<topic>/`，因为仓库契约要求其工作流保持隔离。使用 coding agent 或参与维护者流程时，请阅读根及目标目录最近的 `AGENTS.md`。

外部贡献者不要求使用 Beads。维护者只在工作跨会话或需要持久交接上下文时使用 Beads。

## 准备仓库

Lyntty 只使用 Bun。固定版本记录在 `.bun-version` 和根 `packageManager` 字段中。

```bash
bun install --frozen-lockfile
bun pm untrusted
```

需要运行 `relay` 和 `lynttyd` 时，使用隔离的本地生命周期：

```bash
bun dev:up
bun dev:verify
bun dev:down
```

测试不得接触真实的 `~/.lyntty`、`~/.pi` 或正在使用的 Pi session。Daemon、`relay`、Pi extension、APK、模拟器和 tmux 工作遵守 `AGENTS.md` 中的隔离规则。

## 完成范围明确的修改

- 以当前 context、accepted architecture、runbook、代码和测试为准。Research 与 evidence 记录较早状态，不覆盖当前政策。
- 文档规则要求中英文配对时，同步修改 English 和简体中文文件。
- 用户可见行为、安全加固、E2E 或发布敏感修改需要在 `docs/evidence/` 中记录证据。
- Commit 和 issue 中不得包含凭据、完整配对 URL、认证请求头、加密密钥、签名材料、私有代码或私有日志。

推荐使用 Conventional Commits，因为 pull request 通常会 squash merge。OpenPGP/GPG 签名对贡献者分支是可选的，也不影响创建 pull request。受保护的 `main` 和维护者创建的持久提交遵守仓库签名政策。

## 验证修改

先运行受影响范围内最窄的检查，再运行该范围的 claim gate。默认仓库门禁是：

```bash
bun run ci:fast
```

修改文档站时还需要运行：

```bash
cd docs/.site
bun install --frozen-lockfile
bun run docs:check
bun run docs:build
```

`ci:fast` 不包含文档站检查、daemon integration、APK/Maestro、实体设备、已部署 `relay` 或完整 App/daemon/relay E2E。PR 中需要列出所有未运行检查及原因。

## 创建 pull request

- GitHub issue 存在时，在 PR 中链接。维护者还应链接内部持久追踪使用的 Bead。
- 说明用户可见结果、信任或兼容性影响、精确验证命令和剩余风险。
- 不要混入无关格式化和重构。
- 只向分支或 fork push。只有维护者可以发布 Release 或更改共享 GitHub 设置，并且必须遵守仓库授权规则。
