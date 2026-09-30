#!/usr/bin/env bash
# Matriq — publish a JS-only OTA update (expo-updates, no APK, no rebuild).
#
# This is the DEFAULT release path now. A rebuild + new APK is only needed
# when native code or native config changes (new native module, SDK bump,
# app.json plugin/permission change, runtime version change).
#
# What it does:
#   1. Reads the runtime version that the installed native build expects
#      (policy "appVersion" → the `version` in mobile/app.json).
#   2. Runs `npx expo export --platform android` (Hermes bytecode + assets).
#   3. Sanity-checks the export (metadata + bundle exist).
#   4. Rsyncs the export into ota/<runtimeVersion>/android/ on the server
#      (the repo's ./ota dir is mounted into both backend and Caddy).
#   5. Prints a verification curl.
#
# Usage: bash scripts/_publish-ota.sh "what changed"
set -euo pipefail

ROOT=/home/akpevwejulius1/matriq
cd "$ROOT/mobile"

NOTE="${1:-JS-only update}"

RUNTIME_VERSION=$(node -p "require('./app.json').expo.version")
echo "=== publishing OTA update for runtime version ${RUNTIME_VERSION} ==="
echo "    note: ${NOTE}"

# The export must match the native runtime — refuse to publish a JS bundle
# against a runtime the shipped binaries aren't running (the app would ignore
# it anyway; a mismatch here means someone changed app.json version without
# cutting a new native build).
CURRENT_NATIVE=$(node -p "require('./app.json').expo.android.versionCode")
echo "    native build: versionCode ${CURRENT_NATIVE} (runtime ${RUNTIME_VERSION})"

EXPORT_DIR="$ROOT/mobile/dist"
rm -rf "$EXPORT_DIR"

echo "=== expo export (android) ==="
npx expo export --platform android > /tmp/ota-export.log 2>&1 || {
  echo "EXPORT FAILED — tail:"; tail -20 /tmp/ota-export.log; exit 1;
}

METADATA="$EXPORT_DIR/metadata.json"
# expo export names the entry bundle `index-<hash>.hbc` (older SDKs used
# `entry-`); match any Hermes bundle the export produced.
BUNDLE="$EXPORT_DIR/_expo/static/js/android/*.hbc"
if [ ! -f "$METADATA" ] || ! ls $BUNDLE >/dev/null 2>&1; then
  echo "export incomplete (metadata.json or .hbc missing) — aborting"; exit 1
fi

# Guard: the export's runtime version is embedded in the bundle filename by
# expo export; metadata.json carries fileMetadata[android].bundle.
BUNDLE_NAME=$(node -p "require('$METADATA').fileMetadata.android.bundle")
if [ -z "$BUNDLE_NAME" ]; then
  echo "metadata.json has no android bundle entry — aborting"; exit 1
fi

echo "=== bundle: $BUNDLE_NAME ($(du -h "$EXPORT_DIR/$BUNDLE_NAME" 2>/dev/null | cut -f1)) ==="

TARGET_ROOT="$ROOT/ota"

# Publish for EVERY runtime version installed devices may request: the
# app.json version (what the next native build will request) plus every
# runtime already published in ./ota (what shipped phones request — e.g.
# phones on native 2.2.0 keep asking for 2.2.0 even after app.json moves
# to 2.2.1). When no native code changed between versions, one JS bundle
# correctly serves all of them.
RUNTIMES=$( (
  find "$TARGET_ROOT" -mindepth 1 -maxdepth 1 -type d -printf '%f\n' 2>/dev/null
  echo "$RUNTIME_VERSION"
) | sort -u)
echo "=== publishing for runtime versions: $(echo $RUNTIMES | tr '\n' ' ') ==="

# Publish atomically enough: build a temp copy then swap the directory, so a
# reader never sees a half-copied bundle (a 204/old bundle is safe; a torn
# one would be re-downloaded anyway thanks to hash verification, but let's
# not rely on that). cp/mv instead of rsync — rsync isn't on every box.
for RV in $RUNTIMES; do
  TARGET_DIR="$TARGET_ROOT/$RV/android"
  TMP_DIR="$TARGET_DIR.tmp"
  rm -rf "$TMP_DIR" "$TARGET_DIR"
  mkdir -p "$TMP_DIR"
  cp -a "$EXPORT_DIR/." "$TMP_DIR/"

  # Verify the copy BEFORE it goes live — a truncated or misplaced publish
  # must abort here, not ship a broken manifest to every installed device.
  if [ ! -s "$TMP_DIR/metadata.json" ] || ! ls "$TMP_DIR/$BUNDLE_NAME" >/dev/null 2>&1; then
    echo "publish verification failed — metadata.json or bundle missing/wrong size in $TMP_DIR" >&2
    ls -laR "$TMP_DIR" | head -20 >&2
    exit 1
  fi
  mv "$TMP_DIR" "$TARGET_DIR"

  # Keep the newest export dir timestamp fresh so `stat.birthtime` (used as
  # the manifest createdAt) reflects this publish.
  touch "$TARGET_DIR/metadata.json"
  echo "=== published to $TARGET_DIR ==="
done

ls -la "$TARGET_ROOT/$RUNTIME_VERSION/android" | head -5
echo
# ── Sync to server + verify live ───────────────────────────────────
# ~/matriq/ota is a bind mount into the backend + caddy containers. NEVER
# `rm -rf` the directory itself — that swaps the inode out from under the
# running containers, which keep the old (now empty) mount and serve 204
# until someone force-recreates them. Delete only the runtime SUBdirs and
# extract fresh content in place; the mount root inode stays intact.
echo "=== sync to server ==="
RV_PATHS=""
for RV in $RUNTIMES; do RV_PATHS="$RV_PATHS ~/matriq/ota/$RV"; done
ssh matriq "rm -rf $RV_PATHS"
tar -C "$TARGET_ROOT" -czf - . | ssh matriq 'tar -C ~/matriq/ota -xzf -'

echo "=== verify live manifest per runtime ==="
FAIL=0
for RV in $RUNTIMES; do
  CODE=$(curl -s -o /dev/null -w '%{http_code}' \
    -H 'expo-platform: android' \
    -H "expo-runtime-version: $RV" \
    -H 'expo-protocol-version: 1' \
    https://matriq.com.ng/api/updates/manifest)
  echo "  runtime $RV → manifest HTTP $CODE"
  [ "$CODE" = "200" ] || FAIL=1
done
if [ "$FAIL" != "0" ]; then
  echo "VERIFICATION FAILED — a runtime is not serving 200; devices stay on their current (working) bundle." >&2
  exit 1
fi
echo "=== OTA update live — devices pick it up on next launch/foreground check ==="
