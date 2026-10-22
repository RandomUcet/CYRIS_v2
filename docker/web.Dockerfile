# Multi-stage Dockerfile for CYRIS Web (Next.js 14)
# Stage 1: Dependencies & Build
FROM node:22-bookworm-slim AS builder
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

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy source code
COPY tsconfig.base.json tsconfig.json ./
COPY packages ./packages
COPY apps/web ./apps/web

# Build contracts, shared, and web
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV API_INTERNAL_URL="http://api:4000"
RUN pnpm --filter @cyris/contracts build && \
    pnpm --filter @cyris/shared build && \
    pnpm --filter @cyris/web build

# Stage 2: Production Runner
FROM node:22-bookworm-slim AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"
ENV NEXT_TELEMETRY_DISABLED=1

# Create non-root user
RUN groupadd --system --gid 1001 nodejs && \
    useradd --system --uid 1001 nextjs

# Copy standalone build and static assets
COPY --from=builder /app/apps/web/.next/standalone ./
COPY --from=builder /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder /app/apps/web/public ./apps/web/public

USER nextjs

EXPOSE 3000

HEALTHCHECK --interval=10s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://127.0.0.1:3000/', (res) => (res.statusCode >= 200 && res.statusCode < 400) ? process.exit(0) : process.exit(1)).on('error', () => process.exit(1))"

CMD ["node", "apps/web/server.js"]
