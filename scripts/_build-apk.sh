#!/usr/bin/env bash
# Matriq — release APK build (arm64-only, single ABI).
# The release version is single-sourced from mobile/app.json:
#   expo.version            -> versionName
#   expo.android.versionCode -> versionCode
# To cut a release: bump both values in app.json, run this, then
# scripts/_finalize-apk.sh (which ships the APK + bumps the live manifest so
# installed apps self-update — no manual redownload).
set -e
cd /home/akpevwejulius1/matriq/mobile

export ANDROID_HOME=/home/akpevwejulius1/Android/Sdk
export ANDROID_SDK_ROOT=$ANDROID_HOME

VERSION_NAME=$(node -p "require('./app.json').expo.version")
VERSION_CODE=$(node -p "require('./app.json').expo.android.versionCode || 1")
echo "=== building ${VERSION_NAME} (versionCode ${VERSION_CODE}) ==="

# Prebuild wipes local.properties (the Android SDK pointer) — write it back.
SDK_DIR=$(ls -d ${ANDROID_HOME} 2>/dev/null || true)
if [ -z "$SDK_DIR" ]; then
  echo "Android SDK not found at $ANDROID_HOME"; exit 1;
fi

echo "=== prebuild ==="
npx expo prebuild --platform android --no-install > /tmp/prebuild.log 2>&1 || {
  echo "PREBUILD FAILED"; tail -8 /tmp/prebuild.log; exit 1;
}

# Prebuild regenerates build.gradle from app.json (so versionCode/versionName
# should already be right). Pin them defensively in case an older prebuild
# reset versionCode to 1.
sed -i "s/versionCode [0-9]*/versionCode ${VERSION_CODE}/" android/app/build.gradle
sed -i "s/versionName \".*\"/versionName \"${VERSION_NAME}\"/" android/app/build.gradle

# llama.rn ships its native libs via a postinstall download into node_modules;
# if they're missing, fetch them explicitly so gradle can autolink them.
if [ ! -d "node_modules/llama.rn/android/src/main/jniLibs/arm64-v8a" ]; then
  echo "=== llama.rn native artifacts missing — downloading ==="
  node ./node_modules/llama.rn/install/download-native-artifacts.js || {
    echo "llama.rn artifacts download failed"; exit 1;
  }
fi

# llama.rn native classes must survive minification if R8 is ever enabled
# (defensive — minify is off by default in the release build).
grep -q 'com.rnllama' android/app/proguard-rules.pro 2>/dev/null || \
  printf '\n# llama.rn\n-keep class com.rnllama.** { *; }\n' >> android/app/proguard-rules.pro

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
