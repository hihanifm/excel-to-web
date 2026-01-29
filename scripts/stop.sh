#!/usr/bin/env bash
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BACKEND_PORT=36000
FRONTEND_PORT=36001

stop_port() {
  local port=$1
  pid=$(lsof -ti ":$port" 2>/dev/null || true)
  if [ -n "$pid" ]; then
    kill $pid 2>/dev/null || true
    sleep 1
    kill -9 $pid 2>/dev/null || true
    echo "Stopped process on port $port (PID $pid)"
  else
    echo "No process on port $port"
  fi
}

echo "=== Stopping excel-to-web ==="
stop_port $BACKEND_PORT
stop_port $FRONTEND_PORT
rm -f "$ROOT/.server.pid" "$ROOT/.frontend.pid"
echo "Done."
