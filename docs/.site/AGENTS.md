# Docs Site Agent Rules

This directory contains the Fumadocs/Next presentation layer for the Markdown docs.

Rules:

- Treat `docs/.site/` as application code, not bilingual source documentation.
- Source-of-truth content remains outside this directory under `../../docs/`, plus `../../AGENTS.md` and `../../CONTEXT-MAP.md`.
- Do not edit generated `content/docs/`, `.next/`, `.source/`, or `out/` output by hand.
- Keep scripts runnable from `docs/.site/`.
