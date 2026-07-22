# R105 — 开发生命周期进程归属竞态

日期：2026-07-22

分支：`fix/dev-ownership-race`

Bead：`lyntty-24v.5`

## 结果

Linux `ci:dev` 的 claim/receipt 恢复失败已在进程身份边界稳定复现并修复，归属门禁没有被放宽。

暴露竞态的 PR #44 失败检查：

- workflow run `29884117565`
- 首轮 job `88811027850`
- rerun job `88812201145`

第一个恢复测试可先观察到 receipt，随后 `dev:down` 却返回退出码 `1`。该失败会留下已恢复的存活实例，导致后续 crash-hook 测试复用该实例并返回退出码 `0`，而没有真正执行 hook。

## 根因

`supervisorOwnership()`、子进程和后代进程的归属检查先用 `kill(pid, 0)` 判断 PID 存活，再异步读取 `/proc`、`lsof`、进程启动令牌、命令、环境与工作目录。短生命周期进程可能在这些读取之间退出。旧失败路径仍固定返回 `alive: true`；即使 PID 已消失或已成为 zombie，也会被误判成“仍存活但无法证明归属”。因此 receipt reconciliation 会在 `dev:down` 恢复进程组前 fail-closed。

受控复现让每个被杀子进程在归属分类完成前保持未回收状态。100 次结果：

```text
old={"count":100,"falseAlive":100,"stopped":0}
fixed={"count":100,"falseAlive":0,"stopped":100}
```

`scripts/dev.test.ts` 中的回归采用相同顺序：启动归属证明，在第一次异步身份读取期间杀死进程，在等待子进程回收前完成分类，并要求结果为 `not-running`。修复前实现会稳定失败。

## 修复与安全属性

- supervisor、child、descendant 以及 unrelated group member 的每个身份失败路径都会先刷新进程状态。
- 已消失或 zombie PID 归类为 `not-running`，不再阻塞恢复。
- 仍存活的 PID、被非 zombie 进程复用的 PID，或无法刷新状态的 PID 仍然 fail-closed；没有完整归属证明时绝不会发送信号。
- receipt 等待与 reconciliation 统一使用同一个归属结果，不再另做可能过期的存活/启动令牌判断。
- 旧进程组快照为空时，在删除 receipt 前再次枚举同一进程组；若发现新的非 zombie 成员，则保留 receipt 并要求重试。
- 失败断言现在包含命令结果，未来 CI 失败会给出被拒绝的生命周期阶段，而不再只有退出码不匹配。

本修复没有触碰生产 Relay、Preview profile、全局 Pi 扩展或用户的存活会话。

## 验证

在隔离 worktree 中通过：

```text
CI=true bun test scripts/dev.test.ts --test-name-pattern 'exits during identity proof'
1 pass, 0 fail

CI=true bun run ci:dev
36 pass, 0 fail

bun run ci:audit
No vulnerabilities found

CI=true bun run ci:fast
pass（仓库加固、audit、Wire、CLI、Relay、app、开发生命周期、diff check）

git diff --check
pass
```

独立终审检查了 PID 复用、zombie 处理、进程组二次刷新、receipt 保留与 fail-closed 行为，未发现 P0/P1/P2 问题。

## 未执行与残余风险

- 本修复未改变 Android 或实体机行为，因此没有执行 APK/实体机测试。
- 没有执行生产部署或回滚。
- Linux 与 macOS 的受保护 PR checks 仍是合入门禁；在 GitHub 完成前，本证据不声称这些检查已经通过。
