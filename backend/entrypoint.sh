#!/bin/sh
# Entrypoint for the CA Rohadas backend container.
#
# 1. Wait for Postgres to accept TCP connections (up to 30 s).
# 2. Run Base.metadata.create_all to ensure all tables exist.
#    In production with Alembic migrations this step is replaced by
#    `alembic upgrade head` — run migrations as a deploy step, never from
#    concurrent containers. See docs/DEPLOY.md §3.
# 3. Hand off to uvicorn (exec, so signals propagate correctly).
#
# Rollback: if init_db creates an unexpected schema, drop the volume
#   docker compose down -v
# and rebuild with a fresh database.

set -e

# ── 1. Wait for database ─────────────────────────────────────────────────────
DATABASE_URL="${DATABASE_URL:-}"

if [ -z "$DATABASE_URL" ]; then
    echo "WARNING: DATABASE_URL is not set — skipping database wait."
    echo "         The app will use the default: postgresql+psycopg://postgres@127.0.0.1:5432/ca_software"
else
    # Extract host and port from DATABASE_URL
    # postgresql+psycopg://user:pass@host:5432/dbname  →  host / 5432
    DB_HOST=$(echo "$DATABASE_URL" | sed -e 's|.*@\([^:/]*\).*|\1|')
    DB_PORT=$(echo "$DATABASE_URL" | sed -n 's|.*://[^/]*:\([0-9]*\)/.*|\1|p')
    if [ -z "$DB_PORT" ]; then
        DB_PORT=5432
    fi

    echo "Waiting for database at ${DB_HOST}:${DB_PORT} ..."
    python -c "
import socket, sys, time
host = '$DB_HOST'
port = int('$DB_PORT')
deadline = time.time() + 30
while time.time() < deadline:
    try:
        with socket.create_connection((host, port), timeout=2):
            print(f'Database is reachable at {host}:{port}')
            sys.exit(0)
    except OSError:
        time.sleep(1)
print(f'ERROR: Database not reachable at {host}:{port} after 30 s', file=sys.stderr)
sys.exit(1)
"
fi

# ── 2. Initialise schema ─────────────────────────────────────────────────────
echo "Initialising database schema..."
python -c "
import app.models  # noqa: F401 — registers every table with Base.metadata
from app.core.db import init_db
init_db()
print('Database schema initialised.')
"

# ── 3. Start uvicorn ─────────────────────────────────────────────────────────
echo "Starting uvicorn..."
exec uvicorn app.main:app \
    --host 0.0.0.0 \
    --port 8000 \
    --timeout-keep-alive 120 \
    "$@"
