# syntax=docker.io/docker/dockerfile:1

FROM node:22-slim AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate

# ---------------------------------------------------------------------------
# Build stage — install deps & compile workspace packages in dependency order
# ---------------------------------------------------------------------------
FROM base AS build
WORKDIR /app

# Dependency manifests (lockfile required for --frozen-lockfile)
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./

# Workspace source — only the packages the panel transitively needs
COPY packages/ packages/
COPY apps/server/ apps/server/
COPY apps/panel/ apps/panel/

# Install (frozen lockfile guarantees deterministic builds)
RUN pnpm install --frozen-lockfile

# Build workspace dependency chain: core → mcp-server → server → panel
RUN pnpm -r --filter='./packages/*' run build
RUN pnpm -C apps/server run build
RUN pnpm -C apps/panel run build:docker

# ---------------------------------------------------------------------------
# Runtime stage — only what is needed to serve the Astro SSR app
# ---------------------------------------------------------------------------
FROM base AS runtime
WORKDIR /app

# Built Astro server entry + static assets
COPY --from=build /app/apps/panel/dist ./dist

# pnpm virtual store + workspace symlinks + prod deps
COPY --from=build /app/node_modules ./node_modules

# Workspace source directories — pnpm symlinks in node_modules point here
# Without these the runtime would throw MODULE_NOT_FOUND for @sechel/* imports
COPY --from=build /app/packages /app/packages
COPY --from=build /app/apps/server /app/apps/server

EXPOSE 3000

ENV HOST=0.0.0.0
ENV PORT=3000
ENV NODE_ENV=production

CMD ["node", "dist/server/entry.mjs"]
