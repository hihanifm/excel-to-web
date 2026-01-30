#!/usr/bin/env bash
set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DATA_DIR="$ROOT/server/data"

echo "Removing contents of $DATA_DIR ..."
if [ ! -d "$DATA_DIR" ]; then
  echo "  (directory does not exist, nothing to do)"
  exit 0
fi
# Remove all contents but keep the directory
find "$DATA_DIR" -mindepth 1 -delete
echo "✓ Contents of server/data removed."
