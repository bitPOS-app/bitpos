# =============================================================================
# bitPOS — multi-stage build, arm64-native, from source
# Produces two images:
#   - bitpos-api:local   (node runtime for api-server)
#   - bitpos-caddy:local (Caddy with web+landing static assets baked in)
# =============================================================================

# ─── Stage 1: build all JS ────────────────────────────────────────────────────
FROM node:24-bookworm-slim AS builder

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /repo

# Install deps first (better caching)
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json tsconfig.base.json tsconfig.json ./
COPY lib/ ./lib/
COPY artifacts/api-server/package.json ./artifacts/api-server/
COPY artifacts/web/package.json ./artifacts/web/
COPY artifacts/landing/package.json ./artifacts/landing/
COPY scripts/ ./scripts/
# pnpm 10 refuses to run native build scripts (esbuild installs its arm64
# binary) without approval, and treats that as fatal under --frozen-lockfile.
# The workspace's pnpm-workspace.yaml already allowlists esbuild via
# onlyBuiltDependencies. We pass --config.dangerouslyAllowAllBuilds=true so
# the postinstall scripts run non-interactively (the allowlist still scopes
# what actually executes).
RUN pnpm install --no-frozen-lockfile --config.dangerouslyAllowAllBuilds=true

# Copy app source
COPY artifacts/api-server ./artifacts/api-server
COPY artifacts/web ./artifacts/web
COPY artifacts/landing ./artifacts/landing

# Build: libs → api-server → web (BASE_PATH=/app) → landing
ENV NODE_ENV=production
RUN pnpm run typecheck:libs \
 && pnpm -r --filter "./lib/**" --if-present run build \
 && (cd artifacts/api-server && node ./build.mjs) \
 && (cd artifacts/web && BASE_PATH=/app pnpm run build) \
 && (cd artifacts/landing && pnpm run build)

# ─── Stage 2: api-server runtime ─────────────────────────────────────────────
FROM node:24-bookworm-slim AS api-runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=builder /repo/node_modules ./node_modules
COPY --from=builder /repo/artifacts/api-server/dist ./dist
COPY --from=builder /repo/artifacts/api-server/package.json ./
EXPOSE 8080
CMD ["node", "--enable-source-maps", "./dist/index.mjs"]

# ─── Stage 3: Caddy with static assets baked in ──────────────────────────────
FROM caddy:2-alpine AS caddy-runtime
COPY Caddyfile /etc/caddy/Caddyfile
COPY --from=builder /repo/artifacts/web/dist/public /srv/web
COPY --from=builder /repo/artifacts/landing/dist/public /srv/landing
EXPOSE 80
