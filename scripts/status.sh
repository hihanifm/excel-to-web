#!/usr/bin/env bash
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PID_FILE="$ROOT/server.pids"
LOG_DIR="$ROOT/logs"
BACKEND_PORT=36000
FRONTEND_PORT=36001

get_version() {
  if [ -f "$ROOT/VERSION" ]; then
    cat "$ROOT/VERSION" | tr -d '\n\r'
  else
    echo "unknown"
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

  if lsof -Pi :$FRONTEND_PORT -sTCP:LISTEN -t >/dev/null 2>&1; then
    ports_to_check=($BACKEND_PORT $FRONTEND_PORT)
  elif lsof -Pi :$BACKEND_PORT -sTCP:LISTEN -t >/dev/null 2>&1; then
    ports_to_check=($BACKEND_PORT)
  else
    ports_to_check=($BACKEND_PORT $FRONTEND_PORT)
  fi

  echo "Firewall:"
  if [ "$os" = "linux" ]; then
    if check_ufw_active; then
      for port in "${ports_to_check[@]}"; do
        if lsof -Pi :$port -sTCP:LISTEN -t >/dev/null 2>&1; then
          if ! check_ufw_port_allowed "$port"; then
            needs_warning=true
            echo "  Port $port: ⚠️  May be blocked (sudo ufw allow $port/tcp)"
          else
            echo "  Port $port: ✓ Allowed"
          fi
        fi
      done
      [ "$needs_warning" = true ] && echo "  💡 If you can't access by IP, allow the ports above."
    else
      echo "  ℹ️  ufw not active"
    fi
  elif [ "$os" = "macos" ]; then
    if check_macos_firewall_active; then
      echo "  ℹ️  macOS firewall enabled (check System Settings if access by IP fails)"
    else
      echo "  ℹ️  macOS firewall not enabled"
    fi
  else
    echo "  ℹ️  OS not detected"
  fi
}

VERSION=$(get_version)
echo "excel-to-web status (v$VERSION)"
echo "=============================="
echo ""

# Backup status (shown in all modes)
BACKUP_LOCK="$ROOT/server/data/backups/.backup.lock"
has_backup_cron() {
  crontab -l 2>/dev/null | grep -q "backup-db.sh"
}
show_backup_status() {
  if [ -f "$BACKUP_LOCK" ]; then
    BACKUP_PID=$(cat "$BACKUP_LOCK" 2>/dev/null)
    if [ -n "$BACKUP_PID" ] && ps -p "$BACKUP_PID" >/dev/null 2>&1; then
      echo "Backup: ✓ Running (PID $BACKUP_PID)"
    else
      rm -f "$BACKUP_LOCK"
      if has_backup_cron; then
        echo "Backup: ✓ Scheduled (cron)"
      else
        echo "Backup: ✗ Not running"
      fi
    fi
  else
    if has_backup_cron; then
      echo "Backup: ✓ Scheduled (cron)"
    else
      echo "Backup: ✗ Not running"
    fi
  fi
}

# Docker
if command -v docker >/dev/null 2>&1; then
  if docker ps --format '{{.Names}}' 2>/dev/null | grep -q "excel-to-web"; then
    echo "Mode: Docker"
    show_backup_status
    echo ""
    cd "$ROOT"
    if docker compose version >/dev/null 2>&1; then
      docker compose ps
    else
      docker-compose ps
    fi
    echo ""
    LOCAL_IP=$(get_local_ip)
    echo "Access:"
    echo "  http://localhost:3000"
    [ -n "$LOCAL_IP" ] && echo "  http://$LOCAL_IP:3000"
    echo ""
    echo "Logs: docker compose logs -f"
    echo "Stop: docker compose down"
    exit 0
  fi
fi

# PM2
if command -v pm2 >/dev/null 2>&1; then
  if pm2 list 2>/dev/null | grep -q "excel-to-web"; then
    echo "Mode: PM2"
    show_backup_status
    echo ""
    pm2 list | head -10
    echo ""
    LOCAL_IP=$(get_local_ip)
    if lsof -Pi :$BACKEND_PORT -sTCP:LISTEN -t >/dev/null 2>&1; then
      echo "Access:"
      echo "  http://localhost:$BACKEND_PORT"
      [ -n "$LOCAL_IP" ] && echo "  http://$LOCAL_IP:$BACKEND_PORT"
    fi
    echo ""
    echo "PM2 commands:"
    echo "  pm2 logs excel-to-web   (view logs)"
    echo "  pm2 restart excel-to-web"
    echo "  ./scripts/pm2-startup.sh   (enable start on boot)"
    echo ""
    check_firewall_status
    exit 0
  fi
fi

# PID file
MODE=""
if lsof -Pi :$FRONTEND_PORT -sTCP:LISTEN -t >/dev/null 2>&1; then
  MODE="Development"
elif lsof -Pi :$BACKEND_PORT -sTCP:LISTEN -t >/dev/null 2>&1; then
  MODE="Production (single process)"
fi

[ -n "$MODE" ] && echo "Mode: $MODE" && echo ""
show_backup_status
echo ""

if [ -f "$PID_FILE" ]; then
  echo "From server.pids:"
  idx=0
  while IFS= read -r pid; do
    [ -z "$pid" ] && continue
    idx=$((idx+1))
    name="Backend"
    [ $idx -eq 2 ] && name="Frontend"
    if ps -p $pid >/dev/null 2>&1; then
      echo "  $name (PID $pid): ✓ Running"
    else
      echo "  $name (PID $pid): ✗ Not running"
    fi
  done < "$PID_FILE"
  echo ""
fi

echo "Ports:"
for port in $BACKEND_PORT $FRONTEND_PORT; do
  name="backend"
  [ $port -eq $FRONTEND_PORT ] && name="frontend"
  if lsof -Pi :$port -sTCP:LISTEN -t >/dev/null 2>&1; then
    pid=$(lsof -ti ":$port" 2>/dev/null)
    echo "  $port ($name): ✓ In use (PID $pid)"
  else
    echo "  $port ($name): ✗ Not in use"
  fi
done
echo ""

LOCAL_IP=$(get_local_ip)
if lsof -Pi :$BACKEND_PORT -sTCP:LISTEN -t >/dev/null 2>&1 || lsof -Pi :$FRONTEND_PORT -sTCP:LISTEN -t >/dev/null 2>&1; then
  echo "Access:"
  if lsof -Pi :$FRONTEND_PORT -sTCP:LISTEN -t >/dev/null 2>&1; then
    echo "  Frontend: http://localhost:$FRONTEND_PORT"
    [ -n "$LOCAL_IP" ] && echo "            http://$LOCAL_IP:$FRONTEND_PORT"
    echo "  API:      http://localhost:$BACKEND_PORT"
    [ -n "$LOCAL_IP" ] && echo "            http://$LOCAL_IP:$BACKEND_PORT"
  else
    echo "  http://localhost:$BACKEND_PORT"
    [ -n "$LOCAL_IP" ] && echo "  http://$LOCAL_IP:$BACKEND_PORT"
  fi
  echo ""
  check_firewall_status
  echo ""
fi

if [ -d "$LOG_DIR" ]; then
  echo "Logs:"
  for f in backend.log frontend.log frontend-build.log; do
    [ -f "$LOG_DIR/$f" ] && echo "  $LOG_DIR/$f ($(du -h "$LOG_DIR/$f" 2>/dev/null | cut -f1))"
  done
  echo ""
  echo "  tail -f $LOG_DIR/backend.log"
  echo "  tail -f $LOG_DIR/frontend.log"
  echo ""
fi
