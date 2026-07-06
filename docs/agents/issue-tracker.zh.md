# Issue tracker：GitHub + Beads

GitHub Issues 是本仓库的主 issue tracker。GitHub issue 操作用 `gh` CLI。

Beads 是配套 tracker，用于多会话工作、依赖、阻塞项和 compaction 后恢复。需要跨会话保留本地任务上下文时，用 `bd`。

## GitHub 约定

- **创建 issue**：`gh issue create --title "..." --body "..."`。多行正文用 heredoc。
- **读取 issue**：`gh issue view <number> --comments`，需要时用 `jq` 过滤评论并获取 labels。
- **列出 issues**：`gh issue list --state open --json number,title,body,labels,comments --jq '[.[] | {number, title, body, labels: [.labels[].name], comments: [.comments[].body]}]'`，按需加 `--label` 和 `--state`。
- **评论 issue**：`gh issue comment <number> --body "..."`
- **添加 / 移除 labels**：`gh issue edit <number> --add-label "..."` / `--remove-label "..."`
- **关闭 issue**：`gh issue close <number> --comment "..."`

在 clone 内运行时，`gh` 会从 `git remote -v` 自动推断 repo。

## Beads 约定

满足任一条件时用 Beads：

- 工作跨多个会话；
- 工作有依赖或阻塞项；
- 上下文必须在 conversation compaction 后保留；
- 用户要求 track work、recover context 或 show ready work。

常用命令：

- **找 ready work**：`bd ready`
- **创建 task**：`bd create "..." -t task -p 2 --json`
- **查看 task**：`bd show <id> --long`
- **认领 task**：`bd update <id> --claim --json`
- **关闭 task**：`bd close <id> --reason "..." --json`

同一项工作同时有 GitHub 和 Beads 记录时，在描述或评论中交叉链接。

不要自动初始化 Beads。如果缺少 `.beads/`，先询问再运行 `bd init`。

## 当技能说 “publish to the issue tracker”

创建 GitHub issue。

如果工作需要多会话持久化，也创建或更新 Beads task，并链接到 GitHub issue。

## 当技能说 “fetch the relevant ticket”

GitHub issue 用 `gh issue view <number> --comments`。

Beads task 用 `bd show <id> --long`。
