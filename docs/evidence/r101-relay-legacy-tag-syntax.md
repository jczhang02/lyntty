# R101 — Legacy Relay image-tag syntax normalization

Date: 2026-07-22

Branch: `fix/relay-tag-syntax`

Bead: `lyntty-24v.3`

## Live diagnosis

Protected retries remained fail-closed and pre-stop:

- `29873580305`: `legacy-image-layout`;
- `29875585755`: `legacy-image-rendered-model`;
- `29876633263`: `legacy Relay source image tag is not the documented R65 value`.

The final reason proves the production `.env` has one canonical `LYNTTY_RELAY_IMAGE_TAG` assignment whose raw value is not byte-equal to the bare tag. Raw R65 Compose shape and rendered service/volume checks had already passed. No retry showed service stop, database backup/migration, or target runtime start; the public prior Relay remained available.

## Root mechanism and fix

> Follow-up: protected retry `29877679639` proved the production form is outside bare/quoted/whitespace/CR syntax. No gate was broadened. The next revision reports only one fixed category: expected value with inline comment, alternate SHA tag, repository-qualified tag, interpolation, non-printing bytes, or other.

The migration compared raw dotenv bytes before reaching its stronger rendered/runtime identity chain. A semantically fixed R65 tag decorated by dotenv quoting or surrounding whitespace/CR was therefore rejected even though Docker Compose can resolve it to the documented tag.

The source gate now accepts only these syntactic forms of the exact fixed `sha-9752c689c927` value:

- bare;
- single quoted;
- double quoted;
- any of those with surrounding dotenv whitespace, including CRLF line endings.

Interpolation, inline comments, wrong tags, duplicate/non-canonical assignments, and every other syntax remain rejected. Acceptance still requires all subsequent checks: rendered repository/tag equality, running container reference and image ID, configured local image ID, exactly one same-repository `RepoDigest`, immutable digest pull returning the same image ID, staged Compose validation, paired restoration, and formal migration rollback.

## Verification

- accepted fixtures: bare, single-quoted, double-quoted with spaces, CRLF;
- rejected fixtures: interpolation that semantically expands to the expected tag, comment syntax that semantically resolves to the expected tag, and wrong tag; each raw-syntax fixture asserts the specific rejection reason;
- hardening/redaction/Relay-SBOM suite: pass;
- `bun run ci:audit`: clean;
- YAML, shell syntax, ShellCheck, and `git diff --check`: pass.

## Residual risk

The exact decoration present on production is deliberately not printed. The next protected retry must identify the fixed syntax category without exposing the value. Any acceptance change requires category-specific reasoning and must still complete the full image/runtime identity chain before service mutation.
