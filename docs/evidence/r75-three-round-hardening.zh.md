# R75 三轮加固

日期：2026-07-13

目标：`19c76cd7-efde-436f-97f0-392563151751`

Beads Epic：`lyntty-8z4`

## 第一轮——安全边界

状态：完成实现、独立阻塞审查、阻塞修正和复审；复审无 P0/P1 阻塞。

### 变更

- 在 `onRequest` 阶段用 daemon control token 保护 `lynttyd` 全部本地 HTTP 端点。
- 更新 control client 和保留的 agent integration helper，使其发送 token。
- 不区分大小写地拒绝进程加载器和命令解析相关环境变量，包括 `NODE_OPTIONS`、`PATH`、`PATHEXT`、`COMSPEC` 和保留的 `LYNTTY_*`。
- 在支持 POSIX 权限的平台上，将 Lyntty 状态/日志目录限制为 `0700`，凭据、daemon state/lock、session encryption ledger 限制为 `0600`。
- doctor 输出不再显示 daemon control token。
- Android release 与 relay deploy 仅允许 `main == origin/main`；生产任务绑定命名 GitHub Environment；relay PR 镜像构建与 main 发布分离。
- 将 pnpm overrides/build allowlist 迁入 `pnpm-workspace.yaml`，升级有漏洞的 runtime 依赖，并增加 production high/critical audit 门禁。
- 脱敏 6 个已跟踪 pairing URL，删除 18 张可能暴露认证材料的 auth/pairing 截图；新增逐字节 evidence 扫描、欺骗后缀测试和敏感截图规则。
- Docker 构建上下文排除 `.env*`，仅允许明确的 `.env.example`。

### 验证

```text
HOME=<temporary> LYNTTY_HOME_DIR=<temporary> pnpm ci:fast
```

结果：

- repository hardening：6/6；
- production audit：critical 0、high 0；仍有 moderate 27、low 6；
- wire：19 tests；
- CLI：typecheck 通过，798 tests；
- relay：typecheck/build 通过，101 tests；
- app：typecheck/i18n/config 通过，795 tests；
- agent：typecheck 通过，227 tests；
- `git diff --check`：通过。

独立复审：第一轮无剩余 P0/P1 阻塞。

### 未运行与残余风险

- 未执行生产 Android release、relay image publish、SSH deploy、npm publish 或 push。
- GitHub 当前尚未配置 `production-android` / `production-relay` Environment 保护规则。workflow 已在代码中强制 `main == origin/main`，但 required reviewers 和 deployment branch rules 仍需仓库所有者配置。
- 剩余 moderate/low advisory 未被视为已证实可达的 runtime 漏洞，仍可通过 `pnpm audit` 查看。
- 旧的 relay 短 SHA 镜像 tag 不再被 deploy workflow 接受；下一次部署或回滚演练前需要生成 full-SHA 镜像。

## 第二轮——运行时可靠性

待执行。

## 第三轮——移动端与 Maestro E2E

待执行。
