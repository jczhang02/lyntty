# Issue tracker: GitHub + Beads

GitHub Issues are the primary issue tracker for this repo. Use the `gh` CLI for GitHub issue operations.

Beads is the companion tracker for multi-session work, dependencies, blockers, and compaction recovery. Use `bd` when work needs persistent local task context across sessions.

## GitHub conventions

- **Create an issue**: `gh issue create --title "..." --body "..."`. Use a heredoc for multi-line bodies.
- **Read an issue**: `gh issue view <number> --comments`, filtering comments by `jq` and also fetching labels when needed.
- **List issues**: `gh issue list --state open --json number,title,body,labels,comments --jq '[.[] | {number, title, body, labels: [.labels[].name], comments: [.comments[].body]}]'` with appropriate `--label` and `--state` filters.
- **Comment on an issue**: `gh issue comment <number> --body "..."`
- **Apply / remove labels**: `gh issue edit <number> --add-label "..."` / `--remove-label "..."`
- **Close**: `gh issue close <number> --comment "..."`

Infer the repo from `git remote -v`; `gh` does this automatically when run inside a clone.

## Beads conventions

Use Beads when any of these are true:

- work spans multiple sessions;
- work has dependencies or blockers;
- context must survive conversation compaction;
- user asks to track work, recover context, or show ready work.

Common commands:

- **Find ready work**: `bd ready`
- **Create task**: `bd create "..." -t task -p 2 --json`
- **Show task**: `bd show <id> --long`
- **Claim task**: `bd update <id> --claim --json`
- **Close task**: `bd close <id> --reason "..." --json`

If both GitHub and Beads entries exist for the same work, cross-link them in descriptions or comments.

Do not initialize Beads automatically. If `.beads/` is missing, ask before running `bd init`.

## When a skill says "publish to the issue tracker"

Create a GitHub issue.

If the work needs multi-session persistence, also create or update a Beads task and link it to the GitHub issue.

## When a skill says "fetch the relevant ticket"

Run `gh issue view <number> --comments` for GitHub issues.

Run `bd show <id> --long` for Beads tasks.
