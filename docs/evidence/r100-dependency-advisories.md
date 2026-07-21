# R100 — Second dependency advisory wave

Date: 2026-07-22

Branch: `fix/dependency-advisories-2`

Bead: `lyntty-24v.4`

## Trigger

A fresh `bun audit` after protected PR #36 reported three newly published advisories:

- `GHSA-8r6m-32jq-jx6q` (`fast-xml-parser`, high; repeated DOCTYPE declarations reset entity-expansion limits);
- `GHSA-9mqv-5hh9-4cgg` (`@hono/node-server`, moderate; aborted WebSocket handshake memory leak);
- `GHSA-v2hh-gcrm-f6hx` (`fast-uri`, high; literal-backslash authority confusion).

The audit blocked the next production Relay diagnostic PR before any deployment retry.

## Fix

Minimal root overrides and the Bun lockfile now resolve:

- `@hono/node-server` `2.0.11`;
- `fast-uri` `3.1.4` (patched release on the existing major);
- `fast-xml-parser` `5.10.1`.

The hardening test pins all three exact resolved versions. No application, release, or deployment logic changed.

## Verification

- `bun run ci:fast`: pass;
- `bun run ci:audit`: `No vulnerabilities found`;
- `bun install --frozen-lockfile`: no changes;
- `bun pm untrusted`: `0`;
- resolved dependency inventory reports exactly `2.0.11`, `3.1.4`, and `5.10.1`;
- `git diff --check`: pass.

## Residual risk

This records the registry advisory state observed on the date above. Future advisory-database changes require a new audit and must not be represented as covered by this result.
