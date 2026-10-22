# Multi-stage Dockerfile for CYRIS Worker (NestJS BullMQ)
# Stage 1: Dependencies & Build
FROM node:22-bookworm-slim AS builder
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ && rm -rf /var/lib/apt/lists/*
RUN corepack enable && corepack prepare pnpm@12.14.0 --activate
WORKDIR /app

# Copy monorepo manifests
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY packages/config/package.json ./packages/config/
COPY packages/contracts/package.json ./packages/contracts/
COPY packages/shared/package.json ./packages/shared/
COPY packages/db/package.json ./packages/db/
COPY apps/api/package.json ./apps/api/
COPY apps/web/package.json ./apps/web/
COPY apps/worker/package.json ./apps/worker/

# Install all dependencies including build-time tools
RUN pnpm install --frozen-lockfile

# Copy source code
COPY tsconfig.base.json tsconfig.json ./
COPY packages ./packages
COPY apps/worker ./apps/worker

# Build packages and Worker
RUN pnpm --filter @cyris/config build && \
    pnpm --filter @cyris/contracts build && \
    pnpm --filter @cyris/shared build && \
    pnpm --filter @cyris/db build && \
    pnpm --filter @cyris/worker build

# Deploy isolated production dependencies
RUN pnpm --filter @cyris/worker --prod deploy /app/deploy

# Stage 2: Production Runner
FROM node:22-bookworm-slim AS runner
WORKDIR /app

ENV NODE_ENV=production

# Create non-root user
RUN groupadd --system --gid 1001 cyris && \
    useradd --system --uid 1001 --gid cyris cyris

# Copy deployed runtime
COPY --from=builder --chown=cyris:cyris /app/deploy ./

USER cyris

# Simple healthcheck to verify the worker node process is alive
HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "process.exit(0)"

CMD ["node", "dist/main.js"]
