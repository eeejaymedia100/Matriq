#!/usr/bin/env bash
# Matriq — finalize a release APK: wait for the gradle build, ship it to
# matriq-server, bump the live update manifest, verify, and Telegram the result.
# Run on cliptonite-server (this box). Safe to re-run; idempotent.
#
# The version is read from the BUILT APK (aapt), so the manifest can never
# drift from what was actually compiled. Set RELEASE_NOTES below to change the
# update-message shown to students.
set -euo pipefail

LOG=/tmp/gradle.log
RELEASE_DIR=/home/akpevwejulius1/matriq/mobile/android/app/build/outputs/apk/release
REMOTE=matriq
MAX_WAIT_MIN=480

# ── Per-release copy (edit this line each release) ──────────────
RELEASE_NOTES="${RELEASE_NOTES:-Update available: in-app notification feed, study facts + quiz, real-time timetable updates, and design refinements.}"

log() { echo "[finalize $(date '+%F %T')] $*"; }

log "waiting for APK build to finish (polling $LOG)..."
waited=0
while ! grep -qE 'BUILD SUCCESSFUL|BUILD FAILED|GRADLE_DONE_EXIT=' "$LOG" 2>/dev/null; do
  sleep 120
  waited=$((waited + 2))
  log "waited ${waited} min"
  if [ "$waited" -ge "$MAX_WAIT_MIN" ]; then
    log "TIMED OUT after ${waited}min — build still not done"
    exit 1
  fi
done

if grep -q 'BUILD FAILED' "$LOG" || grep -qE 'GRADLE_DONE_EXIT=[1-9]' "$LOG"; then
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

# ── Read the real version from the APK (source of truth) ───────
AAPT=$(ls /home/akpevwejulius1/Android/Sdk/build-tools/*/aapt 2>/dev/null | sort -V | tail -1 || true)
if [ -z "$AAPT" ]; then
  log "aapt not found — cannot read versionCode from the APK"
  exit 1
fi
BADGING=$("$AAPT" dump badging "$APK" 2>/dev/null)
VERSION_CODE=$(echo "$BADGING" | grep -oP "versionCode='\K[0-9]+" | head -1)
VERSION_NAME=$(echo "$BADGING" | grep -oP "versionName='\K[^']+" | head -1)
if [ -z "$VERSION_CODE" ] || [ -z "$VERSION_NAME" ]; then
  log "could not parse versionCode/versionName from the APK"
  echo "$BADGING" | grep -E 'versionCode|versionName' || true
  exit 1
fi
log "shipping versionName=${VERSION_NAME} versionCode=${VERSION_CODE}"

log "scp APK -> $REMOTE"
scp -o BatchMode=yes "$APK" "$REMOTE:~/matriq/waitlist/matriq.apk"

log "writing manifest (local) + shipping"
# Generate the manifest on THIS box (node JSON-escapes the notes) and scp it —
# never pass free-text release notes through the ssh command line.
node -e '
  const m = {
    versionCode: Number(process.argv[1]),
    versionName: process.argv[2],
    url: "https://matriq.com.ng/download/matriq.apk",
    notes: process.argv[3],
    publishedAt: new Date().toISOString(),
  };
  process.stdout.write(JSON.stringify(m, null, 2) + "\n");
' "$VERSION_CODE" "$VERSION_NAME" "$RELEASE_NOTES" > /tmp/app-version.json
cat /tmp/app-version.json

scp -o BatchMode=yes /tmp/app-version.json "$REMOTE:~/matriq/waitlist/app-version.json"
ssh -o BatchMode=yes "$REMOTE" 'cd ~/matriq/waitlist && cp -f matriq.apk download/matriq.apk && echo "[finalize] manifest + downloads:" && cat app-version.json && ls -la matriq.apk download/matriq.apk'

log "verifying live URLs (non-fatal)"
curl -s -m 20 https://matriq.com.ng/app-version.json || true; echo
curl -sI -m 20 https://matriq.com.ng/download/matriq.apk | head -4 || true

log "sending Telegram (summary + APK)"
ssh -o BatchMode=yes "$REMOTE" "bash -s" -- "$VERSION_NAME" "$VERSION_CODE" <<'REMOTE'
set -euo pipefail
VERSION_NAME=$1
VERSION_CODE=$2
TOKEN=$(grep -E '^TELEGRAM_BOT_TOKEN=' ~/.hermes/.env | head -1 | cut -d= -f2-)
CHAT=$(grep -E '^TELEGRAM_HOME_CHANNEL=' ~/.hermes/.env | head -1 | cut -d= -f2-)
[ -z "$TOKEN" ] || [ -z "$CHAT" ] && { echo "missing telegram env"; exit 1; }
MSG="Matriq v${VERSION_NAME} (build ${VERSION_CODE}) is LIVE. In-app updates will deliver this automatically — open the app to get it, no redownload needed. Direct link: https://matriq.com.ng/download/matriq.apk"
curl -s -m 30 "https://api.telegram.org/bot${TOKEN}/sendMessage" \
  --data-urlencode "chat_id=${CHAT}" --data-urlencode "text=${MSG}" > /tmp/tg-msg.json
echo "msg resp: $(head -c 160 /tmp/tg-msg.json)"
curl -s -m 300 "https://api.telegram.org/bot${TOKEN}/sendDocument" \
  -F "chat_id=${CHAT}" -F "document=@$HOME/matriq/waitlist/matriq.apk" \
  -F "caption=Matriq v${VERSION_NAME} (build ${VERSION_CODE}) APK" > /tmp/tg-doc.json
echo "doc resp: $(head -c 160 /tmp/tg-doc.json)"
REMOTE

log "DONE"
