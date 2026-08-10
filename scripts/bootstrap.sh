#!/usr/bin/env bash
# ── Matriq Bootstrap ──
# Run this from the project root to recover from a fresh VM boot, dropped tmux
# session, or any "how do I get back to a working dev loop" situation.
#
# Usage: bash scripts/bootstrap.sh
#
# Per docs/infrastructure.md: a dead tmux session should be recoverable by one
# documented command, not by re-deriving steps from memory.

set -euo pipefail

echo "=== Matriq Bootstrap ==="
echo ""

# 1. Ensure Docker is running
echo "[1/6] Checking Docker..."
if ! docker info > /dev/null 2>&1; then
  echo "       Docker daemon not running — starting..."
  sudo systemctl start docker
fi
echo "       Docker: OK"

# 2. Check .env exists
echo "[2/6] Checking environment..."
if [ ! -f .env ]; then
  echo "       ERROR: .env file not found."
  echo "       Copy .env.example to .env and fill in real values, then re-run."
  exit 1
fi
echo "       .env: present"

# 3. Pull images (skip if already local, so this is fast on re-run)
echo "[3/6] Pulling container images..."
docker compose pull --quiet 2>&1 || true
echo "       Images: ready"

# 4. Build backend image
echo "[4/6] Building backend image..."
docker compose build backend
echo "       Backend: built"

# 5. Start services
echo "[5/6] Starting services..."
docker compose up -d
echo "       Services: starting..."

# 6. Health check loop
echo "[6/6] Waiting for healthy services..."
ATTEMPTS=0
MAX_ATTEMPTS=30
while [ $ATTEMPTS -lt $MAX_ATTEMPTS ]; do
  if curl -sf http://localhost:3000/health > /dev/null 2>&1; then
    echo "       Backend health check: PASSED"
    break
  fi
  ATTEMPTS=$((ATTEMPTS + 1))
  sleep 2
done

if [ $ATTEMPTS -ge $MAX_ATTEMPTS ]; then
  echo "       WARNING: Backend did not become healthy within 60s."
  echo "       Check: docker compose logs backend"
fi

echo ""
echo "=== Bootstrap complete ==="
echo "Services:  docker compose ps"
echo "Logs:      docker compose logs -f"
echo "Tmux:      tmux attach -t matriq-build    (reconnect to the build session)"
echo ""
