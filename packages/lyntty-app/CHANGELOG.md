# Lyntty Android 1.1.0 — 2026-07-18

Adds signed Compatibility BOM updates and channel-isolated Stable/Preview delivery.

## Highlights

- Relay verifies the Ed25519 Compatibility BOM before exposing an APK update.
- Stable and Preview keep separate package, signer, trust-root, release, and Relay image identities.
- Android hashes large APKs through a native streaming verifier before Package Installer opens.
- App and Relay advertise Wire `1.1` capabilities for one-minor rolling upgrades.

## Verification

- Release-style Preview upgrade, bad-digest rejection, Node-free Production-config build, Pi shared-control Maestro matrix, and signed-BOM compatibility tests passed.

# Lyntty Android 1.0.0 (5) — 2026-07-09

Improves the Android launcher icon scale for clearer One UI home-screen presentation.

## Fixed

- Reduced the `Ly` launcher mark size so Samsung One UI shows more dark background breathing room and matches the established Lyntty visual target.
- Regenerated shared Expo icon assets and native Android launcher resources used by development and production APK builds.

## Verification

- App typecheck, dev APK build, release-style APK build, and APK icon resource checks passed before release prep.

# Lyntty Android 1.0.0 (4) — 2026-07-07

First clean Lyntty Android release line.

## Highlights

- Pi-only mobile control through `lynttyd` and `relay`.
- Self-hosted relay at `https://relay.jczhang.cc`.
- GitHub Releases APK update flow through relay `/v1/version`.
- SHA-256 verification before the Android package installer opens.

## Fixed

- Refreshed launcher and splash assets with the current Lyntty identity.
- Settings now shows native app version and build, for example `1.0.0 (4)`.
- Standardized the in-app changelog on fixed Lyntty release notes.
- Session prose uses Source Serif 4 for English and LXGW Neo ZhiSong for Chinese.

## Known gaps

- Physical Android phone end-to-end smoke still needs recording after this build.
- Backup restore and relay rollback drills remain pending.
