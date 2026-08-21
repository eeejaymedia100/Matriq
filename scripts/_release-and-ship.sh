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

# Telegram's bot API caps documents at 50MB but the raw APK is ~63MB (native
# libs are stored uncompressed). Zip it — max compression gets it to ~31MB,
# well under the limit, and any Android file manager extracts it natively.
ZIP=/tmp/matriq-release.apk.zip
python3 - "$APK" "$ZIP" <<'PY'
import sys, zipfile, os
apk, out = sys.argv[1], sys.argv[2]
with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED, compresslevel=9) as z:
    z.write(apk, "matriq.apk")
print("zip: %.1f MB" % (os.path.getsize(out) / 1048576))
PY

VERSION=$(node -p "require('$ROOT/mobile/app.json').expo.version")

# The Telegram bot token lives on the matriq server — copy the zip there and
# send from the server so the token never leaves it.
scp -o BatchMode=yes "$ZIP" matriq:/tmp/matriq-release.apk.zip >> "$LOG" 2>&1 || {
  log "scp of zip to server failed"; exit 1; }
RESP=$(ssh -o BatchMode=yes matriq "bash -s" <<EOF
  TOKEN=\$(grep -E "^TELEGRAM_BOT_TOKEN=" ~/.hermes/.env | cut -d= -f2- | tr -d "\r")
  curl -s \\
    -F chat_id=6911908487 \\
    -F "caption=Matriq v${VERSION} — this ZIP contains matriq.apk. Extract it in Files, then tap the APK to install. Or use the direct link in the next message." \\
    -F document=@/tmp/matriq-release.apk.zip \\
    "https://api.telegram.org/bot\${TOKEN}/sendDocument"
EOF
)
echo "$RESP" >> "$LOG"
if echo "$RESP" | grep -q '"ok":true'; then
  log "TELEGRAM ZIP SEND OK"
else
  log "TELEGRAM ZIP SEND FAILED — response above"
  exit 1
fi

# Also send the direct download link (zero-friction install path).
LINK_RESP=$(ssh -o BatchMode=yes matriq "bash -s" <<EOF
  TOKEN=\$(grep -E "^TELEGRAM_BOT_TOKEN=" ~/.hermes/.env | cut -d= -f2- | tr -d "\r")
  curl -s \\
    -F chat_id=6911908487 \\
    -F "text=📲 Direct APK link — tap on your phone and install straight from the browser:\nhttps://matriq.com.ng/download/matriq.apk\n\nMatriq v${VERSION} (latest)" \\
    "https://api.telegram.org/bot\${TOKEN}/sendMessage"
EOF
)
echo "$LINK_RESP" >> "$LOG"
if echo "$LINK_RESP" | grep -q '"ok":true'; then
  log "TELEGRAM LINK SEND OK"
else
  log "TELEGRAM LINK SEND FAILED — response above"
fi

log "=== PIPELINE DONE ==="
