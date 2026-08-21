#!/usr/bin/env bash
# Matriq — full release pipeline: build the APK, ship it to the server and
# bump the live update manifest, then send the APK to the owner on Telegram.
# Usage: bash scripts/_release-and-ship.sh "release notes"
# Run with nohup so it survives the session; watch /tmp/release-pipeline.log.
set -uo pipefail

ROOT=/home/akpevwejulius1/matriq
LOG=/tmp/release-pipeline.log
RELEASE_NOTES="${1:-Update: OCR now runs fully offline on your phone, logins stay alive with automatic token refresh, and saved past questions open without internet.}"

log() { echo "[pipeline $(date '+%F %T')] $*" | tee -a "$LOG"; }

log "=== 1/3 BUILD ==="
bash "$ROOT/scripts/_build-apk.sh" >> "$LOG" 2>&1
BUILD_EXIT=$?
if [ "$BUILD_EXIT" -ne 0 ]; then
  log "BUILD FAILED (exit $BUILD_EXIT) — tail of log:"
  tail -30 "$LOG"
  exit 1
fi
log "build OK"

log "=== 2/3 SHIP + MANIFEST ==="
RELEASE_NOTES="$RELEASE_NOTES" bash "$ROOT/scripts/_finalize-apk.sh" >> "$LOG" 2>&1
FIN_EXIT=$?
if [ "$FIN_EXIT" -ne 0 ]; then
  log "FINALIZE FAILED (exit $FIN_EXIT) — tail of log:"
  tail -30 "$LOG"
  exit 1
fi
log "ship OK"

log "=== 3/3 SEND APK TO TELEGRAM ==="
APK=$(ls -t "$ROOT"/mobile/android/app/build/outputs/apk/release/*.apk 2>/dev/null | head -1)
if [ -z "$APK" ]; then
  log "no APK found to send"
  exit 1
fi
log "APK: $APK ($(du -h "$APK" | cut -f1))"

# The Telegram bot token lives on the matriq server — copy the APK there and
# send from the server so the token never leaves it.
scp -o BatchMode=yes "$APK" matriq:/tmp/matriq-release.apk >> "$LOG" 2>&1 || {
  log "scp of APK to server failed"; exit 1; }
RESP=$(ssh -o BatchMode=yes matriq 'bash -s' <<'EOF'
  TOKEN=$(grep -E "^TELEGRAM_BOT_TOKEN=" ~/.hermes/.env | cut -d= -f2- | tr -d "\r")
  curl -s \
    -F chat_id=6911908487 \
    -F "caption=Matriq v0.7.9 (build 17) — offline OCR, automatic token refresh, offline Vault. Install by opening this file." \
    -F document=@/tmp/matriq-release.apk \
    "https://api.telegram.org/bot${TOKEN}/sendDocument"
EOF
)
echo "$RESP" >> "$LOG"
if echo "$RESP" | grep -q '"ok":true'; then
  log "TELEGRAM SEND OK"
else
  log "TELEGRAM SEND FAILED — check the response above (likely the 50MB bot limit)"
  exit 1
fi

log "=== PIPELINE DONE ==="
