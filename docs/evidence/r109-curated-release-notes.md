# R109 — Curated GitHub Release Notes

Date: 2026-07-23

Status: three authorized title/body edits are live and independently verified

## Scope

The owner explicitly supplied and confirmed version, CodeName, emoji, and exact tag for three existing Releases, reviewed the complete drafts, then authorized publication. This operation changed only each existing Release title/body through `gh release edit`:

- Stable Compatibility: `compat-v1.2.0_1.2.0_1.2.0_0.2.0-s1`;
- APK-only Preview: `android-preview-v1.2.0-920001`;
- Expo Dev durable prerelease: `android-expo-dev-v1.2.0-930001`.

No Release, tag, or asset was created, deleted, uploaded, replaced, renamed, or moved. Draft, prerelease, immutable, target, and GitHub Latest state were not changed. No reaction was added.

## Approved edits

| Tag | Release ID | Title | Body SHA-256 before | Body SHA-256 after |
| --- | ---: | --- | --- | --- |
| `compat-v1.2.0_1.2.0_1.2.0_0.2.0-s1` | `357552269` | `V1.2.0 Local First 📡` | `be862cef92d4200098ca592ce58edad506cb32e5e43ff77fa264f031b6c20d54` | `3851e442cc260a1ed5dbfa7f4151fefeb3f85a17f864ed11420832e2a4db4996` |
| `android-preview-v1.2.0-920001` | `357064582` | `V1.2.0 Local First 📡` | `9cdc3d6fade06530de3440cfe3e6df1f4f35ae9ae7a86dda2b312b899094f08a` | `ab6dd8b9879129a568b2754954ca368b16c2803fc0db48c482e58f2e60e88368` |
| `android-expo-dev-v1.2.0-930001` | `358594428` | `V1.2.0 Metro Link 🔌` | `d8adcb6430d9071120fccdc04d4bc705fc6495656ca234fadae123cbbfa85531` | `f2306dc3d82315ae29cc802006a3f4b9b457be4008463dadfc871f8f4091f984` |

Stable and Preview titles were already correct. Expo Dev changed from `Lyntty Expo Dev v1.2.0 (930001)` to the confirmed curated title.

The resulting notes use one centered, Release-target-pinned Lyntty header followed by equal-order English and Chinese changelogs and `Thanks`. Optional Download, Install, Integrity, build-identity, signer, checksum, attestation, and device-validation sections were removed.

Required public disclosures remain:

- Stable starts with the exact current output of `scripts/stable-release-validation.ts`; generated warning SHA-256 is `4257d337c06876063c9dbb71cc0d2dc2e24fd359dd25d5df6f631d470d45ad89`.
- Stable retains the required macOS/Windows platform-unsigned statement.
- APK-only Preview retains its existing deterministic bilingual owner-waiver warning byte-for-byte.
- Expo Dev has no extra warning section. Its first English and Chinese items require Metro from a compatible source checkout on port `8081` and state that the APK cannot run standalone.

## Publication commands

Each edit used only the options allowed by `.agents/skills/release-notes/SKILL.md`:

```bash
gh release edit "compat-v1.2.0_1.2.0_1.2.0_0.2.0-s1" --repo "jczhang02/lyntty" \
  --title "V1.2.0 Local First 📡" \
  --notes-file "/tmp/lyntty-release-notes-drafts.bQ9S30/stable.md"

gh release edit "android-preview-v1.2.0-920001" --repo "jczhang02/lyntty" \
  --title "V1.2.0 Local First 📡" \
  --notes-file "/tmp/lyntty-release-notes-drafts.bQ9S30/preview.md"

gh release edit "android-expo-dev-v1.2.0-930001" --repo "jczhang02/lyntty" \
  --title "V1.2.0 Metro Link 🔌" \
  --notes-file "/tmp/lyntty-release-notes-drafts.bQ9S30/expo-dev.md"
```

`gh release create` was not run. No status, target, tag, asset, or Latest option was passed.

## Live verification

Immediately before mutation, fresh Release API, direct tag-ref, and Latest snapshots had to equal the state used for drafting. Approved body byte counts and hashes were checked before the first edit. Each edit was followed by an immediate API and tag-ref verification; a final combined audit then fetched all three objects again through both `gh api` and `gh release view`.

Final identity:

| Tag | Target and direct tag SHA | Draft | Prerelease | Immutable | Assets | Asset inventory SHA-256 |
| --- | --- | --- | --- | --- | ---: | --- |
| `compat-v1.2.0_1.2.0_1.2.0_0.2.0-s1` | `39745de8dc9d7b7bfa6706320abbabb05c6cc3e1` | false | false | true | 36 | `38049d4ddd0eb53a359605d37c1b083af39feab85f93fa9aa76a8030301b5f35` |
| `android-preview-v1.2.0-920001` | `60f0d620f97f91ea20ac7a97d85bcc9685e46e83` | false | true | true | 5 | `3dc3bd05a95f151c8ae4f4b4b3a5e6f1d672e38c11da1ab384db114bcaa30b6d` |
| `android-expo-dev-v1.2.0-930001` | `04b63ea7a35f98c3012cc2ca6b00b7dae9e76968` | false | true | true | 7 | `6068145df3f84700071d93a45b4dba32b56b4fab904d264da674fe94f789ff83` |

All 48 sorted asset tuples matched before and after by numeric ID, name, size, and API SHA-256 digest. Release numeric/node IDs, targets, publication state, direct tag refs, and asset inventories were unchanged. GitHub Latest remained Release `357552269`, tag `compat-v1.2.0_1.2.0_1.2.0_0.2.0-s1`.

Mechanical draft checks and two rounds of read-only review caught and corrected ambiguous APK Preview Relay wording, archive-count wording, the Expo Dev compatible-checkout condition, the Preview logo target, and an old Stable warning paraphrase. The final draft verifier returned `PASS`. A separate post-publication verifier made fresh read-only GitHub queries, found no additional target Release, and returned `PASS` for all live bodies and invariants.

Repository evidence checks also passed:

```text
bun run test:repo-hardening
41 pass, 0 fail

git diff --check
git diff --cached --check
PASS
```

## Not run and residual risk

- Release assets were not all downloaded again because title/body edits cannot alter immutable asset bytes. Verification compared all 48 API-bound ID/name/size/digest tuples. The Stable `android-validation.json` asset alone was downloaded to regenerate its canonical warning.
- GitHub-rendered pages were not browser-tested; source Markdown was compared byte-for-byte through the Release API and `gh release view`.
- No workflow was dispatched or rerun. A historical promotion retry that requires the original machine-generated body may now fail closed on the curated body; no retry is authorized by this notes edit.
- Asset `download_count` is not an identity field and can change on read. It was excluded from the immutable tuple comparison.
