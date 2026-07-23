# R110 — Legacy Android Release Removal

Date: 2026-07-23

Status: three owner-authorized legacy GitHub Releases and their assets were deleted; their Git tags and every current release channel were preserved and independently verified

## Authorization and scope

The owner explicitly instructed: `这三个 release 直接删除.` The phrase referred to the three legacy Android Releases identified immediately beforehand:

- `android-v1.7.1-3`;
- `android-v1.0.0-4`;
- `android-v1.0.0-5`.

Deletion applied to the three GitHub Release objects and their six attached assets. The command intentionally omitted `--cleanup-tag`, so all three direct Git tags remain. Stable Compatibility, APK-only Preview, Expo Dev, their assets and tags, GitHub Latest, workflows, and reactions were outside the deletion scope.

## Pre-delete identity

| Tag | Release ID | Node ID | Direct tag SHA | Body SHA-256 | Asset inventory SHA-256 |
| --- | ---: | --- | --- | --- | --- |
| `android-v1.7.1-3` | `349921576` | `RE_kwDOTBWyxc4U22Eo` | `9752c689c92744466abb15828c06f10c2653669b` | `aead5a222cb8411d8371744c1bbc51fc70790f32976d13b46e0c3e2660d81181` | `066d54bff9d0bf987af77b2d178d33694370e8254ddf4bfe15bf71cb3c244520` |
| `android-v1.0.0-4` | `350330783` | `RE_kwDOTBWyxc4U4Z-f` | `8868767032a8abf31af564074e99ff66f20d796e` | `90cdf0b9cb8917b9f9b9156b8d65c45a351f0790ad345abfca5b933a13eba4c1` | `a80112f63bf908003dde1b9f93570cae2b26e74e2a5253e910ad7813ce30d91b` |
| `android-v1.0.0-5` | `351558216` | `RE_kwDOTBWyxc4U9FpI` | `e243429200bd83288f1dac1454a2db43a4024003` | `9ca400a58309b9d394ca8fe1febf56f9e1af7b3b9d2b1cc62bcb0a99c9098476` | `e88ce7cfae5c84bdfff0cd614a85cbfed62e97d0703f05b79b5b66660f92fa99` |

Each Release was non-draft, non-prerelease, and non-immutable, with two assets:

| Tag | Manifest asset ID | APK asset ID | APK size | APK API SHA-256 digest |
| --- | ---: | ---: | ---: | --- |
| `android-v1.7.1-3` | `468535644` | `468535645` | `125200576` | `9bd412dcc452d5cf046ee35a50a8ddd70ff9a6f207b2e2d6a967acd27af15b43` |
| `android-v1.0.0-4` | `469205228` | `469205229` | `132427524` | `8425801a699c53a8285528d532d841f37fa6ccf3afbd4b40f5e443cddaaea4fc` |
| `android-v1.0.0-5` | `471384267` | `471384268` | `132087156` | `1100eb0df3d88ca9dc446b9575768bd16937194f030315732ecbfc0ed07b94d7` |

A complete API snapshot of each body and asset tuple was taken before deletion. The public legacy Relay endpoint `https://relay.jczhang.cc/v1/version` already returned HTTP 404 before deletion; it did not serve a live update manifest pointing at these assets.

## Deletion commands

The following commands were run without `--cleanup-tag`:

```bash
gh release delete "android-v1.7.1-3" --repo "jczhang02/lyntty" --yes
gh release delete "android-v1.0.0-4" --repo "jczhang02/lyntty" --yes
gh release delete "android-v1.0.0-5" --repo "jczhang02/lyntty" --yes
```

No tag-delete, asset-delete, Release-create/edit, workflow-dispatch, or reaction command was run.

## Post-delete verification

Fresh authenticated GitHub API checks proved:

- all three Release lookups by exact tag return HTTP 404;
- all three Release lookups by former numeric ID return HTTP 404;
- all six former asset-ID endpoints return HTTP 404;
- all three parsed direct-tag objects are structurally equal to their pre-delete snapshots and retain the SHAs in the identity table;
- the repository Release list now contains exactly the three current channel Releases below.

| Preserved Release | Release ID | Target/direct tag SHA | Draft | Prerelease | Immutable | Assets |
| --- | ---: | --- | --- | --- | --- | ---: |
| Stable Compatibility `compat-v1.2.0_1.2.0_1.2.0_0.2.0-s1` | `357552269` | `39745de8dc9d7b7bfa6706320abbabb05c6cc3e1` | false | false | true | 36 |
| APK-only Preview `android-preview-v1.2.0-920001` | `357064582` | `60f0d620f97f91ea20ac7a97d85bcc9685e46e83` | false | true | true | 5 |
| Expo Dev `android-expo-dev-v1.2.0-930001` | `358594428` | `04b63ea7a35f98c3012cc2ca6b00b7dae9e76968` | false | true | true | 7 |

For all three preserved Releases, title/body, Release identity, target, publication flags, direct tag ref, and every asset ID/name/size/digest tuple remained equal to the pre-delete snapshot. Their 48 assets were unchanged. GitHub Latest remains Release `357552269`, tag `compat-v1.2.0_1.2.0_1.2.0_0.2.0-s1`.

A separate verifier made fresh read-only `gh api` queries for all deleted Releases, former assets, retained tags, current Releases, and Latest. It independently returned `PASS`.

Repository evidence checks passed:

```text
bun run test:repo-hardening
41 pass, 0 fail

git diff --check
git diff --cached --check
PASS
```

## Not run and residual implications

- The three legacy APKs were not downloaded or re-hosted before deletion. Their GitHub Release download URLs are intentionally unavailable now; the retained source tags do not retain attached Release assets.
- Historical evidence such as R65 and R66 remains an accurate record of publication at that time, but its old Release download URLs now return 404.
- An old installed APK or private manifest that directly pins one of the deleted URLs can no longer download it. The current Compatibility Stable, APK Preview, and Expo Dev distribution paths were not changed.
- The retained Git tags can be deleted only under a separate explicit authorization; this operation did not grant it.
