#!/usr/bin/env bash
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SCRIPT_DIR="$ROOT/scripts"

"$SCRIPT_DIR/stop.sh"
"$SCRIPT_DIR/start.sh" "$@"
