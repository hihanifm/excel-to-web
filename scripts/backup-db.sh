#!/usr/bin/env bash
# Backup the SQLite database to server/data/backups/
# Usage:
#   ./scripts/backup-db.sh                      # Backup now
#   ./scripts/backup-db.sh --keep N             # Keep only last N backups
#   ./scripts/backup-db.sh --retain-days N      # Delete backups older than N days
#   ./scripts/backup-db.sh --every-hours N      # Only backup if last backup ≥N hours ago AND DB changed
#   ./scripts/backup-db.sh --every-hours 6 --retain-days 7   # Cron-friendly: every 6h if changed, keep 7 days
set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

# Load server .env if present (for DB_PATH)
if [ -f "$ROOT/server/.env" ]; then
  set -a
  source "$ROOT/server/.env"
  set +a
fi

# Resolve DB_PATH (may be relative in .env)
if [ -z "$DB_PATH" ]; then
  DB_PATH="$ROOT/server/data/excel-app.db"
elif [[ "$DB_PATH" != /* ]]; then
  DB_PATH="$ROOT/server/$DB_PATH"
fi
BACKUP_DIR="$ROOT/server/data/backups"
mkdir -p "$BACKUP_DIR"

# Parse args
KEEP=""
OUTPUT=""
EVERY_HOURS=""
RETAIN_DAYS=""
while [[ $# -gt 0 ]]; do
  case $1 in
    --keep) KEEP="$2"; shift 2 ;;
    --output) OUTPUT="$2"; shift 2 ;;
    --every-hours) EVERY_HOURS="$2"; shift 2 ;;
    --retain-days) RETAIN_DAYS="$2"; shift 2 ;;
    -h|--help)
      echo "Usage: $0 [--keep N] [--retain-days N] [--every-hours N] [--output path]"
      echo "  --keep N         Keep only last N backups (count-based)"
      echo "  --retain-days N  Delete backups older than N days (duration-based)"
      echo "  --every-hours N  Only backup if last backup ≥N hours ago AND DB changed since last backup"
      echo "  --output path    Custom backup path"
      echo ""
      echo "Cron example (every hour, backup if 6+ hours since last backup and DB changed, keep 7 days):"
      echo "  0 * * * * cd /path/to/excel-to-web && ./scripts/backup-db.sh --every-hours 6 --retain-days 7"
      exit 0
      ;;
    *) echo "Usage: $0 [--keep N] [--retain-days N] [--every-hours N] [--output path]" >&2; exit 1 ;;
  esac
done

if [ ! -f "$DB_PATH" ]; then
  echo "Error: Database not found at $DB_PATH"
  exit 1
fi

# --every-hours N: skip if last backup was <N hours ago OR DB unchanged since last backup
print_cron_line() {
  echo ""
  echo "Cron (add with crontab -e):"
  echo "0 * * * * cd $ROOT && ./scripts/backup-db.sh --every-hours 6 --retain-days 7"
}
if [ -n "$EVERY_HOURS" ] && [ "$EVERY_HOURS" -gt 0 ] 2>/dev/null; then
  LATEST=$(ls -t "$BACKUP_DIR"/excel-app-*.db 2>/dev/null | head -1)
  if [ -n "$LATEST" ]; then
    NOW=$(date +%s)
    LAST_MTIME=$(stat -f %m "$LATEST" 2>/dev/null || stat -c %Y "$LATEST" 2>/dev/null)
    DB_MTIME=$(stat -f %m "$DB_PATH" 2>/dev/null || stat -c %Y "$DB_PATH" 2>/dev/null)
    HOURS_SINCE=$(( (NOW - LAST_MTIME) / 3600 ))
    if [ "$HOURS_SINCE" -lt "$EVERY_HOURS" ]; then
      print_cron_line
      exit 0
    fi
    if [ "$DB_MTIME" -le "$LAST_MTIME" ]; then
      print_cron_line
      exit 0
    fi
  fi
fi

BACKUP_LOCK="$BACKUP_DIR/.backup.lock"
cleanup_lock() { rm -f "$BACKUP_LOCK"; }
trap cleanup_lock EXIT
echo "$$" > "$BACKUP_LOCK"

if [ -n "$OUTPUT" ]; then
  BACKUP_PATH="$OUTPUT"
else
  TS=$(date +%Y%m%d%H%M%S)
  BACKUP_PATH="$BACKUP_DIR/excel-app-$TS.db"
fi

# Use sqlite3 .backup (reliable when app is running) or fall back to Node script
if command -v sqlite3 >/dev/null 2>&1; then
  sqlite3 "$DB_PATH" ".backup '$BACKUP_PATH'"
else
  cd "$ROOT/server" && node scripts/backup-db.mjs --output "$BACKUP_PATH"
fi

echo "Backup created: $BACKUP_PATH"

# Prune by count (--keep N)
if [ -n "$KEEP" ] && [ "$KEEP" -gt 0 ] 2>/dev/null; then
  ls -t "$BACKUP_DIR"/excel-app-*.db 2>/dev/null | tail -n +$((KEEP + 1)) | while read -r f; do rm -f "$f" && echo "Removed old backup: $f"; done
fi

# Prune by duration (--retain-days N)
if [ -n "$RETAIN_DAYS" ] && [ "$RETAIN_DAYS" -gt 0 ] 2>/dev/null; then
  find "$BACKUP_DIR" -maxdepth 1 -name "excel-app-*.db" -mtime +"$RETAIN_DAYS" 2>/dev/null | while read -r f; do
    rm -f "$f" && echo "Removed backup older than ${RETAIN_DAYS} days: $f"
  done
fi

print_cron_line
