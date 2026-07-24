# Docs Site Agent Rules

This directory contains the Fumadocs/Next presentation layer for the Markdown docs.

The root `AGENTS.md` applies here together with `docs/AGENTS.md`. This guide adds site-specific deltas and cannot weaken their safety, permission, documentation, Git, or verification rules.

Rules:

- Treat `docs/.site/` as application code, not bilingual source documentation.
- Source-of-truth content remains outside this directory under `../../docs/`, plus `../../AGENTS.md` and `../../CONTEXT-MAP.md`.
- Do not edit generated `content/docs/`, `.next/`, `.source/`, or `out/` output by hand.
- Keep scripts runnable from `docs/.site/`.
