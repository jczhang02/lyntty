# Domain Docs

工程技能探索代码库时，应按本文件消费本仓库的领域文档。

## 布局

本仓库使用 multi-context domain-doc 布局。

期望结构：

```
/
├── CONTEXT-MAP.md
├── docs/adr/                          ← system-wide decisions
└── src/
    ├── <context>/
    │   ├── CONTEXT.md
    │   └── docs/adr/                  ← context-specific decisions
    └── <context>/
        ├── CONTEXT.md
        └── docs/adr/
```

repo root 的 `CONTEXT-MAP.md` 指向相关 per-context `CONTEXT.md` 文件。

## 探索前阅读

- repo root 的 **`CONTEXT-MAP.md`**（如果存在）。用它找到与任务相关的 context docs。
- `CONTEXT-MAP.md` 列出的相关 per-context **`CONTEXT.md`** 文件。
- **`docs/adr/`** 中的 system-wide architectural decisions。
- 存在时，也阅读 context-scoped **`docs/adr/`** 目录。

如果这些文件不存在，静默继续。不要把缺失当成问题，也不要预先建议创建。domain-modeling flow 会在术语或决策实际明确时懒创建。

## 使用 glossary 词汇

输出中命名 domain concept 时（issue title、refactor proposal、hypothesis、test name 等），使用相关 `CONTEXT.md` 中定义的术语。不要漂移到 glossary 明确避免的同义词。

如果需要的概念不在 glossary 中，这是信号：要么你在发明项目不用的语言，要么确实存在需要 domain modeling 记录的缺口。

## 标出 ADR 冲突

如果输出与现有 ADR 冲突，明确指出，不要静默覆盖：

> _Contradicts ADR-0007 (event-sourced orders) — but worth reopening because..._
