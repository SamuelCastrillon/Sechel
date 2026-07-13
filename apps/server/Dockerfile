# syntax=docker/dockerfile:1.7
# --------------------------------------------------------------------------
# Multi-stage Docker build for @sechel/server
# Target: < 100 MB production image with distroless Node.js
# --------------------------------------------------------------------------

# ---- Stage 1: Install dependencies (with pnpm fetch for caching) ---------
FROM node:20-alpine AS deps
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate

WORKDIR /app

# Copy workspace manifests
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY apps/server/package.json ./apps/server/
COPY packages/core/package.json ./packages/core/
COPY packages/mcp-server/package.json ./packages/mcp-server/

# Fetch — uses lockfile for deterministic install, cached layer
RUN pnpm fetch

# Offline install from fetched store
RUN pnpm install --offline --frozen-lockfile --filter @sechel/server...

# ---- Stage 2: Build all workspace packages ---------------------------------
FROM node:20-alpine AS builder
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate

WORKDIR /app

COPY --from=deps /app /app

# Copy source files (all packages the server depends on)
COPY tsconfig.json ./
COPY apps/server/ ./apps/server/
COPY packages/core/ ./packages/core/
COPY packages/mcp-server/ ./packages/mcp-server/

# Build core first, then mcp-server, then server
RUN pnpm -C packages/core build
RUN pnpm -C packages/mcp-server build
RUN pnpm -C apps/server build

# ---- Stage 3: Production image (distroless) --------------------------------
FROM node:20-alpine AS runner

WORKDIR /app

# Create non-root user
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 sechel

# Copy only production artifacts
COPY --from=builder --chown=sechel:nodejs /app/apps/server/dist ./dist
COPY --from=builder --chown=sechel:nodejs /app/packages/core/dist ./node_modules/@sechel-mcp/core
COPY --from=builder --chown=sechel:nodejs /app/packages/mcp-server/dist ./node_modules/@sechel/mcp-server
COPY --from=builder --chown=sechel:nodejs /app/node_modules/.pnpm ./node_modules/.pnpm
COPY --from=builder --chown=sechel:nodejs /app/node_modules/.modules.yaml ./node_modules/

# Symlink hoisted deps so they resolve
# We rely on pnpm's node_modules structure — the hoisted layout from
# pnpm deploy is preserved to avoid missing dependency errors.
# (This is more reliable than manually symlinking each dep.)

USER sechel

EXPOSE 3001

ENV NODE_ENV=production
ENV PORT=3001

CMD ["node", "dist/index.js"]
