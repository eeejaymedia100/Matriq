#!/usr/bin/env bash
# Matriq — single-VM deploy script (run on the GCP VM as the deploy user).
# Per docs/infrastructure.md and docs/ci-cd.md. Idempotent and safe to re-run;
# never deletes data volumes.
set -euo pipefail

cd "$(dirname "$0")/.."

# ── Prerequisites ───────────────────────────────────────────────
if ! command -v docker >/dev/null 2>&1; then
  echo "ERROR: docker not found. Install Docker + the compose plugin first." >&2
  exit 1
fi

if [ ! -f .env ]; then
  echo "ERROR: .env missing. Copy .env.example to .env and fill in real values." >&2
  exit 1
fi

for var in POSTGRES_PASSWORD JWT_SECRET JWT_REFRESH_SECRET RESEND_API_KEY; do
  if ! grep -q "^${var}=.\+" .env 2>/dev/null; then
    echo "ERROR: .env is missing ${var}." >&2
    exit 1
  fi
done

# ── 1. Databases first (backend depends on them) ────────────────
echo "==> Starting postgres + redis"
docker compose up -d postgres redis

echo "==> Waiting for postgres to be healthy"
for _ in $(seq 1 30); do
  if docker compose ps postgres | grep -q healthy; then
    break
  fi
  sleep 2
done

# ── 2. Database migrations ──────────────────────────────────────
# Explicit, reviewed step — never applied silently by a generic deploy
# (per ci-cd.md: a migration that locks a table needs eyes on it first).
echo "==> Applying migrations (prisma migrate deploy)"
docker compose run --rm migrate

# ── 3. Build + start the rest of the stack ──────────────────────
echo "==> Building and starting backend, caddy, ollama"
docker compose up -d --build backend caddy ollama

# ── 4. Health check ─────────────────────────────────────────────
echo "==> Waiting for backend /health"
for _ in $(seq 1 30); do
  if docker compose ps backend | grep -q healthy; then
    echo "==> Backend healthy. Deploy complete."
    docker compose ps
    exit 0
  fi
  sleep 2
done

echo "ERROR: backend did not become healthy. Inspect: docker compose logs backend" >&2
exit 1
