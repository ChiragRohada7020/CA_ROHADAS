# syntax=docker/dockerfile:1
#
# Multi-stage build for Next.js 16 (App Router + React 19 + TypeScript + Tailwind).
#
# Build context is frontend/ (set in docker-compose.yml or `docker build frontend/`).
# BACKEND_ORIGIN is a BUILD-time arg baked into .next/routes-manifest.json by
# `next build` (see next.config.ts for the rationale). In docker-compose it is
# passed as http://backend:8000 so the /api proxy resolves at the container
# network level. Override on a standalone build:
#   docker build --build-arg BACKEND_ORIGIN=http://host.docker.internal:8000 frontend/

# ─── Stage 1: builder ─────────────────────────────────────────────────────────
FROM node:22-alpine AS builder

# Disable Next.js telemetry during build
ENV NEXT_TELEMETRY_DISABLED=1
ENV CI=true

WORKDIR /app

# Install dependencies — layer cached as long as lockfile is unchanged
COPY package.json package-lock.json ./
# @playwright/test may attempt to download browser binaries; skip in build.
RUN PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 npm ci

# Copy the rest of the frontend source and build
COPY . .

# BACKEND_ORIGIN must be set before `next build` — it is read at build time,
# not at start time (see next.config.ts comment block).
ARG BACKEND_ORIGIN=http://backend:8000
ENV BACKEND_ORIGIN=$BACKEND_ORIGIN

RUN npm run build

# ─── Stage 2: production runner ───────────────────────────────────────────────
FROM node:22-alpine AS production

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

WORKDIR /app

# Copy production artifacts from builder.
# next build already copies public/ assets into .next, so we only need:
#   .next/     — compiled app + routes manifest (contains BACKEND_ORIGIN rewrites)
#   node_modules/ — runtime deps (next, react, react-dom, tailwind, ...)
#   next.config.ts — read by `next start` to configure the server
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/next.config.ts ./next.config.ts
COPY --from=builder /app/next-env.d.ts ./next-env.d.ts
COPY --from=builder /app/tsconfig.json ./tsconfig.json

# Create non-root user
RUN addgroup --gid 1001 appgroup && \
    adduser --uid 1001 --ingroup appgroup --disabled-password --gecos "" appuser

USER appuser

EXPOSE 3000

# Health check: /login renders and returns 200 (unlike / which redirects to
# /dashboard). Matches the probe used by start-dev.sh.
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD node -e "require('http').get('http://127.0.0.1:3000/login', r => { process.exit(r.statusCode === 200 ? 0 : 1) }).on('error', () => process.exit(1))"

# `next start` serves the pre-built .next directory
CMD ["node", "node_modules/next/dist/bin/next", "start"]
