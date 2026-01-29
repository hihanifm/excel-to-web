#!/usr/bin/env bash
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BACKEND_PORT=36000
FRONTEND_PORT=36001

status_port() {
  local port=$1
  local name=$2
  pid=$(lsof -ti ":$port" 2>/dev/null || true)
  if [ -n "$pid" ]; then
    echo "$name (port $port): running (PID $pid)"
  else
    echo "$name (port $port): not running"
  fi
}

echo "=== excel-to-web status ==="
status_port $BACKEND_PORT "Backend"
status_port $FRONTEND_PORT "Frontend"
