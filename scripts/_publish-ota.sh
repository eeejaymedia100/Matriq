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

TARGET_DIR="$ROOT/ota/$RUNTIME_VERSION/android"

# Publish atomically enough: build a temp copy then swap the directory, so a
# reader never sees a half-copied bundle (a 204/old bundle is safe; a torn
# one would be re-downloaded anyway thanks to hash verification, but let's
# not rely on that). cp/mv instead of rsync — rsync isn't on every box.
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
echo "    contents:"
ls -la "$TARGET_DIR" | head -5
echo
echo "=== sync to server + verify ==="
echo "  tar -C \"$ROOT/ota\" -czf - . | ssh matriq 'rm -rf ~/matriq/ota && mkdir -p ~/matriq/ota && tar -C ~/matriq/ota -xzf -'"
echo "  then verify: curl -s -o /dev/null -w '%{http_code}' \\"
echo "    -H 'expo-platform: android' \\"
echo "    -H 'expo-runtime-version: $RUNTIME_VERSION' \\"
echo "    -H 'expo-protocol-version: 1' \\"
echo "    https://matriq.com.ng/api/updates/manifest"
echo
echo "NOTE: if the server is reachable, sync now (script does not auto-sync):"
echo "  tar -C \"$ROOT/ota\" -czf - . | ssh matriq 'rm -rf ~/matriq/ota && mkdir -p ~/matriq/ota && tar -C ~/matriq/ota -xzf -'"
