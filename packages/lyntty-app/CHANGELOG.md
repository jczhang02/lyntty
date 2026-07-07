# Lyntty Android 1.0.0 (4) — 2026-07-07

First clean Lyntty Android release line.

## Highlights

- Pi-only mobile control through `lynttyd` and `relay`.
- Self-hosted relay at `https://relay.jczhang.cc`.
- GitHub Releases APK update flow through relay `/v1/version`.
- SHA-256 verification before the Android package installer opens.

## Fixed

- Replaced stale Happy launcher and splash assets with Lyntty assets.
- Settings now shows native app version and build, for example `1.0.0 (4)`.
- Replaced inherited Happy changelog text with fixed Lyntty release notes.
- Session prose uses Source Serif 4 for English and LXGW Neo ZhiSong for Chinese.

## Known gaps

- Physical Android phone end-to-end smoke still needs recording after this build.
- Backup restore and relay rollback drills remain pending.
