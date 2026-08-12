#!/usr/bin/env bash
# Release APK build for Matriq mobile (v0.3.0, build 4)
set -e
cd /home/akpevwejulius1/matriq/mobile

echo "=== prebuild ==="
npx expo prebuild --platform android --no-install > /tmp/prebuild.log 2>&1 || {
  echo "PREBUILD FAILED"; tail -8 /tmp/prebuild.log; exit 1;
}

# Prebuild regenerates build.gradle with versionName from app.json but resets
# versionCode to 1 — pin it back to 4.
sed -i 's/versionCode [0-9]*/versionCode 4/' android/app/build.gradle

echo "=== version in gradle ==="
grep -E 'versionCode|versionName' android/app/build.gradle | head -2

echo "=== gradle assembleRelease ==="
cd android
./gradlew assembleRelease > /tmp/gradle.log 2>&1
echo "BUILD_EXIT=$?"
tail -3 /tmp/gradle.log
