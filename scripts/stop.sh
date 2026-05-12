#!/usr/bin/env bash
# Stop the API process started by scripts/start.sh.
#
# Tries pidfile first (clean shutdown). Then, as a safety net, kills
# whatever is still listening on the API port — handles the case where
# the pidfile got out of sync (e.g. a previous run crashed and left the
# port held by a stray process).
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOG_DIR="${REPO_ROOT}/logs"
API_PORT="${LECTURE_SEARCH_API_PORT:-8000}"

stop_pid_file() {
    local label="$1"
    local pid_file="$2"
    if [[ ! -f "$pid_file" ]]; then
        return 0
    fi
    local pid
    pid="$(cat "$pid_file")"
    if [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null; then
        kill "$pid"
        sleep 1
        if kill -0 "$pid" 2>/dev/null; then
            kill -9 "$pid" 2>/dev/null || true
        fi
        echo "$label: stopped (pid $pid)"
    fi
    rm -f "$pid_file"
}

stop_port() {
    local label="$1"
    local port="$2"
    if ! command -v fuser >/dev/null 2>&1; then
        return 0
    fi
    if fuser -s -n tcp "$port" 2>/dev/null; then
        fuser -k -n tcp "$port" >/dev/null 2>&1 || true
        sleep 1
        if fuser -s -n tcp "$port" 2>/dev/null; then
            fuser -k -KILL -n tcp "$port" >/dev/null 2>&1 || true
        fi
        echo "$label: also killed listener on :$port"
    fi
}

stop_pid_file "API" "$LOG_DIR/api.pid"
# Legacy UI pidfile from the Streamlit days — clean it up if anyone still
# has one lying around.
stop_pid_file "UI"  "$LOG_DIR/ui.pid"

stop_port "API" "$API_PORT"

echo "All clear."
