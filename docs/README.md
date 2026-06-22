# Documentation Language Policy

Lyntty docs are kept in English and Simplified Chinese.

Rules:

- English is canonical for issue/agent handoff unless a task says otherwise.
- Simplified Chinese mirrors user-facing product intent and decisions.
- For every long-lived doc, keep sibling files:
  - `name.md` for English;
  - `name.zh.md` for Chinese.
- If a doc changes, update both versions in the same commit.
- If only one version can be updated immediately, add a short sync note at the top of the stale version.
- Technical names stay exact: `pi`, `lynttyd`, `relay`, `Node Management`, `Global Inbox`, `Session Remote`, `Review Evidence`, `active runtime`, `activation lock`, `history_gap`.

Current bilingual docs:

- `prds/android-pi-remote-control.md`
- `prds/android-pi-remote-control.zh.md`
- `recovered/previous-lyntty-decisions.md`
- `recovered/previous-lyntty-decisions.zh.md`
