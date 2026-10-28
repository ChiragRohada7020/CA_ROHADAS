#!/usr/bin/env bash
# Stop the CA Rohadas development servers.
#
# Stops whatever is listening on :3000 and :8000 — but only if the process is
# python or node. Anything else on those ports is reported and left alone, so
# this cannot quietly kill an unrelated service.
#
# It then waits for the ports to actually become free and reports honestly if
# they did not.
#
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PORTS=(3000 8000)
DEADLINE=$(( $(date +%s) + 15 ))

stopped=0

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
            echo "  :$port stopping pid $pid ($comm)"
            kill "$pid" 2>/dev/null || true
            stopped=$((stopped + 1))
        else
            echo "  :$port held by '$comm' - not python or node, leaving it alone"
        fi
    done < <(ss -tlnp "sport = :$port" 2>/dev/null | tail -n +2 || true)
    [[ $found_any -eq 0 ]] && echo "  :$port nothing listening"
}

echo "Stopping dev servers on ports ${PORTS[*]}..."
for port in "${PORTS[@]}"; do
    free_port "$port"
done

# Kill orphaned backend children inherited from this project's own uvicorn invocation.
while IFS= read -r pid; do
    [[ -z "$pid" ]] && continue
    echo "  stopping orphaned backend child pid $pid"
    kill "$pid" 2>/dev/null || true
    stopped=$((stopped + 1))
done < <(ps -eo pid,args | grep -E 'uvicorn|app\.main:app|multiprocessing-fork' | grep -v grep | awk '{print $1}')

# Kill MCP server (stdio transport, no port to detect).
while IFS= read -r pid; do
    [[ -z "$pid" ]] && continue
    echo "  stopping MCP server pid $pid"
    kill "$pid" 2>/dev/null || true
    stopped=$((stopped + 1))
done < <(ps -eo pid,args | grep 'mcp_server\.server' | grep -v grep | awk '{print $1}')

# ── Verify, rather than assume ──
echo ""
still_listening=()
while [[ $(date +%s) -lt $DEADLINE ]]; do
    still_listening=()
    for port in "${PORTS[@]}"; do
        if ss -tln "sport = :$port" 2>/dev/null | grep -q 'LISTEN'; then
            still_listening+=("$port")
        fi
    done
    [[ ${#still_listening[@]} -eq 0 ]] && break
    sleep 0.5
done

echo "$stopped process(es) stopped."

if [[ ${#still_listening[@]} -gt 0 ]]; then
    held="$(IFS=', '; echo "${still_listening[*]}")"
    echo "  still listening after 15s: :$held" >&2
    echo "  a new server on these ports would fail to bind and leave the old one answering." >&2
    exit 1
fi

all="$(IFS=', '; echo "${PORTS[*]}")"
echo "  all ports free: :$all"
