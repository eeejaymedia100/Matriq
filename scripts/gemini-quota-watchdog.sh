#!/usr/bin/env bash
# Deep Read / Gemini key watchdog — warns when the shared GEMINI_API_KEY is
# close to exhausting its daily quota (the implicit ceiling before 429s).
#
# Design: Tier 1 (billed, first $250 spent) ≈ 10,000 RPM across the whole key
# shared with chat/OCR/facts traffic. Deep Read Pro pages are the expensive
# traffic. We count today's Pro calls from the backend container logs and
# warn at thresholds (default: 500/day).
#
# Deploy target: matriq-server VM — cron every 15 min:
#   */15 * * * * bash /home/akpevwejulius1/matriq/scripts/gemini-quota-watchdog.sh >> /var/log/matriq-watchdog.log 2>&1
#
# Telegram: reads TELEGRAM_BOT_TOKEN from ~/.hermes/.env (same as the ship
# script) and messages the same chat the release notices go to. On this dev
# box (no token, no docker) it logs locally instead.

set -u

THRESHOLD="${WATCHDOG_THRESHOLD:-500}"
STATE_FILE="/tmp/.gemini-watchdog-state"
LOG_SRC="$(docker logs matriq-backend --since 24h 2>/dev/null | grep -c 'deep_read' || true)"
PRO_CALLS="$(docker logs matriq-backend --since 24h 2>/dev/null | grep -E 'Deep Read (job|page)' | grep -c 'engine deep_read' || true)"
TODAY="$(date +%Y-%m-%d)"

# Count Deep Read pages transcribed today (job log lines carry page counts).
PAGES_TODAY="$(docker logs matriq-backend --since 24h 2>/dev/null \
  | grep -oE 'Deep Read job [a-f0-9-]+ finished: [0-9]+/[0-9]+ pages' \
  | awk -F'finished: ' '{split($2,a,"/"); s+=a[1]} END {print s+0}')"

# Reset the state file on a new day.
if [ -f "$STATE_FILE" ]; then
  STATE_DAY="$(cut -d'|' -f1 "$STATE_FILE")"
  if [ "$STATE_DAY" != "$TODAY" ]; then rm -f "$STATE_FILE"; fi
fi

warn() {
  local level="$1" msg="$2"
  echo "[$(date '+%F %T')] WATCHDOG $level: $msg"
  local token=""
  if [ -f "$HOME/.hermes/.env" ]; then
    token="$(grep -E '^TELEGRAM_BOT_TOKEN=' "$HOME/.hermes/.env" | cut -d= -f2- | tr -d '\r')"
  fi
  if [ -n "$token" ]; then
    local chat_id
    chat_id="$(grep -E '^TELEGRAM_CHAT_ID=' "$HOME/.hermes/.env" | cut -d= -f2- | tr -d '\r')"
    if [ -z "$chat_id" ]; then
      # Discover the chat id from the last update (ship-script pattern).
      chat_id="$(curl -s --max-time 10 "https://api.telegram.org/bot${token}/getUpdates" \
        | grep -oE '"chat":\{[^}]*"id":[0-9]+' | grep -oE '[0-9]+$' | tail -1)"
    fi
    if [ -n "$chat_id" ]; then
      curl -s --max-time 10 -X POST "https://api.telegram.org/bot${token}/sendMessage" \
        -d chat_id="$chat_id" -d text="🔔 Matriq watchdog [$level]: $msg" >/dev/null || true
    fi
  fi
}

if [ "$PAGES_TODAY" -ge "$THRESHOLD" ]; then
  if [ -f "$STATE_FILE" ] && grep -q "warned" "$STATE_FILE"; then
    exit 0  # already warned today
  fi
  warn "HIGH" "Deep Read usage at ${PAGES_TODAY} pages today (threshold ${THRESHOLD}). Gemini key quota pressure — expect 429s on the Pro tier soon. Enable higher Tier or lower DEEP_READ_PREMIUM_DAILY."
  echo "${TODAY}|warned" > "$STATE_FILE"
elif [ "$PAGES_TODAY" -ge $((THRESHOLD * 70 / 100)) ]; then
  if [ -f "$STATE_FILE" ] && grep -q "warned70" "$STATE_FILE"; then
    exit 0
  fi
  warn "MED" "Deep Read usage at ${PAGES_TODAY} pages today (70% of ${THRESHOLD})."
  echo "${TODAY}|warned70" > "$STATE_FILE"
else
  echo "[$(date '+%F %T')] ok: ${PAGES_TODAY} pages today (threshold ${THRESHOLD})"
fi
