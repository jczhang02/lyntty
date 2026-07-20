# R87 — `shell-quote` security update

Date: 2026-07-21

Status: local security remediation verified; protected PR and replacement Android Preview Candidate are pending.

## Trigger

A final release-policy verification initially completed with zero audit findings. GitHub then published the reviewed advisory [GHSA-395f-4hp3-45gv](https://github.com/advisories/GHSA-395f-4hp3-45gv), and repeated `bun audit` runs began failing on the repository's exact `shell-quote@1.8.4` override.

GitHub records CVE-2026-13311 as a high-severity quadratic-complexity denial of service in `shell-quote.parse()`, affecting versions `<=1.8.4`; the first patched version is `1.9.0`. A sufficiently large attacker-controlled token string can block the JavaScript event loop because vulnerable releases repeatedly copy the growing output array.

## Change

The root override and Bun lock entry move from `shell-quote@1.8.4` to exact `shell-quote@1.9.0`. No other package version or lock entry changes. A repository-hardening regression binds both `package.json` and `bun.lock` to the patched version and rejects the vulnerable lock entry.

The dependency is inherited through React Native tooling. This remediation does not add a new runtime, package surface, application feature, or release asset.

## Verification

Because `package.json` and `bun.lock` are source-integrity inputs, the dirty working tree is expected to fail the Preview import fixture before commit. The exact staged tree was therefore materialized as a temporary clean synthetic commit and verified before any durable commit.

```bash
bun install --frozen-lockfile
bun audit
bun test scripts/workflow-hardening.test.mjs scripts/evidence-redaction.test.mjs
bun run ci:fast
git diff --check
```

Results:

- frozen install: 2,704 packages, no lockfile change;
- `bun audit`: no vulnerabilities;
- hardening/redaction: 20 passed;
- Wire: 33 tests / 76 assertions;
- CLI: 585 / 1,272;
- Relay: 119 / 332 plus compiled runtime smoke;
- App: 812 / 3,276 across 90 isolated files plus a 13,068,103-byte Preview bundle smoke;
- isolated development/Preview lifecycle: 35 / 194;
- `git diff --check`: passed.

Additional focused verification resolved the React Native dependency's `shell-quote/package.json` as version `1.9.0` and parsed 128,000 tokens in 105 ms under a five-second deadline. The output contained exactly 128,000 unchanged tokens, proving that the installed patched implementation does not exhibit the vulnerable stall at the advisory's demonstrated input size.

## Preview Candidate boundary

`package.json` and `bun.lock` are Android Candidate build inputs. Therefore Candidate run `29762476280` and APK SHA-256 `9025d83a142ded5a618ef15c56c9bdd5486fed8336a53f1b9f0c7336b325aae9` remain valid historical evidence but are no longer eligible for public Promotion after this security change merges.

The release must stop, merge this remediation through protected checks, and build/audit/attest a fresh `1.2.0` / `920001` Candidate from the new protected `main`. Its new exact SHA-256, manifest, provenance, sidecars, allowlist, and public waiver evidence must be reviewed before Promotion. No tag, draft, or Release is created by this PR.

## Residual risk

The exact `920001` replacement Candidate will still lack physical Android validation under the owner-authorized truthful waiver. That waiver remains a separate protected release-policy change and must publish an explicit bilingual unverified-device warning; this security PR does not claim physical acceptance or weaken any release gate.
