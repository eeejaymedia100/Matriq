#!/usr/bin/env bash
# Matriq — deliver the release APK to Telegram as a REAL FILE (not a link).
#
# Pre-launch rule: the app is invite-only. The public site hands out nothing
# (the download page/APK/manifest return 410 on purpose), so Telegram IS the
# distribution channel until launch: the file arrives inside the chat and is
# downloaded by Telegram's own transfer — no browser, no host, no cap beyond
# Telegram's 50 MB bot-document limit.
#
#     primary:   this script — one document, caption with install steps
#     fallback:  scripts/_send-apk-chunks.sh — split parts for oversized builds
#     gate:      refuses to send anything > 49 MB (single-document cap is 50)
#
# Usage:   bash scripts/_send-apk-telegram.sh [apk-path] [chat-id]
# Default: newest file in mobile/android/app/build/outputs/apk/release,
#          chat 6911908487 (the owner).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CHAT_ID="${2:-6911908487}"
RELEASE_DIR="$ROOT/mobile/android/app/build/outputs/apk/release"
SERVER=matriq
MAX_MB=49

log() { echo "[tg-apk $(date '+%F %T')] $*"; }

# ── 1. Pick the newest APK ───────────────────────────────────────────
APK="${1:-$(ls -t "$RELEASE_DIR"/*.apk 2>/dev/null | head -1 || true)}"
if [ -z "$APK" ]; then
  log "no APK in $RELEASE_DIR — build one first (scripts/_build-apk.sh)"
  exit 1
fi
SIZE_MB=$(( $(stat -c%s "$APK") / 1048576 ))
log "APK: $APK (${SIZE_MB} MB)"

# ── 2. Gate: never send what the channel cannot carry ────────────────
if [ "$SIZE_MB" -gt "$MAX_MB" ]; then
  log "ABORT: ${SIZE_MB} MB exceeds the ${MAX_MB} MB single-document cap."
  log "Shrink the build (scripts/_build-apk.sh) or split: scripts/_send-apk-chunks.sh"
  exit 2
fi

# ── 3. Send from the server (the bot token never leaves it) ──────────
scp -o BatchMode=yes "$APK" "$SERVER:/tmp/matriq.apk" >/dev/null

VERSION=$(node -p "require('$ROOT/mobile/app.json').expo.version")
CODE=$(node -p "require('$ROOT/mobile/app.json').expo.android.versionCode || 1")

ssh -o BatchMode=yes "$SERVER" bash -s "$CHAT_ID" "$VERSION" "$CODE" <<'REMOTE'
set -euo pipefail
CHAT="$1"; VERSION="$2"; CODE="$3"
TOKEN=$(grep -E "^TELEGRAM_BOT_TOKEN=" ~/.hermes/.env | cut -d= -f2- | tr -d "\r")

CAPTION="📲 Matriq v${VERSION} (build ${CODE}) — the file itself, no link.

What is inside:
• The Vault — past questions organised by course code
• Offline AI study companion — answers with zero data
• Note scanning, photo-to-PDF, deadline tracking, CGPA calculator

To install: tap the file → Download → Open. If Android asks,
allow \"install unknown apps\" for Telegram — that is the standard
prompt for installs outside the Play Store, not a warning about
this file."

R=$(curl -s -F chat_id="$CHAT" \
     -F "caption=$CAPTION" \
     -F "document=@/tmp/matriq.apk" \
     "https://api.telegram.org/bot${TOKEN}/sendDocument")
if echo "$R" | grep -q '"ok":true'; then
  echo "APK delivered as a Telegram document"
else
  echo "TELEGRAM ERROR: $R"
  exit 1
fi
rm -f /tmp/matriq.apk
REMOTE

log "DONE — APK delivered to chat ${CHAT_ID}"
