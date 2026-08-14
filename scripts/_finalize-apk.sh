#!/usr/bin/env bash
# Matriq — finalize the v0.6.0 (build 7) APK: wait for the gradle build, deploy
# to matriq-server, bump the live manifest, verify, and Telegram the result.
# Run on cliptonite-server (this box). Safe to re-run; idempotent.
set -euo pipefail

LOG=/tmp/gradle-resume.log
RELEASE_DIR=/home/akpevwejulius1/matriq/mobile/android/app/build/outputs/apk/release
REMOTE=matriq
MAX_WAIT_MIN=480

log() { echo "[finalize $(date '+%F %T')] $*"; }

log "waiting for APK build to finish (polling $LOG)..."
waited=0
while ! grep -qE 'BUILD SUCCESSFUL|BUILD FAILED' "$LOG" 2>/dev/null; do
  sleep 120
  waited=$((waited + 2))
  log "waited ${waited} min"
  if [ "$waited" -ge "$MAX_WAIT_MIN" ]; then
    log "TIMED OUT after ${waited}min — build still not done"
    exit 1
  fi
done

if grep -q 'BUILD FAILED' "$LOG"; then
  log "BUILD FAILED — last 40 lines:"
  tail -40 "$LOG"
  exit 1
fi

log "BUILD SUCCESSFUL — locating APK"
if ! ls "$RELEASE_DIR"/*.apk >/dev/null 2>&1; then
  log "no APK found in $RELEASE_DIR"
  find /home/akpevwejulius1/matriq/mobile/android -name '*.apk' 2>/dev/null | head
  exit 1
fi
APK=$(ls -t "$RELEASE_DIR"/*.apk | head -1)
log "APK: $APK ($(du -h "$APK" | cut -f1))"

# Verify versionCode before shipping.
AAPT=$(ls /home/akpevwejulius1/Android/Sdk/build-tools/*/aapt 2>/dev/null | sort -V | tail -1 || true)
if [ -n "$AAPT" ]; then
  "$AAPT" dump badging "$APK" 2>/dev/null | grep -E 'package: name|versionCode|versionName' | head -3 || true
fi

log "scp APK -> $REMOTE"
scp -o BatchMode=yes "$APK" "$REMOTE:~/matriq/waitlist/matriq.apk"

log "updating remote manifest + download copy"
ssh -o BatchMode=yes "$REMOTE" 'bash -s' <<'REMOTE'
set -euo pipefail
cd ~/matriq/waitlist
cp -f matriq.apk download/matriq.apk
cat > app-version.json <<'JSON'
{
  "versionCode": 7,
  "versionName": "0.6.0",
  "url": "https://matriq.com.ng/download/matriq.apk",
  "notes": "v0.6.0 build 7: The Vault is live (search past questions & materials, uploads with smart-storage light copies, admin review queue), Image to Text (OCR), Image to PDF and File Compressor tools, scheduled account deletion (6-month grace, sign-in cancels), and a reworked Dues & Payments screen.",
  "publishedAt": "2026-08-15T00:00:00Z"
}
JSON
echo "[finalize] manifest now:"
cat app-version.json
ls -la matriq.apk download/matriq.apk
REMOTE

log "verifying live URLs (non-fatal)"
curl -s -m 20 https://matriq.com.ng/app-version.json || true; echo
curl -sI -m 20 https://matriq.com.ng/download/matriq.apk | head -4 || true

log "sending Telegram (summary + APK)"
ssh -o BatchMode=yes "$REMOTE" 'bash -s' <<'REMOTE'
set -euo pipefail
TOKEN=$(grep -E '^TELEGRAM_BOT_TOKEN=' ~/.hermes/.env | head -1 | cut -d= -f2-)
CHAT=$(grep -E '^TELEGRAM_HOME_CHANNEL=' ~/.hermes/.env | head -1 | cut -d= -f2-)
[ -z "$TOKEN" ] || [ -z "$CHAT" ] && { echo "missing telegram env"; exit 1; }
MSG="Matriq v0.6.0 (build 7) is LIVE - the full spec overhaul APK. Backend deployed + migration applied. Download: https://matriq.com.ng/download/matriq.apk"
curl -s -m 30 "https://api.telegram.org/bot${TOKEN}/sendMessage" \
  --data-urlencode "chat_id=${CHAT}" --data-urlencode "text=${MSG}" > /tmp/tg-msg.json
echo "msg resp: $(head -c 160 /tmp/tg-msg.json)"
curl -s -m 300 "https://api.telegram.org/bot${TOKEN}/sendDocument" \
  -F "chat_id=${CHAT}" -F "document=@$HOME/matriq/waitlist/matriq.apk" \
  -F "caption=Matriq v0.6.0 (build 7) APK" > /tmp/tg-doc.json
echo "doc resp: $(head -c 160 /tmp/tg-doc.json)"
REMOTE

log "DONE"
