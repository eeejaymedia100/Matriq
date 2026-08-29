#!/usr/bin/env bash
# Matriq — self-host the Next.js dashboards on the VM (drop Vercel).
# Builds the dashboard + admin images, starts them (profile "dashboards"),
# swaps caddy/Caddyfile for caddy/Caddyfile.dashboards, and verifies both
# sites. Idempotent; --disable restores the plain Caddyfile.
#
# Before enabling, DNS must point the subdomains at this VM:
#   Cloudflare → dashboard/admin records: CNAME→cname.vercel-dns.com becomes
#   A → <VM IP> (DNS-only, like api), so Let's Encrypt can issue certs.
# See docs/docs/deployment-cost.md.
set -euo pipefail

cd "$(dirname "$0")/.."

MODE="${1:-enable}"

case "$MODE" in
  enable)
    echo "==> Building + starting the self-hosted dashboards"
    docker compose --profile dashboards build dashboard admin
    docker compose --profile dashboards up -d dashboard admin

    echo "==> Waiting for dashboard + admin health"
    for _ in $(seq 1 30); do
      DASH_OK=$(curl -s -o /dev/null -w '%{http_code}' -m 5 http://localhost:3001/healthz || true)
      ADMIN_OK=$(curl -s -o /dev/null -w '%{http_code}' -m 5 http://localhost:3002/healthz || true)
      if [ "$DASH_OK" = "200" ] && [ "$ADMIN_OK" = "200" ]; then
        echo "==> dashboard:3001/healthz -> 200, admin:3002/healthz -> 200"
        break
      fi
      sleep 5
    done

    echo "==> Swapping Caddyfile for the dashboard-aware config"
    cp caddy/Caddyfile caddy/Caddyfile.orig 2>/dev/null || true
    cp caddy/Caddyfile.dashboards caddy/Caddyfile
    docker compose up -d caddy
    docker compose exec caddy caddy reload --config /etc/caddy/Caddyfile 2>/dev/null \
      || docker compose restart caddy

    echo "==> Verifying public endpoints"
    for _ in $(seq 1 30); do
      A=$(curl -s -o /dev/null -w '%{http_code}' -m 10 "https://admin.matriq.com.ng/healthz" || true)
      D=$(curl -s -o /dev/null -w '%{http_code}' -m 10 "https://dashboard.matriq.com.ng/healthz" || true)
      if [ "$A" = "200" ] && [ "$D" = "200" ]; then
        echo "==> SUCCESS: admin + dashboard serving over HTTPS (no Vercel)."
        echo "    Next: remove the Vercel projects or leave them idle — DNS now goes to this VM."
        exit 0
      fi
      sleep 5
    done

    echo "WARNING: containers are healthy locally but the public check didn't pass." >&2
    echo "  Check: DNS records repointed at this VM? TLS issued? (docker compose logs caddy)" >&2
    exit 1
    ;;

  disable)
    echo "==> Disabling self-hosted dashboards (restoring plain Caddyfile)"
    docker compose --profile dashboards stop dashboard admin
    if [ -f caddy/Caddyfile.orig ]; then
      mv caddy/Caddyfile.orig caddy/Caddyfile
    fi
    docker compose up -d caddy
    docker compose exec caddy caddy reload --config /etc/caddy/Caddyfile 2>/dev/null \
      || docker compose restart caddy
    echo "==> Done. Vercel URLs (if still deployed) take over again."
    ;;

  *)
    echo "Usage: $0 [enable|disable]" >&2
    exit 1
    ;;
esac
