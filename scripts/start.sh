#!/usr/bin/env bash
set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BACKEND_PORT=36000
FRONTEND_PORT=36001
PROD=false
while getopts p opt; do
  case $opt in
    p) PROD=true ;;
    *) echo "Usage: $0 [-p] (default: dev; -p = prod)" >&2; exit 1 ;;
  esac
done

cd "$ROOT"

stop_ports() {
  for port in "$@"; do
    pid=$(lsof -ti ":$port" 2>/dev/null || true)
    if [ -n "$pid" ]; then
      kill "$pid" 2>/dev/null || true
      sleep 1
      kill -9 "$pid" 2>/dev/null || true
    fi
  done
}

# avoid starting twice
stop_ports $BACKEND_PORT $FRONTEND_PORT

if [ "$PROD" = true ]; then
  # Prod: single process — backend serves the built frontend (no separate Vite)
  if [ ! -d "$ROOT/client/dist" ]; then
    echo "Building client for prod..."
    (cd client && npm run build)
  fi
  echo "=== Starting backend (prod, single process) on port $BACKEND_PORT ==="
  (cd server && PORT=$BACKEND_PORT NODE_ENV=production node src/server.js) &
  echo $! > "$ROOT/.server.pid"
  echo "Backend PID: $(cat "$ROOT/.server.pid")"
  echo "Prod: one process at http://localhost:$BACKEND_PORT (API + frontend)"
else
  echo "=== Starting backend (dev) on port $BACKEND_PORT ==="
  (cd server && PORT=$BACKEND_PORT node src/server.js) &
  echo $! > "$ROOT/.server.pid"
  echo "=== Starting frontend (dev) on port $FRONTEND_PORT ==="
  (cd client && npm run dev) &
  echo $! > "$ROOT/.frontend.pid"
  echo "Backend PID: $(cat "$ROOT/.server.pid")"
  echo "Frontend PID: $(cat "$ROOT/.frontend.pid")"
  echo "Dev: open http://localhost:$FRONTEND_PORT (API at $BACKEND_PORT)"
fi
