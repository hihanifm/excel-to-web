#!/usr/bin/env bash
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PID_FILE="$ROOT/server.pids"
BACKEND_PORT=36000
FRONTEND_PORT=36001

get_version() {
  if [ -f "$ROOT/VERSION" ]; then
    cat "$ROOT/VERSION" | tr -d '\n\r'
  else
    echo "unknown"
  fi
}

VERSION=$(get_version)
echo "Stopping excel-to-web (v$VERSION)..."
echo ""

# Check Docker
DOCKER_RUNNING=false
if command -v docker >/dev/null 2>&1; then
  if docker ps --format '{{.Names}}' 2>/dev/null | grep -q "excel-to-web"; then
    DOCKER_RUNNING=true
  fi
fi

if [ "$DOCKER_RUNNING" = true ]; then
  echo "Detected Docker container."
  cd "$ROOT"
  if docker compose version >/dev/null 2>&1; then
    docker compose down
  else
    docker-compose down
  fi
  echo "✓ Docker stopped"
  echo ""
  echo "Done."
  exit 0
fi

# Check PM2 (if used manually)
if command -v pm2 >/dev/null 2>&1; then
  if pm2 list 2>/dev/null | grep -q "excel-to-web"; then
    echo "Stopping PM2 process..."
    pm2 stop excel-to-web 2>/dev/null || true
    pm2 delete excel-to-web 2>/dev/null || true
    echo "✓ PM2 stopped"
    echo ""
    echo "Done."
    exit 0
  fi
fi

# PID file or port-based
BACKEND_PID=""
FRONTEND_PID=""
if [ -f "$PID_FILE" ]; then
  PIDS=()
  while IFS= read -r pid; do
    [ -n "$pid" ] && PIDS+=("$pid")
  done < "$PID_FILE"
  BACKEND_PID=${PIDS[0]:-}
  FRONTEND_PID=${PIDS[1]:-}
fi

# Fallback: find by port
if [ -z "$BACKEND_PID" ]; then
  BACKEND_PID=$(lsof -ti ":$BACKEND_PORT" 2>/dev/null || true)
fi
if [ -z "$FRONTEND_PID" ]; then
  FRONTEND_PID=$(lsof -ti ":$FRONTEND_PORT" 2>/dev/null || true)
fi

if [ -n "$BACKEND_PID" ] && ps -p $BACKEND_PID >/dev/null 2>&1; then
  echo "Stopping backend (PID $BACKEND_PID)..."
  kill $BACKEND_PID 2>/dev/null || true
  sleep 1
  ps -p $BACKEND_PID >/dev/null 2>&1 && kill -9 $BACKEND_PID 2>/dev/null || true
  echo "✓ Backend stopped"
else
  echo "Backend not running"
fi

if [ -n "$FRONTEND_PID" ] && ps -p $FRONTEND_PID >/dev/null 2>&1; then
  echo "Stopping frontend (PID $FRONTEND_PID)..."
  kill $FRONTEND_PID 2>/dev/null || true
  sleep 1
  ps -p $FRONTEND_PID >/dev/null 2>&1 && kill -9 $FRONTEND_PID 2>/dev/null || true
  echo "✓ Frontend stopped"
else
  echo "Frontend not running"
fi

# Clean any process still on ports
for port in $BACKEND_PORT $FRONTEND_PORT; do
  pid=$(lsof -ti ":$port" 2>/dev/null || true)
  if [ -n "$pid" ]; then
    echo "Killing process on port $port (PID $pid)..."
    kill -9 $pid 2>/dev/null || true
  fi
done

rm -f "$PID_FILE"
echo ""
echo "Done."
