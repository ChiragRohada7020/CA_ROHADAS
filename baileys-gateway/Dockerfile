# syntax=docker/dockerfile:1
# Baileys HTTP gateway for WhatsApp pairing.
# Exposes an Express server on PORT (default 3001).
# Build context is baileys-gateway/ (set in docker-compose.yml or `docker build baileys-gateway/`).

FROM node:22-alpine AS base

WORKDIR /app

# Install production dependencies only
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Copy application source
COPY . .

# Create non-root user
RUN addgroup --gid 1001 appgroup && \
    adduser --uid 1001 --ingroup appgroup --disabled-password --gecos "" appuser

# Persist WhatsApp session credentials
RUN mkdir -p wa-sessions && chown -R appuser:appgroup wa-sessions
USER appuser

ENV PORT=3001
ENV NODE_ENV=production

EXPOSE 3001

CMD ["node", "server.js"]
