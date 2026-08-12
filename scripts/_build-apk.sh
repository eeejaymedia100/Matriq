#!/usr/bin/env bash
# Release APK build for Matriq mobile (v0.3.0, build 4)
set -e
cd /home/akpevwejulius1/matriq/mobile

export ANDROID_HOME=/home/akpevwejulius1/Android/Sdk
export ANDROID_SDK_ROOT=$ANDROID_HOME

# Prebuild wipes local.properties (the Android SDK pointer) — write it back.
SDK_DIR=$(ls -d ${ANDROID_HOME} 2>/dev/null || true)
if [ -z "$SDK_DIR" ]; then
  echo "Android SDK not found at $ANDROID_HOME"; exit 1;
fi

echo "=== prebuild ==="
npx expo prebuild --platform android --no-install > /tmp/prebuild.log 2>&1 || {
  echo "PREBUILD FAILED"; tail -8 /tmp/prebuild.log; exit 1;
}

# Prebuild regenerates build.gradle with versionName from app.json but resets
# versionCode to 1 — pin it back to 4.
sed -i 's/versionCode [0-9]*/versionCode 4/' android/app/build.gradle

# Restore the SDK location gradle needs.
echo "sdk.dir=$ANDROID_HOME" > android/local.properties
cat android/local.properties

# Prebuild also resets gradle.properties to build ALL 4 ABIs with a big heap
# (OOM risk on this box) — pin back to the single-ABI, low-memory config that
# the previous successful builds used.
sed -i 's|^reactNativeArchitectures=.*|reactNativeArchitectures=arm64-v8a|' android/gradle.properties
sed -i 's|^org.gradle.jvmargs=.*|org.gradle.jvmargs=-Xmx1536m -XX:MaxMetaspaceSize=512m|' android/gradle.properties
sed -i 's|^org.gradle.parallel=.*|org.gradle.parallel=false|' android/gradle.properties
grep -E 'reactNativeArchitectures|jvmargs|parallel' android/gradle.properties

echo "=== version in gradle ==="
grep -E 'versionCode|versionName' android/app/build.gradle | head -2

echo "=== gradle assembleRelease ==="
cd android
./gradlew assembleRelease > /tmp/gradle.log 2>&1
echo "BUILD_EXIT=$?"
tail -3 /tmp/gradle.log
