# R124 — Stable 1.2.2 production deployment and targeted session repair

Date: 2026-07-27

Branch: `docs/r124-stable-1.2.2-deployment`

Beads: `lyntty-eci`, follow-up `lyntty-ea7`

Release: [`compat-v1.2.2_1.2.2_1.2.2_0.2.0-s3`](https://github.com/jczhang02/lyntty/releases/tag/compat-v1.2.2_1.2.2_1.2.2_0.2.0-s3)

## Outcome

Stable 1.2.2 is now deployed to the production `relay` and installed locally as `lyntty`/`lynttyd`. The target Pi session was repaired in its existing Relay row from canonical Pi JSONL:

| Field | Before | After |
| --- | --- | --- |
| Production Relay | earlier Stable runtime | `1.2.2`, OCI `sha256:65d782...6447` |
| Local CLI / `lynttyd` | `1.2.0` | `1.2.2@f2b22a4` |
| Daemon PID | `2891` | `1266556` |
| Service PATH | no `/opt/bin` | includes `/opt/bin` |
| Relay session ID | `cmrwsbw3x015n01mrbagof44g` | unchanged |
| Relay seq | `1034` | `9021` |
| Append checkpoint | `3c3f1042` | `c2068e99` |
| Target metadata | stale `history_gap` reason | `ready`, `piHasHistoryGap=false` |
| Canonical name | useful existing title | `lyntty notification upgrade session optimization` |

The repair added exactly `7,987` canonical session-protocol rows with unique deterministic localIds. The strict result was `7,987 matching`, `0 missing`, `0 conflicting`, and `0 outbox conflicts`. The stable tag still resolves to exactly one existing Relay session; no duplicate runtime or Relay row was created.

## Production Relay deployment

Protected workflow run [`30261452266`](https://github.com/jczhang02/lyntty/actions/runs/30261452266) deployed from protected `main@5a64b6348c278c39d67528328e8de287159e0836`. The immutable release source `f2b22a4da144627aef485e984de9aa2324bbc08c` is its ancestor. GitHub Deployment `5621505334` for `production-relay` ended in `success`.

The workflow resolved the signed s3 BOM and pinned:

```text
ghcr.io/jczhang02/lyntty-relay@sha256:65d7823d1938f36867c2a798c7cb37a20b1e60cb9d93cb5bb4c40c100d546447
```

Before migration it wrote and sidecar-verified a `162,703,305`-byte PGlite backup:

```text
/backups/predeploy-compat-v1.2.2_1.2.2_1.2.2_0.2.0-s3-20260727T112130Z.backup
SHA-256 a7f3415fbad5417bdfc2764391665de7d88390f670388f700b2fefe692a0d56f
```

Migration reported `39` applied, `0` pending, and schema compatibility `ok`. The workflow then verified the exact image revision/version, local health, public health, and the complete signed BOM/APK response. Fresh post-repair requests still return `status=ok`, app `1.2.2`, `versionCode=8`, s3 sequence `3`, BOM SHA-256 `9453da...8b2b`, and APK SHA-256 `5ccb63...caae`.

## Signed local update

The installed 1.2.0 updater verified the Stable trust roots and selected the exact Linux x64 artifact:

```text
Archive: lyntty-cli-1.2.2-linux-x64.tar.gz
Size: 93,642,529 bytes
SHA-256: 1722b8dcc0a0c3f0ec3ee48b73e717541b671db8659f858883d37425855a1ca5
Manifest SHA-256: d5b3666941ffeb14c3f80f57b1aa603e55b0e2bdbfcca0b9d2a16cb311c04b84
```

The candidate self-check verified `178` files, source `f2b22a4`, CLI/daemon `1.2.2`, target `linux-x64-glibc`, and Wire protocol `1.1`. Its atomic updater stopped the old service, swapped the managed extension and `current` pointer, reinstalled the user service, started the matching daemon, and committed only after the daemon health identity matched. Rollback state retains `lyntty-cli-1.2.0-linux-x64` as the previous known-good release.

The final unit runs `current/lynttyd` directly and has:

```text
PATH=/home/jc/.local/bin:/home/jc/.cargo/bin:/opt/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin
```

Final daemon PID `1266556` remains `active/running`, reports release `lyntty-cli-1.2.2-linux-x64`, and has `NRestarts=0` since the final controlled start.

## Canonical-data and active-runtime safety

The active Pi process was never stopped, signalled, reloaded, or replaced:

```text
PID: 1078376
start ticks: 38315346
executable: /opt/pi-coding-agent/pi
cwd: /home/jc/dev/lyntty
extension instance: 23382957-400e-42bd-99d4-787fc74a68db
```

The same extension instance reconnected to the final daemon. The updater changed the managed extension bytes on disk for future sessions, from SHA-256 `27ccaa...a56` to `0128a7...44f`, but did not force `/reload` in the running Pi process.

Canonical JSONL kept inode `10357666`. Its full pre-update `22,056,176`-byte prefix remained byte-identical after deployment and repair:

```text
SHA-256 d053f3b7be83c72780e9920d7bdcf9e7c9ffba64746bb9c25713f70eb1b807f1
```

The active root checkout also stayed at `4043171d3b6e89ef32a5a7a3c56d5c7b7ab9b40c`; its pre-existing status digest was unchanged. No canonical JSONL rewrite, root pull, Pi restart, extension reload, or session replacement occurred.

## Automatic recovery blocker and bounded repair

The first 1.2.2 daemon restart correctly failed closed instead of blindly replaying. Its startup inventory has a `10,000 ms` total deadline while it pages Relay history from sequence zero. A read-only production measurement required:

```text
1,034 messages
11 pages of 100
51,362 ms cold elapsed
```

A later strict exact-release inventory completed after cache warming and found `7,987` missing canonical envelopes and no conflicts. The checkpoint therefore correctly remained `3c3f1042`; automatic recovery was not falsely accepted.

Because simply extending the startup deadline would violate bounded Session Remote opening, the live repair used a one-time exact-release reconciliation while only `lynttyd` was stopped. It reused the committed `ApiSessionClient`, canonical mapper, grouping, conflict handling, encrypt-once outbox, and checkpoint persistence from 1.2.2, with explicit `180 s` inventory and `600 s` ACK budgets. The temporary source had SHA-256 `3565da...3f81`; no token, key, ciphertext, or private message content was stored in evidence.

The checkpoint was advanced only after this strict result:

```text
sent: 7987
matching: 7987
missing: 0
conflicting: 0
outboxConflictLocalIds: []
contiguousAppendCheckpointEntryId: c2068e99
```

An independent post-repair Relay audit then established:

- Relay seq changed exactly from `1034` to `9021`;
- seq `1035..9021` contains exactly `7,987` rows and `7,987` unique canonical localIds;
- every delta localId starts with `session:pi-history-`;
- the latest 50 decrypted envelopes all bind `localId == session:<envelope.id>`;
- the highest row is `session:pi-history-a5d093ae-end`, a `turn-end` envelope;
- encrypted metadata is version `13`, names the target Pi session, reports `runtimeOwner=pi-extension`, `controlState=ready`, `piHasHistoryGap=false`, and has no recovery reason;
- the final daemon log contains the target extension heartbeat and no target inventory, conflict, or `history_gap` warning.

## Verification artifacts

- [`artifacts/r124/relay-deployment.json`](./artifacts/r124/relay-deployment.json)
- [`artifacts/r124/local-update-repair.json`](./artifacts/r124/local-update-repair.json)
- [`artifacts/r124/repair-target-session.ts.txt`](./artifacts/r124/repair-target-session.ts.txt)
- [`artifacts/r124/verification.log`](./artifacts/r124/verification.log)

The exact temporary repair source is retained as non-executable historical evidence and matches SHA-256 `3565da...3f81`. It is not a supported operator command: it pins this one session, assumes `lynttyd` was stopped by an external guarded transaction, and must not be rerun. The JSON artifacts contain only selected identities and aggregate results. Credentials, release trust blobs, request headers, encrypted payloads, pairing URLs, and private message text are omitted.

The evidence change passed repository hardening (`85/85`), root and docs dependency audits with no vulnerabilities, docs preparation/MDX/TypeScript checks (`42` pages), JSON parsing, local-link checks, paired-document structure checks, selected sensitive-pattern scanning, and whitespace validation. Independent live-state and evidence reviewers returned `VERIFIED_NO_P0_P1_P2` after the historical repair source was retained and deployment timestamps were clarified.

## Not run and residual risk

- No physical Android phone install, launch, visual timeline check, or phone-to-Relay-to-`lynttyd` round trip was performed or claimed. The server-side latest-tail decryption and binding audit passed, but it is not physical-device acceptance.
- No forced Pi extension reload or Pi process restart was performed.
- The full repository gates were not repeated after deployment because deployed source and artifacts were immutable and already passed R122/R123 Candidate and Promotion gates. This change is evidence-only and received the documentation/repository checks above.
- Production-scale inventory remains a product bug. `lyntty-ea7` tracks a resumable or compact inventory design that preserves bounded opening and strict localId semantics. Three other active Pi sessions logged the same fail-closed timeout and were intentionally not mutated by this targeted repair.
- The repaired target is safe at checkpoint `c2068e99`; a future missing/stale checkpoint on a very large Relay session can still require the follow-up fix rather than another ad hoc timeout increase.
