#!/usr/bin/env bash
set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

# Function to get version
get_version() {
  if [ -f "$ROOT/VERSION" ]; then
    cat "$ROOT/VERSION" | tr -d '\n\r'
  else
    echo "unknown"
  fi
}

VERSION=$(get_version)

echo "========================================="
echo "Excel-to-web - Setup"
echo "Version: $VERSION"
echo "========================================="
echo ""

command_exists() {
  command -v "$1" >/dev/null 2>&1
}

echo "Checking prerequisites..."
echo ""

if ! command_exists node; then
  echo "❌ Error: Node.js is not installed!"
  echo ""
  echo "Please install Node.js (v18 or higher) from:"
  echo "  https://nodejs.org/"
  echo ""
  exit 1
fi

NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 18 ] 2>/dev/null; then
  echo "⚠️  Warning: Node.js version is below 18. You have $(node -v)"
  echo "   The application requires Node.js v18 or higher."
  echo ""
  read -p "Continue anyway? (not recommended) (y/n) " -n 1 -r
  echo
  if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Setup cancelled. Please upgrade Node.js first."
    exit 1
  fi
fi

echo "✓ Node.js found: $(node -v)"
echo "✓ npm found: $(npm -v)"
echo ""

# Optional Docker
if command_exists docker; then
  echo "✓ Docker found: $(docker --version)"
  if docker compose version >/dev/null 2>&1; then
    echo "✓ Docker Compose (plugin) found"
  elif command_exists docker-compose; then
    echo "✓ docker-compose found: $(docker-compose --version)"
  else
    echo "⚠️  docker-compose not found (optional for Docker mode)"
  fi
else
  echo "ℹ️  Docker not found (optional - for Docker deployment)"
fi

# Optional PM2 (auto-restart, start on boot)
if command_exists pm2; then
  echo "✓ PM2 found: $(pm2 --version 2>/dev/null || echo 'installed')"
else
  echo "ℹ️  PM2 not found (optional - for auto-restart and start on boot: npm install -g pm2)"
fi
echo ""

# Create directories
echo "Creating necessary directories..."
mkdir -p "$ROOT/server/data"
mkdir -p "$ROOT/logs"
echo "✓ server/data and logs created"
echo ""

# Install server dependencies
echo "Installing server dependencies..."
cd "$ROOT/server"
if [ ! -f "package.json" ]; then
  echo "❌ Error: server/package.json not found!"
  exit 1
fi
npm install
if [ $? -ne 0 ]; then
  echo "❌ Error: Server installation failed!"
  exit 1
fi
echo "✓ Server dependencies installed"
echo ""

# Install client dependencies
echo "Installing client dependencies..."
cd "$ROOT/client"
if [ ! -f "package.json" ]; then
  echo "❌ Error: client/package.json not found!"
  exit 1
fi
npm install
if [ $? -ne 0 ]; then
  echo "❌ Error: Client installation failed!"
  exit 1
fi
echo "✓ Client dependencies installed"
echo ""

cd "$ROOT"

# Security audit
echo "Checking for security vulnerabilities..."
if npm audit --prefix server --audit-level=high >/dev/null 2>&1; then
  echo "✓ No high severity vulnerabilities in server"
else
  echo "⚠️  Some vulnerabilities in server - run 'npm audit fix' in server/"
fi
if npm audit --prefix client --audit-level=high >/dev/null 2>&1; then
  echo "✓ No high severity vulnerabilities in client"
else
  echo "⚠️  Some vulnerabilities in client - run 'npm audit fix' in client/"
fi
echo ""

echo "========================================="
echo "✓ Setup complete!"
echo "========================================="
echo ""
echo "Next steps:"
echo "  ./scripts/start.sh     (dev: backend 36000 + frontend 36001, default)"
echo "  ./scripts/start.sh -p  (prod: single process on 36000)"
echo "  ./scripts/start.sh -m  (PM2: auto-restart, then ./scripts/pm2-startup.sh for start on boot)"
echo "  ./scripts/status.sh   (check status)"
echo "  ./scripts/stop.sh     (stop servers)"
echo "  ./scripts/backup-db.sh (backup DB to server/data/backups/; use --keep N to retain last N)"
echo ""
