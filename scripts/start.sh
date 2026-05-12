#!/usr/bin/env bash
# Start the API in the background. The React UI is static and served by
# FastAPI itself at /app/, so there is only one process to launch.
# All paths are resolved relative to the repo root.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

LOG_DIR="${REPO_ROOT}/logs"
mkdir -p "$LOG_DIR"

API_PORT="${LECTURE_SEARCH_API_PORT:-8000}"

# Activate venv if present.
if [[ -d ".venv" ]]; then
    # shellcheck disable=SC1091
    source .venv/bin/activate
fi

if ! python -c "import lecture_search" >/dev/null 2>&1; then
    echo "lecture_search is not importable. Run: pip install -e ." >&2
    exit 1
fi

# Refuse to start if a port is already taken — surfaces the real problem
# instead of waiting 60 s for /health and then printing "API did not become
# healthy". Suggest the fix.
port_in_use() {
    if command -v ss >/dev/null 2>&1; then
        ss -ltn "( sport = :$1 )" 2>/dev/null | tail -n +2 | grep -q "."
    elif command -v lsof >/dev/null 2>&1; then
        lsof -nP -iTCP:"$1" -sTCP:LISTEN >/dev/null 2>&1
    else
        # Fallback: curl will succeed if anything is bound. Misses non-HTTP
        # listeners, but that's vanishingly rare on our ports.
        curl -fsS -o /dev/null -m 1 "http://localhost:$1/" 2>/dev/null
    fi
}

if port_in_use "$API_PORT"; then
    echo "Port $API_PORT is already in use." >&2
    echo "  Run 'scripts/stop.sh' first, or kill the offending process:" >&2
    echo "    fuser -k -n tcp $API_PORT" >&2
    exit 1
fi

echo "Starting API on :$API_PORT..."
nohup python -m lecture_search.api.app \
    > "$LOG_DIR/api.log" 2>&1 &
API_PID=$!
echo "$API_PID" > "$LOG_DIR/api.pid"

echo "Waiting for API health..."
for _ in $(seq 1 60); do
    if curl -fsS "http://localhost:$API_PORT/health" >/dev/null 2>&1; then
        break
    fi
    if ! kill -0 "$API_PID" 2>/dev/null; then
        echo "API process exited before becoming healthy. See $LOG_DIR/api.log" >&2
        tail -n 20 "$LOG_DIR/api.log" >&2 || true
        rm -f "$LOG_DIR/api.pid"
        exit 1
    fi
    sleep 1
done

if ! curl -fsS "http://localhost:$API_PORT/health" >/dev/null 2>&1; then
    echo "API did not become healthy. See $LOG_DIR/api.log" >&2
    exit 1
fi
echo "API ready (PID $API_PID)."

echo
echo "App:  http://localhost:$API_PORT/app/"
echo "API:  http://localhost:$API_PORT     (docs at /docs)"
echo "Logs: $LOG_DIR"
echo "Stop with: scripts/stop.sh"
