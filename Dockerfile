# Standalone lyntty-relay: single container, no external dependencies
# Uses PGlite (embedded Postgres), local filesystem storage, no Redis

# Stage 1: install dependencies
FROM node:20 AS deps

RUN apt-get update && apt-get install -y python3 make g++ build-essential && rm -rf /var/lib/apt/lists/*
RUN corepack enable && corepack prepare pnpm@10.11.0 --activate

WORKDIR /repo

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY scripts ./scripts
COPY patches ./patches

RUN mkdir -p packages/lyntty-app packages/lyntty-relay packages/lyntty-cli packages/lyntty-agent packages/lyntty-wire

COPY packages/lyntty-app/package.json packages/lyntty-app/
COPY packages/lyntty-relay/package.json packages/lyntty-relay/
COPY packages/lyntty-cli/package.json packages/lyntty-cli/
COPY packages/lyntty-agent/package.json packages/lyntty-agent/
COPY packages/lyntty-wire/package.json packages/lyntty-wire/

# Workspace postinstall requirements
COPY packages/lyntty-app/patches packages/lyntty-app/patches
COPY packages/lyntty-relay/prisma packages/lyntty-relay/prisma
COPY packages/lyntty-cli/scripts packages/lyntty-cli/scripts
COPY packages/lyntty-cli/tools packages/lyntty-cli/tools

RUN SKIP_LYNTTY_WIRE_BUILD=1 pnpm install --frozen-lockfile

# Stage 2: copy source and type-check
FROM deps AS builder

COPY packages/lyntty-wire ./packages/lyntty-wire
COPY packages/lyntty-relay ./packages/lyntty-relay

RUN pnpm --filter lyntty-wire build
RUN pnpm --filter lyntty-relay build

# Stage 3: runtime
FROM node:20-slim AS runner

WORKDIR /repo

RUN apt-get update && apt-get install -y ffmpeg curl && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production
ENV DATA_DIR=/data
ENV PGLITE_DIR=/data/pglite

COPY --from=builder /repo/node_modules /repo/node_modules
COPY --from=builder /repo/packages/lyntty-wire /repo/packages/lyntty-wire
COPY --from=builder /repo/packages/lyntty-relay /repo/packages/lyntty-relay

VOLUME /data
EXPOSE 3005

WORKDIR /repo/packages/lyntty-relay

CMD ["sh", "-c", "../../node_modules/.bin/tsx sources/standalone.ts migrate && exec ../../node_modules/.bin/tsx sources/standalone.ts serve"]
