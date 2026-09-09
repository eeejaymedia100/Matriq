#!/usr/bin/env bash
# Matriq — release APK build (arm64-only, single ABI).
# The release version is single-sourced from mobile/app.json:
#   expo.version            -> versionName
#   expo.android.versionCode -> versionCode
# To cut a release: bump both values in app.json, run this, then deliver via
# scripts/_send-apk-telegram.sh (single document) — no public download.
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

# Trim the ML Kit OCR module to Latin-only (see scripts/_patch-mlkit.sh).
# Runs again here defensively in case postinstall was skipped.
bash ../scripts/_patch-mlkit.sh

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

# llama.rn native classes must survive minification — R8 is ON now (see
# gradle.properties below), and both native bridges reach their JNI side
# through reflection. whisper.rn ships NO consumer rules at all, so its keep
# is mandatory or the app crashes at runtime.
grep -q 'com.rnllama' android/app/proguard-rules.pro 2>/dev/null || \
  printf '\n# llama.rn\n-keep class com.rnllama.** { *; }\n' >> android/app/proguard-rules.pro
grep -q 'com.rnwhisper' android/app/proguard-rules.pro 2>/dev/null || \
  printf '\n# whisper.rn (ships no consumer rules)\n-keep class com.rnwhisper.** { *; }\n-keepclassmembers class com.rnwhisper.** { *; }\n' >> android/app/proguard-rules.pro

# ── Shrink levers for a Telegram-shippable APK (hard cap: 50 MB) ────────
# Injected into android/app/build.gradle after every prebuild (prebuild
# regenerates it, so this must be idempotent):
#   1. llama.rn per-CPU .so variants — the generic librnllama.so +
#      librnllama_jni.so run on every arm64 device; the 12 variants are bloat.
#   2. whisper.rn per-CPU variants — same deal with librnwhisper.so.
#   3. Hexagon DSP delegates (libggml-htp*) — Qualcomm-only acceleration
#      llama.rn ships; we run the generic CPU path.
#   4. pickFirst libc++_shared.so — Facebook codecs ship a duplicate.
python3 - <<'PY'
import pathlib

p = pathlib.Path('android/app/build.gradle')
s = p.read_text()
marker = "useLegacyPackaging enableLegacyPackaging.toBoolean()"
inject = ""

if "librnllama_v8.so" not in s:
    inject += '''        // llama.rn: drop per-CPU variants; the generic fallback runs everywhere.
        excludes += [
            "**/librnllama_v8.so",
            "**/librnllama_v8_2.so",
            "**/librnllama_v8_2_dotprod.so",
            "**/librnllama_v8_2_dotprod_i8mm.so",
            "**/librnllama_v8_2_dotprod_i8mm_hexagon_opencl.so",
            "**/librnllama_v8_2_i8mm.so",
            "**/librnllama_jni_v8.so",
            "**/librnllama_jni_v8_2.so",
            "**/librnllama_jni_v8_2_dotprod.so",
            "**/librnllama_jni_v8_2_dotprod_i8mm.so",
            "**/librnllama_jni_v8_2_dotprod_i8mm_hexagon_opencl.so",
            "**/librnllama_jni_v8_2_i8mm.so",
        ]
'''
if "librnwhisper_v8.so" not in s:
    inject += '''        // whisper.rn: drop per-CPU variants; the generic fallback runs everywhere.
        excludes += [
            "**/librnwhisper_v8.so",
            "**/librnwhisper_v8fp16_va_2.so",
        ]
        // llama.rn Hexagon DSP delegates (Qualcomm-only, unused).
        excludes += ["**/libggml-htp*.so"]
        // Facebook codecs ship a second libc++_shared.so — keep one.
        pickFirsts += ["**/libc++_shared.so"]
'''
if inject and marker in s:
    s = s.replace(marker, marker + "\n" + inject, 1)
    p.write_text(s)
    print("injected packaging excludes")
elif not marker:
    print("marker not found in build.gradle — check template")
else:
    print("packaging excludes already present")
PY

# ── R8 + compressed native libs via the gradle.properties flags the Expo
#    template reads (prebuild regenerates build.gradle from these, so this
#    is the durable lever — string-patching build.gradle is not):
#      expo.useLegacyPackaging=true                      → .so DEFLATE-compressed in the APK
#      android.enableMinifyInReleaseBuilds=true          → R8 on
#      android.enableShrinkResourcesInReleaseBuilds=true → strip unused resources
sed -i 's|^expo.useLegacyPackaging=.*|expo.useLegacyPackaging=true|' android/gradle.properties
if grep -q '^android.enableMinifyInReleaseBuilds=' android/gradle.properties; then
  sed -i 's|^android.enableMinifyInReleaseBuilds=.*|android.enableMinifyInReleaseBuilds=true|' android/gradle.properties
else
  printf '\nandroid.enableMinifyInReleaseBuilds=true\n' >> android/gradle.properties
fi
if grep -q '^android.enableShrinkResourcesInReleaseBuilds=' android/gradle.properties; then
  sed -i 's|^android.enableShrinkResourcesInReleaseBuilds=.*|android.enableShrinkResourcesInReleaseBuilds=true|' android/gradle.properties
else
  printf 'android.enableShrinkResourcesInReleaseBuilds=true\n' >> android/gradle.properties
fi

# Prebuild resets gradle.properties to build ALL 4 ABIs with a big heap
# (OOM risk on this box) — pin back to the single-ABI, low-memory config that
# the previous successful builds used.
sed -i 's|^reactNativeArchitectures=.*|reactNativeArchitectures=arm64-v8a|' android/gradle.properties
sed -i 's|^org.gradle.jvmargs=.*|org.gradle.jvmargs=-Xmx1536m -XX:MaxMetaspaceSize=512m|' android/gradle.properties
sed -i 's|^org.gradle.parallel=.*|org.gradle.parallel=false|' android/gradle.properties
grep -E 'useLegacyPackaging|enableMinifyInReleaseBuilds|enableShrinkResources|reactNativeArchitectures|jvmargs|parallel' android/gradle.properties

# Restore the SDK location gradle needs.
echo "sdk.dir=$ANDROID_HOME" > android/local.properties

echo "=== version in gradle ==="
grep -E 'versionCode|versionName' android/app/build.gradle | head -2

echo "=== gradle clean assembleRelease ==="
cd android
./gradlew clean assembleRelease > /tmp/gradle.log 2>&1
BUILD_EXIT=$?
echo "BUILD_EXIT=$BUILD_EXIT"
tail -3 /tmp/gradle.log
if [ "$BUILD_EXIT" -ne 0 ]; then
  echo "GRADLE BUILD FAILED — see /tmp/gradle.log"; exit 1
fi

# ── Ship gate: verify the APK actually fits the delivery channel ──────
# Telegram's Bot API hard-caps documents at 50 MB; the build must FAIL, not
# warn, if the artifact cannot be delivered as a single Telegram file.
MAX_APK_MB=49
APK_PATH=$(ls -t app/build/outputs/apk/release/*.apk 2>/dev/null | head -1)
if [ -z "$APK_PATH" ]; then
  echo "no APK produced despite BUILD SUCCESSFUL — aborting"; exit 1
fi
SIZE_MB=$(( $(stat -c%s "$APK_PATH") / 1048576 ))
echo "APK: $APK_PATH = ${SIZE_MB} MB (cap ${MAX_APK_MB} MB)"
if [ "$SIZE_MB" -gt "$MAX_APK_MB" ]; then
  echo "apk-shape-guard: BUILD EXCEEDS ${MAX_APK_MB} MB — NOT shippable via Telegram"
  echo "  biggest entries:"
  unzip -l "$APK_PATH" | sort -rn | head -15
  exit 1
fi
echo "apk-shape-guard: OK — ${SIZE_MB} MB fits the Telegram document cap"
