# R103 — Exact historical identity of the production prior Relay runtime

Date: 2026-07-22

Branch: `fix/relay-prior-identity`

Bead: `lyntty-24v.3`

## Why R65 alone was insufficient

Protected run `29880608810` proved that production configuration and the running container both use an `alternate-sha-tag`, not the original R65 tag. The explicit stale-config repair correctly rejected this before changing `.env` or stopping the service.

A GitHub history audit found a later legitimate production deployment that the earlier migration evidence had omitted.

## Successor identity evidence

- source commit: `e243429200bd83288f1dac1454a2db43a4024003` (GitHub verification: valid);
- Git ref `android-v1.0.0-5` currently resolves to that commit (the GitHub Release is not marked immutable, so the verified commit and workflow provenance—not tag immutability—are the authority);
- Relay image workflow: run `29023065350`, `workflow_dispatch`, success;
- image tag: `ghcr.io/jczhang02/lyntty-relay:sha-e243429200bd`;
- OCI index digest: `sha256:fe3bf95fd7e19cd34c3f94ff2aedeced9497535db797f07ba37241083dd8e83d`;
- amd64 manifest digest: `sha256:342869c8f79e9affb77a1e29ae2aa616e74816803277edc96c406a64870b1012`;
- OCI attestation manifest: `sha256:eaaa162f018dc93af891ed2f5725d1e24ea3b54c4df6fb5eb959d670c46e4669`;
- SLSA provenance builder: `https://github.com/jczhang02/lyntty/actions/runs/29023065350/attempts/1`;
- provenance records workflow/source revision `e243429200bd83288f1dac1454a2db43a4024003` and the amd64 subject above;
- production deploy workflow: run `29023552000`, `workflow_dispatch`, success, and its final `docker compose ps` records the same `sha-e243429200bd` tag;
- an anonymous GHCR manifest HEAD on 2026-07-22 still returns the exact same index digest.

The public production Relay remained healthy and continued to serve the Android `versionCode=5` contract associated with this historical deployment during diagnosis.

## Exact prior-runtime allowlist

The legacy migration now recognizes only these two historical tag-to-index-digest identities:

1. R65:
   - tag `sha-9752c689c927`;
   - image run `28847187170`;
   - digest `sha256:2eb926b37741e9b047b6e6f178ffdb0e84ed41c6649180421b3f4861838ff715`.
2. Android-v1.0.0-5 successor:
   - tag `sha-e243429200bd`;
   - image run `29023065350`;
   - deploy run `29023552000`;
   - digest `sha256:fe3bf95fd7e19cd34c3f94ff2aedeced9497535db797f07ba37241083dd8e83d`.

A source tag is accepted as a prior runtime identity only when the rendered Compose reference, running container reference, container/local image IDs, expected RepoTag, the single same-repository RepoDigest, immutable pull result, and the hardcoded tag-to-digest mapping all agree. Arbitrary alternate SHA runtimes and a documented tag paired with the other digest are rejected. The separate R102 stale-configuration repair may normalize an unlisted configured SHA only when the running container and complete byte-identity chain still prove the exact R65 identity; it never accepts that unlisted SHA as a runtime.

Canonical state accepts only a documented historical prior digest, the current signed BOM target digest supplied by the workflow, or the exact predecessor digest recorded in root-owned mode-600 `deployed-bom.txt` and paired with its one-line `deployed-sequence.txt`. This recorded predecessor case preserves future signed N→N+1 upgrades without accepting arbitrary canonical digests.

## Verification

The extracted remote seam covers both documented identities, the current signed target retry state, a recorded predecessor N→N+1 state, successor-tag/digest mismatch rejection, unknown canonical digest rejection, immutable pull identity, paired layout restoration, and existing secret-redaction checks.

Repository hardening, audit, YAML/shell syntax, error-level ShellCheck, and `git diff --check` must pass before protected integration.

## Residual risk

The next protected deployment must prove the live running bytes match the exact successor mapping. Historical workflow and registry evidence does not substitute for that live container/image/RepoDigest chain.
