#!/usr/bin/env bash
# Matriq — send the APK through Telegram as TWO split parts.
#
# Why: the current APK is ~94 MB (native libs stored uncompressed), far over
# Telegram's 50 MB bot-document cap and heavy enough that mobile downloads
# die mid-transfer. Zip compression barely helps (~45 MB) and Android has
# native ZIP extraction anyway, so we split the ZIP into two parts and let
# the phone join them: part 1 carries the head of the archive, part 2 the
# rest. The bot token stays on the matriq server — the chunks are uploaded
# there and sent with the server's copy of the token.
#
# Usage:   bash scripts/_send-apk-chunks.sh [apk-path] [chat-id]
# Default: newest file in mobile/android/app/build/outputs/apk/release,
#          chat 6911908487 (the owner).
#
# On the phone: open Telegram → save BOTH files to the same folder →
#   cat matriq.apk.part00 matriq.apk.part01 > matriq.zip
# (Termux or any file-manager "join/split" tool) → extract matriq.apk →
# install. The joined zip's sha256 is printed in the instructions.
#
# NOTE: since the public download page was removed (pre-launch privacy), this
# split flow is the FALLBACK. The primary delivery is a single unmodified APK
# via scripts/_send-apk-telegram.sh, which only falls back to splitting when
# the file exceeds Telegram's 50 MB bot-document cap.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CHAT_ID="${2:-6911908487}"
RELEASE_DIR="$ROOT/mobile/android/app/build/outputs/apk/release"
SERVER=matriq

log() { echo "[chunks $(date '+%F %T')] $*"; }

# ── 1. Pick the APK ─────────────────────────────────────────────────
APK="${1:-$(ls -t "$RELEASE_DIR"/*.apk 2>/dev/null | head -1 || true)}"
if [ -z "$APK" ]; then
  log "no APK found in $RELEASE_DIR — build one first (scripts/_build-apk.sh)"
  exit 1
fi
log "APK: $APK ($(du -h "$APK" | cut -f1))"

# ── 2. Zip it (deflate; APK entry stays 'matriq.apk' for extraction) ─
ZIP=/tmp/matriq-chunks/matriq.zip
rm -rf /tmp/matriq-chunks && mkdir -p /tmp/matriq-chunks
python3 - "$APK" "$ZIP" <<'PY'
import sys, zipfile, os
apk, out = sys.argv[1], sys.argv[2]
with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED, compresslevel=9) as z:
    z.write(apk, "matriq.apk")
print("zip: %.1f MB" % (os.path.getsize(out) / 1048576))
PY

# ── 3. Split into 2 parts + checksum ────────────────────────────────
# 25 MB per part: two parts cover a ~50 MB zip (the practical ceiling),
# each far under Telegram's 50 MB bot cap and reliable on mobile data.
SPLIT_PREFIX=/tmp/matriq-chunks/matriq.apk.part
split -b 25M -d -a 2 "$ZIP" "${SPLIT_PREFIX}"   # → matriq.apk.part00, matriq.apk.part01
PARTS=("${SPLIT_PREFIX}00" "${SPLIT_PREFIX}01")
if [ ! -f "${PARTS[0]}" ] || [ ! -f "${PARTS[1]}" ]; then
  log "expected exactly 2 parts — aborting"
  exit 1
fi
ZIP_SHA=$(sha256sum "$ZIP" | cut -d' ' -f1)
log "zip sha256: $ZIP_SHA"
for p in "${PARTS[@]}"; do
  log "  $(basename "$p"): $(du -h "$p" | cut -f1)"
done

# ── 4. Upload chunks + instructions from the server (token stays there) ─
scp -o BatchMode=yes "${PARTS[@]}" "$SERVER:/tmp/" > /dev/null

ssh -o BatchMode=yes "$SERVER" bash -s "$CHAT_ID" "$ZIP_SHA" <<'REMOTE'
set -euo pipefail
CHAT="$1"; SHA="$2"
TOKEN=$(grep -E "^TELEGRAM_BOT_TOKEN=" ~/.hermes/.env | cut -d= -f2- | tr -d "\r")

send_doc() {
  curl -s -F chat_id="$CHAT" \
       -F "caption=$2" \
       -F "document=@$1" \
       "https://api.telegram.org/bot${TOKEN}/sendDocument"
}
ok() { echo "$1" | grep -q '"ok":true'; }

R1=$(send_doc /tmp/matriq.apk.part00 \
  "📦 Matriq APK — Part 1 of 2 (the main file). Save this AND Part 2 to the same folder before joining.")
ok "$R1" || { echo "$R1"; exit 1; }
echo "part 1 sent"

R2=$(send_doc /tmp/matriq.apk.part01 \
  "📦 Matriq APK — Part 2 of 2 (features + updates, tail of the archive).")
ok "$R2" || { echo "$R2"; exit 1; }
echo "part 2 sent"

INSTR=$(cat <<MSG
🛠 <b>How to join and install</b>

1. Save <b>both parts</b> to the same folder (Telegram → ⋮ → Save to downloads).
2. Open Termux (or any file manager with a "join/split" tool) and run:
   cat matriq.apk.part00 matriq.apk.part01 &gt; matriq.zip
3. Extract matriq.zip — you get matriq.apk.
4. Tap the APK → allow "install unknown apps" → install.

✅ Verify before installing (optional): the joined zip's sha256 must be
$SHA

Prefer zero steps? The browser link returns 410 on purpose — Matriq rolls out
through this Telegram community; the public download page opens at launch.
MSG
)
R3=$(curl -s -F chat_id="$CHAT" \
       -F "text=$INSTR" \
       -F parse_mode=HTML \
       "https://api.telegram.org/bot${TOKEN}/sendMessage")
ok "$R3" || { echo "$R3"; exit 1; }
echo "instructions sent"

rm -f /tmp/matriq.apk.part00 /tmp/matriq.apk.part01
REMOTE

rm -rf /tmp/matriq-chunks
log "DONE — 2 chunks + join instructions delivered"
