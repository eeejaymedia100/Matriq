#!/usr/bin/env bash
# Matriq — enable Cloudflare origin mode on the VM.
# Swaps caddy/Caddyfile for the domain-aware config, sets CORS_ORIGIN for the
# Vercel dashboard origins, restarts caddy + backend, and verifies the public
# endpoint through Cloudflare. Idempotent; --disable restores the pre-domain config.
#
# Prerequisites (see docs/docs/cloudflare-vercel.md):
#   - Domain registered and its Cloudflare zone active (DNS proxied to this VM).
#   - Origin cert at caddy/certs/origin.pem + caddy/certs/origin.key
#     (generated in Cloudflare: SSL/TLS -> Origin Server -> Create Certificate).
#   - Vercel projects live at admin.<domain> and dashboard.<domain>.
set -euo pipefail

cd "$(dirname "$0")/.."

DOMAIN="${DOMAIN:-matriq.app}"
CORS_DEFAULT="https://admin.${DOMAIN},https://dashboard.${DOMAIN},http://localhost:8081"
MODE="${1:-enable}"

case "$MODE" in
  enable)
    echo "==> Enabling Cloudflare origin mode for ${DOMAIN}"

    # 1. Origin cert must exist — never start Caddy with a broken tls directive.
    if [ ! -f caddy/certs/origin.pem ] || [ ! -f caddy/certs/origin.key ]; then
      echo "ERROR: origin cert missing. Generate it in Cloudflare" >&2
      echo "  (SSL/TLS -> Origin Server -> Create Certificate) and save to:" >&2
      echo "  caddy/certs/origin.pem  and  caddy/certs/origin.key" >&2
      exit 1
    fi
    chmod 600 caddy/certs/origin.key

    # 2. Domain-aware Caddyfile (keep a backup of the current one).
    cp caddy/Caddyfile caddy/Caddyfile.orig 2>/dev/null || true
    sed "s/{{DOMAIN}}/${DOMAIN}/g" caddy/Caddyfile.cloudflare > caddy/Caddyfile

    # 3. CORS origins for the Vercel dashboards (backend whitelist).
    if ! grep -q "^CORS_ORIGIN=" .env; then
      echo "CORS_ORIGIN=${CORS_DEFAULT}" >> .env
    else
      sed -i "s|^CORS_ORIGIN=.*|CORS_ORIGIN=${CORS_DEFAULT}|" .env
    fi

    echo "==> Caddyfile: $(head -1 caddy/Caddyfile)"
    echo "==> CORS_ORIGIN=$(grep '^CORS_ORIGIN=' .env | cut -d= -f2)"
    ;;

  disable)
    echo "==> Disabling Cloudflare origin mode (restoring pre-domain Caddyfile)"
    if [ -f caddy/Caddyfile.orig ]; then
      mv caddy/Caddyfile.orig caddy/Caddyfile
    fi
    if grep -q "^CORS_ORIGIN=" .env; then
      sed -i "s|^CORS_ORIGIN=.*|CORS_ORIGIN=http://localhost:8081|" .env
    fi
    ;;

  *)
    echo "Usage: $0 [enable|disable]" >&2
    exit 1
    ;;
esac

# 4. Recreate caddy + backend so they pick up the new config/env.
echo "==> Restarting caddy + backend"
docker compose up -d caddy backend

# 5. Verify the public endpoint through Cloudflare.
echo "==> Waiting for https://api.${DOMAIN}/health"
for _ in $(seq 1 30); do
  CODE=$(curl -s -o /dev/null -w '%{http_code}' -m 10 "https://api.${DOMAIN}/health" || true)
  if [ "$CODE" = "200" ]; then
    echo "==> SUCCESS: https://api.${DOMAIN}/health -> 200"
    curl -sI "https://api.${DOMAIN}/health" | grep -iE 'HTTP/|server:'
    echo "==> Cloudflare origin mode enabled."
    exit 0
  fi
  sleep 5
done

echo "ERROR: https://api.${DOMAIN}/health did not return 200." >&2
echo "  Check: DNS record proxied? SSL mode Full (strict)? cert matches hostname?" >&2
echo "  Inspect: docker compose logs caddy backend" >&2
exit 1
