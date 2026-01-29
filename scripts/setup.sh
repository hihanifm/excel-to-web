#!/usr/bin/env bash
set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
echo "=== Setup excel-to-web ==="
echo "Installing server dependencies..."
(cd server && npm install)
echo "Installing client dependencies..."
(cd client && npm install)
echo "Done. Run ./scripts/start.sh (or npm run start) for dev, ./scripts/start.sh -p for prod."
