#!/usr/bin/env bash
# Add backup to crontab (runs every hour; backs up if 6+ hours since last and DB changed; keeps 7 days)
# Usage: ./scripts/backup-cron-setup.sh [--every-hours N] [--retain-days N]
set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

EVERY_HOURS=6
RETAIN_DAYS=7
while [[ $# -gt 0 ]]; do
  case $1 in
    --every-hours) EVERY_HOURS="$2"; shift 2 ;;
    --retain-days) RETAIN_DAYS="$2"; shift 2 ;;
    -h|--help)
      echo "Usage: $0 [--every-hours N] [--retain-days N]"
      echo "  Adds cron job: run backup every hour if N+ hours since last backup and DB changed."
      echo "  Default: --every-hours 6 --retain-days 7"
      exit 0
      ;;
    *) echo "Usage: $0 [--every-hours N] [--retain-days N]" >&2; exit 1 ;;
  esac
done

CRON_LINE="0 * * * * cd $ROOT && ./scripts/backup-db.sh --every-hours $EVERY_HOURS --retain-days $RETAIN_DAYS"

# Check if already exists
if crontab -l 2>/dev/null | grep -q "backup-db.sh"; then
  echo "Cron job for backup-db.sh already exists. Remove it first with: crontab -e"
  exit 1
fi

(crontab -l 2>/dev/null; echo "$CRON_LINE") | crontab -
echo "✓ Cron job added:"
echo "  $CRON_LINE"
echo ""
echo "To remove: crontab -e (then delete the line)"
echo "To view: crontab -l"
