#!/usr/bin/env bash
# Start the CA Rohadas backend and frontend for local development.
#
# Starts uvicorn on :8000 and the Next.js dev server on :3000, writing logs to
# ./logs/. Frees the two ports first, so a stale process from an earlier run does
# not silently keep serving old code.
#
# Usage:
#   ./start-dev.sh                 # start both
#   ./start-dev.sh --frontend-only # start only the frontend
#   ./start-dev.sh --backend-only  # start only the backend
#
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOGS="$ROOT/logs"
mkdir -p "$LOGS"

BACKEND_PORT=8000
FRONTEND_PORT=3000

FRONTEND_ONLY=0
BACKEND_ONLY=0
while [[ $# -gt 0 ]]; do
    case "$1" in
        --frontend-only) FRONTEND_ONLY=1; shift ;;
        --backend-only)  BACKEND_ONLY=1;  shift ;;
        *) echo "unknown option: $1" >&2; exit 2 ;;
    esac
done

# ── 1. Free conflicting ports ──
# Only stop python/node processes on these ports; anything else is reported and
# left alone so we never kill an unrelated service.
free_port() {
    local port="$1"
    local line pid comm pname
    local found_any=0
    while IFS= read -r line; do
        [[ -z "$line" ]] && continue
        found_any=1
        pid="$(printf '%s' "$line" | awk '{match($0,/pid=[0-9]+/); if(RSTART>0) print substr($0,RSTART+4,RLENGTH-4)}')"
        comm="$(printf '%s' "$line" | awk -F'"' '{print $2}')"
        if [[ -z "$pid" ]]; then
            echo "  :$port listener entry present but no pid (stale)"
            continue
        fi
        pname="$(ps -o comm= -p "$pid" 2>/dev/null || true)"
        args="$(ps -o args= -p "$pid" 2>/dev/null || true)"
        is_target=0
        if [[ "$pname" == "python" || "$pname" == "python3" || "$pname" == "node" ]]; then
            is_target=1
        elif printf '%s' "$args" | grep -qE '(^|[ /])(node|npm|next-server|uvicorn|python)([ /]|$)'; then
            is_target=1
        fi
        if [[ $is_target -eq 1 ]]; then
            echo "  freeing :$port (pid $pid, $comm)"
            kill "$pid" 2>/dev/null || true
        else
            echo "  :$port held by '$comm' which is not python or node - leaving it alone"
        fi
    done < <(ss -tlnp "sport = :$port" 2>/dev/null | tail -n +2 || true)
    [[ $found_any -eq 0 ]] && echo "  :$port nothing listening"
}

echo "Freeing ports $BACKEND_PORT and $FRONTEND_PORT..."
if [[ $BACKEND_ONLY -eq 0 ]]; then free_port "$FRONTEND_PORT"; fi
if [[ $FRONTEND_ONLY -eq 0 ]]; then free_port "$BACKEND_PORT"; fi
sleep 1

# ── 2. Backend ──
BACKEND_PID=""
if [[ $FRONTEND_ONLY -eq 0 ]]; then
    export PYTHONPATH="$ROOT/backend"
    export DATABASE_URL="${DATABASE_URL:-postgresql+psycopg://postgres@127.0.0.1:5432/ca_software}"
    export ENVIRONMENT="${ENVIRONMENT:-development}"
    export AI_PROVIDER="${AI_PROVIDER:-kilo}"
    export AI_MODEL="${AI_MODEL:-kilo-auto/free}"
     export WHATSAPP_PROVIDER="${WHATSAPP_PROVIDER:-baileys}"
    export WHATSAPP_API_URL="${WHATSAPP_API_URL:-http://127.0.0.1:3001}"
    # Disable MCP rate limiting in development so automated test suites
    # hitting the dev server are not throttled (production keeps the default).
    export MCP_RATE_LIMIT_ENABLED="${MCP_RATE_LIMIT_ENABLED:-false}"
    if [[ -f "$ROOT/backend/.env" ]]; then
        set -a
        . "$ROOT/backend/.env"
        set +a
    fi

    echo "Starting backend on http://127.0.0.1:$BACKEND_PORT ..."
    VENV_PY="$ROOT/backend/.venv/bin/python"
    if [[ ! -x "$VENV_PY" ]]; then
        echo "backend venv python not found at $VENV_PY" >&2
        exit 1
    fi
    nohup "$VENV_PY" -m uvicorn app.main:app --host 127.0.0.1 --port "$BACKEND_PORT" --timeout-keep-alive 120 \
        > "$LOGS/backend.log" 2> "$LOGS/backend.err.log" &
    BACKEND_PID=$!
    echo "  backend pid $BACKEND_PID"
fi

# ── 3. Frontend ──
FRONTEND_PID=""
if [[ $BACKEND_ONLY -eq 0 ]]; then
    echo "Starting frontend on http://localhost:$FRONTEND_PORT ..."
    ( cd "$ROOT/frontend" && exec npm run dev ) > "$LOGS/frontend.log" 2> "$LOGS/frontend.err.log" &
    FRONTEND_PID=$!
    echo "  frontend pid $FRONTEND_PID"
fi

# ── 4. Wait for both to answer ──
echo ""
echo "Waiting for both to answer..."
deadline=$(( $(date +%s) + 90 ))
backend_up=0
frontend_up=0
needed=$(( (BACKEND_ONLY==0 ? 1 : 0) + (FRONTEND_ONLY==0 ? 1 : 0) ))
while [[ $(date +%s) -lt $deadline && $((backend_up + frontend_up)) -lt $needed ]]; do
    sleep 2
    if [[ $BACKEND_ONLY -eq 0 && $backend_up -eq 0 ]]; then
        if curl -s -o /dev/null -w '%{http_code}' --max-time 4 "http://127.0.0.1:$BACKEND_PORT/api/health" 2>/dev/null | grep -q '200'; then
            backend_up=1
        fi
    fi
    if [[ $FRONTEND_ONLY -eq 0 && $frontend_up -eq 0 ]]; then
        if curl -s -o /dev/null -w '%{http_code}' --max-time 60 "http://127.0.0.1:$FRONTEND_PORT/login" 2>/dev/null | grep -q '200'; then
            frontend_up=1
        fi
    fi
done

echo ""
if [[ $BACKEND_ONLY -eq 0 ]]; then
    if [[ $backend_up -eq 1 ]]; then echo "  backend   http://127.0.0.1:$BACKEND_PORT  (docs at /docs)"; else echo "  backend did not answer - see logs/backend.err.log"; fi
fi
if [[ $FRONTEND_ONLY -eq 0 ]]; then
    if [[ $frontend_up -eq 1 ]]; then echo "  frontend  http://localhost:$FRONTEND_PORT"; else echo "  frontend did not answer - see logs/frontend.err.log"; fi
fi
echo ""
echo "Logs: $LOGS   Stop with: ./stop-dev.sh"

if [[ -n "$BACKEND_PID" || -n "$FRONTEND_PID" ]]; then
    wait
fi
