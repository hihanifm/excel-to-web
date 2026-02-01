#!/usr/bin/env bash
set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SCRIPT_DIR="$ROOT/scripts"
PID_FILE="$ROOT/server.pids"
LOG_DIR="$ROOT/logs"
BACKEND_PORT=36000
FRONTEND_PORT=36001
PROD=false
PM2=false

for arg in "$@"; do
  case "$arg" in
    -p|--prod) PROD=true ;;
    -m|--pm2) PM2=true; PROD=true ;;
    -h|--help)
      echo "Usage: $0 [-p|--prod] [-m|--pm2]"
      echo "  Default: dev (backend + Vite dev server, frontend on $FRONTEND_PORT)"
      echo "  -p, --prod  Production mode (build client, single process on $BACKEND_PORT)"
      echo "  -m, --pm2   PM2 mode (auto-restart on crash, use with pm2-startup.sh for start on boot)"
      exit 0
      ;;
    *) echo "Usage: $0 [-p|--prod] [-m|--pm2]" >&2; exit 1 ;;
  esac
done

cd "$ROOT"

get_version() {
  if [ -f "$ROOT/VERSION" ]; then
    cat "$ROOT/VERSION" | tr -d '\n\r'
  else
    echo "unknown"
  fi
}

check_port() {
  local port=$1
  if lsof -Pi :$port -sTCP:LISTEN -t >/dev/null 2>&1; then
    return 0
  else
    return 1
  fi
}

get_local_ip() {
  local ip=""
  if command -v ip >/dev/null 2>&1; then
    ip=$(ip route get 1.1.1.1 2>/dev/null | awk '{for(i=1;i<=NF;i++) if($i=="src") print $(i+1)}' | head -1)
  fi
  if [ -z "$ip" ] && command -v ifconfig >/dev/null 2>&1; then
    ip=$(ifconfig 2>/dev/null | grep -Eo 'inet (addr:)?([0-9]*\.){3}[0-9]*' | grep -Eo '([0-9]*\.){3}[0-9]*' | grep -v '127.0.0.1' | head -1)
  fi
  if [ -z "$ip" ]; then
    ip=$(hostname -I 2>/dev/null | awk '{print $1}')
  fi
  echo "$ip"
}

detect_os() {
  if [[ "$OSTYPE" == "darwin"* ]]; then
    echo "macos"
  elif [[ "$OSTYPE" == "linux-gnu"* ]] || [[ "$OSTYPE" == "linux"* ]]; then
    echo "linux"
  else
    echo "unknown"
  fi
}

check_ufw_active() {
  if command -v ufw >/dev/null 2>&1; then
    local status=$(sudo ufw status 2>/dev/null | head -1)
    if echo "$status" | grep -q "Status: active"; then
      return 0
    fi
  fi
  return 1
}

check_ufw_port_allowed() {
  local port=$1
  if ! check_ufw_active; then
    return 0
  fi
  if sudo ufw status 2>/dev/null | grep -qE "^[[:space:]]*${port}/tcp[[:space:]]+ALLOW"; then
    return 0
  fi
  return 1
}

check_macos_firewall_active() {
  if [ -f "/usr/libexec/ApplicationFirewall/socketfilterfw" ]; then
    local status=$(/usr/libexec/ApplicationFirewall/socketfilterfw --getglobalstate 2>/dev/null)
    if echo "$status" | grep -q "enabled"; then
      return 0
    fi
  fi
  return 1
}

check_firewall_status() {
  local os=$(detect_os)
  local ports_to_check=()
  local needs_warning=false

  if [ "$PROD" = true ]; then
    ports_to_check=($BACKEND_PORT)
  else
    ports_to_check=($BACKEND_PORT $FRONTEND_PORT)
  fi

  echo ""
  echo "🔒 Firewall check:"
  if [ "$os" = "linux" ]; then
    if check_ufw_active; then
      for port in "${ports_to_check[@]}"; do
        if ! check_ufw_port_allowed "$port"; then
          needs_warning=true
          echo "   ⚠️  Port $port may be blocked (ufw). To allow: sudo ufw allow $port/tcp"
        else
          echo "   ✓ Port $port allowed"
        fi
      done
      if [ "$needs_warning" = true ]; then
        echo "   💡 If you can't access by IP, allow the ports above."
      fi
    else
      echo "   ℹ️  ufw not active"
    fi
  elif [ "$os" = "macos" ]; then
    if check_macos_firewall_active; then
      echo "   ℹ️  macOS firewall enabled. If access by IP fails, check System Settings → Network → Firewall"
    else
      echo "   ℹ️  macOS firewall not enabled"
    fi
  else
    echo "   ℹ️  OS not detected for firewall check"
  fi
}

mkdir -p "$LOG_DIR"
VERSION=$(get_version)

# PM2 mode: clean up first, then start with PM2 (auto-restart on crash)
if [ "$PM2" = true ]; then
  if ! command -v pm2 >/dev/null 2>&1; then
    echo "❌ PM2 not found. Install with: npm install -g pm2"
    exit 1
  fi
  echo "Stopping any existing processes..."
  "$SCRIPT_DIR/stop.sh" 2>/dev/null || true
  sleep 2
  echo "Building client (latest code)..."
  (cd "$ROOT/client" && npm run build) > "$LOG_DIR/frontend-build.log" 2>&1
  if [ $? -ne 0 ]; then
    echo "❌ Client build failed. Check $LOG_DIR/frontend-build.log"
    exit 1
  fi
  echo "✓ Client built"
  echo "Starting with PM2 (auto-restart on crash)..."
  cd "$ROOT"
  pm2 start ecosystem.config.cjs
  sleep 2
  if ! check_port $BACKEND_PORT; then
    echo "❌ Backend failed to start. Check: pm2 logs excel-to-web"
    exit 1
  fi
  echo "✓ PM2 started"
  LOCAL_IP=$(get_local_ip)
  echo ""
  echo "Version: $VERSION"
  echo ""
  echo "Access:"
  echo "  http://localhost:$BACKEND_PORT"
  [ -n "$LOCAL_IP" ] && echo "  http://$LOCAL_IP:$BACKEND_PORT"
  echo ""
  echo "PM2 commands:"
  echo "  pm2 status              (check status)"
  echo "  pm2 logs excel-to-web   (view logs)"
  echo "  pm2 restart excel-to-web"
  echo ""
  echo "Start on boot: run ./scripts/pm2-startup.sh"
  check_firewall_status
  echo ""
  exit 0
fi

# Check if ports are already in use
PORTS_IN_USE=false
if [ -f "$PID_FILE" ]; then
  while IFS= read -r pid; do
    if [ -n "$pid" ] && ps -p "$pid" >/dev/null 2>&1; then
      echo "⚠️  Process with PID $pid (from server.pids) is still running."
      PORTS_IN_USE=true
    fi
  done < "$PID_FILE" 2>/dev/null || true
fi

if check_port $BACKEND_PORT; then
  echo "⚠️  Port $BACKEND_PORT (backend) is already in use!"
  PORTS_IN_USE=true
fi
if [ "$PROD" = false ] && check_port $FRONTEND_PORT; then
  echo "⚠️  Port $FRONTEND_PORT (frontend) is already in use!"
  PORTS_IN_USE=true
fi

if [ "$PORTS_IN_USE" = true ]; then
  echo ""
  echo "Run ./scripts/stop.sh first, or force start (not recommended)."
  read -p "Force start anyway? (y/n) " -n 1 -r
  echo
  if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Exiting. Run ./scripts/stop.sh then try again."
    exit 1
  fi
  echo "Stopping existing processes on ports..."
  for port in $BACKEND_PORT $FRONTEND_PORT; do
    pid=$(lsof -ti ":$port" 2>/dev/null || true)
    if [ -n "$pid" ]; then
      kill "$pid" 2>/dev/null || true
      sleep 1
      kill -9 "$pid" 2>/dev/null || true
    fi
  done
  rm -f "$PID_FILE"
  sleep 1
fi

if [ "$PROD" = true ]; then
  echo "Starting excel-to-web (prod, single process)..."
  echo "Building client (latest code)..."
  (cd "$ROOT/client" && npm run build) > "$LOG_DIR/frontend-build.log" 2>&1
  if [ $? -ne 0 ]; then
    echo "❌ Client build failed. Check $LOG_DIR/frontend-build.log"
    exit 1
  fi
  echo "✓ Client built"
  echo "Backend on port $BACKEND_PORT..."
  cd "$ROOT/server"
  nohup env PORT=$BACKEND_PORT NODE_ENV=production node src/server.js >> "$LOG_DIR/backend.log" 2>&1 &
  BACKEND_PID=$!
  disown $BACKEND_PID 2>/dev/null || true
  echo "$BACKEND_PID" > "$PID_FILE"
  sleep 2
  if ! check_port $BACKEND_PORT; then
    echo "❌ Backend failed to start. Check $LOG_DIR/backend.log"
    exit 1
  fi
  echo "✓ Backend started (PID $BACKEND_PID)"
else
  echo "Starting excel-to-web (dev)..."
  cd "$ROOT/server"
  nohup env PORT=$BACKEND_PORT node src/server.js >> "$LOG_DIR/backend.log" 2>&1 &
  BACKEND_PID=$!
  disown $BACKEND_PID 2>/dev/null || true
  echo "$BACKEND_PID" > "$PID_FILE"
  sleep 1
  cd "$ROOT/client"
  nohup npm run dev >> "$LOG_DIR/frontend.log" 2>&1 &
  FRONTEND_PID=$!
  disown $FRONTEND_PID 2>/dev/null || true
  echo "$FRONTEND_PID" >> "$PID_FILE"
  sleep 3
  if ! check_port $BACKEND_PORT; then
    echo "❌ Backend failed to start. Check $LOG_DIR/backend.log"
    kill $FRONTEND_PID 2>/dev/null || true
    exit 1
  fi
  if ! check_port $FRONTEND_PORT; then
    echo "❌ Frontend failed to start. Check $LOG_DIR/frontend.log"
    kill $BACKEND_PID 2>/dev/null || true
    exit 1
  fi
  echo "✓ Backend (PID $BACKEND_PID), Frontend (PID $FRONTEND_PID)"
fi

LOCAL_IP=$(get_local_ip)
echo ""
echo "Version: $VERSION"
echo ""
echo "Access:"
if [ "$PROD" = true ]; then
  echo "  http://localhost:$BACKEND_PORT"
  [ -n "$LOCAL_IP" ] && echo "  http://$LOCAL_IP:$BACKEND_PORT"
else
  echo "  Frontend: http://localhost:$FRONTEND_PORT"
  [ -n "$LOCAL_IP" ] && echo "           http://$LOCAL_IP:$FRONTEND_PORT"
  echo "  API:      http://localhost:$BACKEND_PORT"
  [ -n "$LOCAL_IP" ] && echo "           http://$LOCAL_IP:$BACKEND_PORT"
fi
check_firewall_status
echo ""
echo "Logs: $LOG_DIR/"
echo "Stop: ./scripts/stop.sh"
echo "Status: ./scripts/status.sh"
echo ""
