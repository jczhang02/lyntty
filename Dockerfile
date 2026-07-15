# Build a standalone, API-only Relay. The runtime image contains no Bun or Node.
FROM oven/bun:1.3.14-debian AS builder

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates build-essential python3 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /repo

COPY package.json bun.lock .bun-version ./
COPY scripts/postinstall.cjs scripts/postinstall.cjs
COPY patches patches
COPY packages/lyntty-app/package.json packages/lyntty-app/package.json
COPY packages/lyntty-cli/package.json packages/lyntty-cli/package.json
COPY packages/lyntty-relay/package.json packages/lyntty-relay/package.json
COPY packages/lyntty-relay/prisma packages/lyntty-relay/prisma
COPY packages/lyntty-wire/package.json packages/lyntty-wire/package.json

RUN bun install --frozen-lockfile --ignore-scripts \
    && bun scripts/postinstall.cjs \
    && bun run --filter lyntty-relay generate

COPY packages/lyntty-relay packages/lyntty-relay
COPY packages/lyntty-wire packages/lyntty-wire

RUN bun run --filter lyntty-wire build \
    && bun run --filter lyntty-relay build:standalone

FROM debian:bookworm-slim AS runtime

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates curl ffmpeg \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /opt/lyntty-relay

COPY --from=builder /repo/packages/lyntty-relay/dist/lyntty-relay /usr/local/bin/lyntty-relay
COPY --from=builder /repo/packages/lyntty-relay/dist/pglite.wasm ./pglite.wasm
COPY --from=builder /repo/packages/lyntty-relay/dist/pglite.data ./pglite.data
COPY --from=builder /repo/packages/lyntty-relay/dist/prisma ./prisma
COPY --chmod=755 scripts/relay-container-entrypoint.sh /usr/local/bin/lyntty-relay-entrypoint

ENV DATA_DIR=/data
ENV PGLITE_DIR=/data/pglite

VOLUME ["/data"]
EXPOSE 3005

ENTRYPOINT ["/usr/local/bin/lyntty-relay-entrypoint"]
