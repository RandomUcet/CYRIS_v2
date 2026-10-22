# Multi-stage Dockerfile for CYRIS API (NestJS Fastify)
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
COPY apps/api ./apps/api

# Build packages and API
RUN pnpm --filter @cyris/config build && \
    pnpm --filter @cyris/contracts build && \
    pnpm --filter @cyris/shared build && \
    pnpm --filter @cyris/db build && \
    pnpm --filter @cyris/api build

# Deploy isolated production dependencies
RUN pnpm --filter @cyris/api --prod deploy /app/deploy

# Stage 2: Production Runner
FROM node:22-bookworm-slim AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=4000

# Install curl for healthcheck
RUN apt-get update && apt-get install -y --no-install-recommends curl && rm -rf /var/lib/apt/lists/*

# Create non-root user
RUN groupadd --system --gid 1001 cyris && \
    useradd --system --uid 1001 --gid cyris cyris

# Copy deployed runtime (dist, node_modules, package.json)
COPY --from=builder --chown=cyris:cyris /app/deploy ./
# Copy migrations folder for runtime database migration & status checks
COPY --from=builder --chown=cyris:cyris /app/packages/db/migrations ./migrations

USER cyris

EXPOSE 4000

HEALTHCHECK --interval=10s --timeout=5s --start-period=15s --retries=3 \
  CMD curl -fsS http://127.0.0.1:4000/health || exit 1

CMD ["node", "dist/main.js"]
