#!/usr/bin/env bash
# Enable PM2 to start excel-to-web on system boot.
# Run this AFTER starting with: ./scripts/start.sh --pm2
# Requires: excel-to-web must be running under PM2 (pm2 list shows it)
set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

echo "========================================="
echo "PM2 Start on Boot"
echo "========================================="
echo ""

if ! command -v pm2 >/dev/null 2>&1; then
  echo "❌ PM2 not found. Install with: npm install -g pm2"
  exit 1
fi

if ! pm2 list 2>/dev/null | grep -q "excel-to-web"; then
  echo "❌ excel-to-web is not running under PM2."
  echo ""
  echo "Start it first with:"
  echo "  ./scripts/start.sh --pm2"
  echo ""
  echo "Then run this script again."
  exit 1
fi

echo "excel-to-web is running under PM2 ✓"
echo ""
echo "Generating startup script (run the command PM2 outputs below):"
echo ""
pm2 startup
echo ""
echo "Saving current process list..."
pm2 save
echo ""
echo "✓ Done. excel-to-web will start on boot."
echo ""
echo "To disable start on boot:"
echo "  pm2 unstartup"
echo "  pm2 save"
echo ""
