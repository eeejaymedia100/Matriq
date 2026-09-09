#!/usr/bin/env bash
# Matriq — full release pipeline: build the APK, ship it to the server and
# bump the live update manifest, then deliver the APK to the owner on
# Telegram as TWO split chunks (scripts/_send-apk-chunks.sh) because the raw
# APK exceeds Telegram's 50 MB bot-document cap.
#
# Usage: bash scripts/_release-and-ship.sh "release notes"
# Run with nohup so it survives the session; watch /tmp/release-pipeline.log.
set -uo pipefail

ROOT=/home/akpevwejulius1/matriq
LOG=/tmp/release-pipeline.log
RELEASE_NOTES="${1:-Update: OCR now runs fully offline on your phone, logins stay alive with automatic token refresh, and saved past questions open without internet.}"

# Telegram Bot API hard cap for documents.
TG_DOC_LIMIT=$((50 * 1024 * 1024))

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

APK=$(ls -t "$ROOT"/mobile/android/app/build/outputs/apk/release/*.apk 2>/dev/null | head -1)
if [ -z "$APK" ]; then
  log "no APK found to send"
  exit 1
fi
APK_SIZE=$(stat -c%s "$APK")
log "APK: $APK ($(du -h "$APK" | cut -f1))"

# ── Hard gate: a 94 MB APK can't be shipped over the 50 MB bot cap ──
if [ "$APK_SIZE" -gt "$TG_DOC_LIMIT" ]; then
  log "APK is over Telegram's 50 MB document cap — raw + zip delivery would both fail."
  log "Deliver with: bash scripts/_send-apk-chunks.sh"
fi

log "=== 2/3 SHIP + MANIFEST ==="
RELEASE_NOTES="$RELEASE_NOTES" bash "$ROOT/scripts/_finalize-apk.sh" >> "$LOG" 2>&1
FIN_EXIT=$?
if [ "$FIN_EXIT" -ne 0 ]; then
  log "FINALIZE FAILED (exit $FIN_EXIT) — tail of log:"
  tail -30 "$LOG"
  exit 1
fi
log "ship OK"

log "=== 3/3 SEND APK TO TELEGRAM (chunked) ==="
bash "$ROOT/scripts/_send-apk-chunks.sh" "$APK" >> "$LOG" 2>&1
CHUNK_EXIT=$?
if [ "$CHUNK_EXIT" -ne 0 ]; then
  log "CHUNKED TELEGRAM DELIVERY FAILED (exit $CHUNK_EXIT) — tail of log:"
  tail -30 "$LOG"
  exit 1
fi

log "=== PIPELINE DONE ==="
