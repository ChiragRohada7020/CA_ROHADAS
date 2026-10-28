# syntax=docker/dockerfile:1
#
# Multi-stage build for the FastAPI backend.
#
# Build context is backend/ (set in docker-compose.yml or `docker build backend/`).
# The entry point (entrypoint.sh) waits for Postgres, runs
# Base.metadata.create_all (init_db), and then starts uvicorn.

# ─── Stage 1: builder — install dependencies ──────────────────────────────────
FROM python:3.12-slim AS builder

# gcc / python3-dev are only needed if a wheel is unavailable for a package.
# They are not copied to the final stage, keeping the image lean.
RUN apt-get update && \
    apt-get install -y --no-install-recommends gcc python3-dev && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app/backend

# Install Python dependencies — cached layer
COPY requirements.txt ./
RUN --mount=type=cache,target=/root/.cache/pip pip install -r requirements.txt

# ─── Stage 2: production ──────────────────────────────────────────────────────
FROM python:3.12-slim AS production

# Create non-root user
RUN addgroup --gid 1001 appgroup && \
    adduser --uid 1001 --ingroup appgroup --disabled-password --gecos "" appuser

WORKDIR /app/backend

# Copy installed site-packages from builder (no compiler needed here)
COPY --from=builder /usr/local/lib/python3.12/site-packages /usr/local/lib/python3.12/site-packages
COPY --from=builder /usr/local/bin /usr/local/bin

# Copy application source (includes entrypoint.sh via COPY . .)
COPY . .

# Ensure entrypoint is executable (COPY may not preserve mode in all cases)
# and create runtime directories (storage for local uploads, import scratch).
# Hand ownership to the non-root user.
RUN mkdir -p var/storage /tmp/ca_imports && \
    chmod +x /app/backend/entrypoint.sh && \
    chown -R appuser:appgroup /app/backend /tmp/ca_imports

USER appuser

EXPOSE 8000

# Health check queries the lightweight /api/health endpoint (no DB access).
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/api/health', timeout=3)"

ENTRYPOINT ["./entrypoint.sh"]
