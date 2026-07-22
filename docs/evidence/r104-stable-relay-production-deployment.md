# R104 — First Stable Relay production deployment

Date: 2026-07-22

Branch: `docs/relay-production-evidence`

Beads: `lyntty-24v.3`, `lyntty-24v`

## Result

The first signed Stable Relay was backed up, schema-checked, deployed by immutable OCI digest, and independently verified on the public production endpoint.

- Stable release: `compat-v1.2.0_1.2.0_1.2.0_0.2.0-s1`
- Stable sequence: `1`
- release source: `39745de8dc9d7b7bfa6706320abbabb05c6cc3e1`
- protected deploy implementation: `7b6efde56e98415ab3474e7b6959eceaef7c25b0`
- target Relay digest: `sha256:a2fb96b60c48767b242f920a8a6e4f9637d0d50607a5787bc67a503cc39c64ed`
- production deploy run: `29883473315`
- job: `88809085030`
- GitHub deployment: `5548421896`, final status `success`

Every workflow step succeeded, including signed BOM resolution, OCI attestation verification, pinned SSH trust, backup/migrate/doctor/deploy, and public contract verification.

## Prior runtime proof and layout migration

The live pre-Stable runtime matched the exact R103 successor identity:

- tag: `sha-e243429200bd`
- source: `e243429200bd83288f1dac1454a2db43a4024003`
- prior index digest: `sha256:fe3bf95fd7e19cd34c3f94ff2aedeced9497535db797f07ba37241083dd8e83d`

The workflow required the configured and running tag, container/local image IDs, expected RepoTag, sole same-repository RepoDigest, immutable pull, and hardcoded historical mapping to agree before mutation. It then migrated the legacy variable image scalar to an immutable digest and installed the persistent `/backups` bind with paired root-private backups.

Earlier diagnostic/deploy runs remained fail-closed. They either stopped before service mutation or performed only their explicitly documented backup-first configuration canonicalization. No incomplete marker was left: the successful deployment completed, and the later idempotent run passed both marker guards.

## Backup and schema evidence

The production transaction emitted and verified one persistent PGlite predeploy backup:

- provider: `pglite`
- size: `112759908` bytes
- SHA-256: `57a8357256f0e9802ce9fc1ec310b2466f1566e8989a183620794d2e41ec80be`
- path class: `/backups/predeploy-compat-v1.2.0_1.2.0_1.2.0_0.2.0-s1-*.backup`
- checksum sidecar verification: `OK`

GitHub masked part of the timestamped basename in the log; this document does not reconstruct or invent the hidden bytes.

Migration/doctor output:

```text
Migrating database in /data/pglite...
No new migrations to apply.
Relay database provider: pglite
Applied migrations: 39
Pending migrations: 0
Schema compatibility: ok
```

The target container was recreated and reached:

```text
ghcr.io/jczhang02/lyntty-relay@sha256:a2fb96b60c48767b242f920a8a6e4f9637d0d50607a5787bc67a503cc39c64ed
```

Transient connection resets occurred only during process startup; bounded health polling then succeeded and the job continued to exact local/public version checks.

## Public production verification

Independent requests after the workflow completed returned:

```json
{"status":"ok","service":"lyntty-relay"}
```

The health response also contains a server timestamp, intentionally omitted above.

`POST /v1/version` with the Stable Android request returned the exact contract:

```json
{
  "update_required": true,
  "version_name": "1.2.0",
  "version_code": 6,
  "apk_url": "https://github.com/jczhang02/lyntty/releases/download/compat-v1.2.0_1.2.0_1.2.0_0.2.0-s1/lyntty-stable.apk",
  "update_url": "https://github.com/jczhang02/lyntty/releases/download/compat-v1.2.0_1.2.0_1.2.0_0.2.0-s1/lyntty-stable.apk",
  "sha256": "27ee7a3f7adf5f6634129559c8b35b2b1c903f90b0387b45e3a39531b40bede0",
  "release_channel": "stable",
  "bom_release_id": "compat-v1.2.0_1.2.0_1.2.0_0.2.0-s1",
  "bom_sequence": 1,
  "bom_sha256": "df231effa7b3047fb7acdd400cff49434494012b8e17767aee72f1d7049a8bca"
}
```

## Idempotency

A second owner-approved dispatch of the same BOM succeeded:

- run: `29883633696`
- job: `88809570425`
- result: `requested Stable BOM is already healthy, exact, and deployed`

The replay log contains no backup JSON, migration, doctor, or container recreation output. It verified the recorded sequence/BOM, target image identity, local health, full local version contract, and public version contract without redeploying.

## Commands and checks

- GitHub protected deployment and idempotent replay: success.
- GitHub deployment API final state: `success`.
- public `GET /health`: success.
- public Stable `POST /v1/version`: exact release/BOM/APK match.
- independently downloaded Release `compatibility-bom.json`: SHA-256 `df231effa7b3047fb7acdd400cff49434494012b8e17767aee72f1d7049a8bca`, exactly matching production.
- target OCI digest: exact signed BOM digest.
- persistent backup + `.sha256` sidecar: verified.
- migration and `doctor`: 39 applied, 0 pending, schema compatible.

## Not run and residual risk

- No physical Android device test was run for this owner-use Stable release; the published owner waiver remains authoritative.
- No destructive production rollback was performed. Rollback and failed-restoration behavior are covered by isolated workflow hardening tests, while the predeploy backup and sidecar remain the production rollback artifact.
- iOS and Google Play remain out of scope.
