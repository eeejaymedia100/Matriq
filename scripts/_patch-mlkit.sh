#!/usr/bin/env bash
# Matriq — trim @react-native-ml-kit/text-recognition to Latin-only.
#
# The upstream module bundles all five ML Kit script models (Latin, Chinese,
# Devanagari, Japanese, Korean — ~4 MB each). We only recognize English text,
# so the four non-Latin models are pure APK bloat that would push the build
# past Telegram's 50 MB attachment limit. This patch:
#   1. Removes the four non-Latin gradle dependencies (~16 MB saved)
#   2. Strips the Java imports + switch cases that referenced those classes
#      (the code would otherwise fail to compile without the dependencies)
#
# node_modules/ is gitignored, so this must run on every fresh install:
# it's wired into package.json "postinstall" and invoked by the APK build.
set -euo pipefail

MODULE="mobile/node_modules/@react-native-ml-kit/text-recognition"
GRADLE="$MODULE/android/build.gradle"
JAVA="$MODULE/android/src/main/java/com/rnmlkit/textrecognition/TextRecognitionModule.java"

if [ ! -f "$GRADLE" ] || [ ! -f "$JAVA" ]; then
  echo "mlkit module not found — skipping patch (nothing to trim)"
  exit 0
fi

# ── 1. Gradle: keep only the Latin dependency ──────────────────────────────
python3 - "$GRADLE" <<'PY'
import sys, re
p = sys.argv[1]
s = open(p).read()
s = re.sub(r"\n\s*// To recognize (Chinese|Devanagari|Japanese|Korean) script\n\s*implementation 'com\.google\.mlkit:text-recognition-(chinese|devanagari|japanese|korean):[^']*'", "", s)
open(p, "w").write(s)
print("gradle patched" if "text-recognition-chinese" not in s else "gradle UNCHANGED")
PY

# ── 2. Java: drop the four script-class imports ────────────────────────────
python3 - "$JAVA" <<'PY'
import sys
p = sys.argv[1]
s = open(p).read()

for imp in [
    "import com.google.mlkit.vision.text.chinese.ChineseTextRecognizerOptions;\n",
    "import com.google.mlkit.vision.text.devanagari.DevanagariTextRecognizerOptions;\n",
    "import com.google.mlkit.vision.text.japanese.JapaneseTextRecognizerOptions;\n",
    "import com.google.mlkit.vision.text.korean.KoreanTextRecognizerOptions;\n",
]:
    s = s.replace(imp, "")

# Strip the switch cases that referenced the removed classes, leaving the
# method a Latin-only (default options) passthrough.
import re
s = re.sub(
    r"    @NonNull\n    TextRecognizerOptionsInterface getScriptTextRecognizerOptions\(@Nullable String script\) \{[\s\S]*?^    \}\n\n",
    "",
    s,
    flags=re.MULTILINE,
)
# recognize(): drop the script lookup, always use default (Latin) options
s = s.replace(
    "            TextRecognizerOptionsInterface options = getScriptTextRecognizerOptions(script);\n",
    ""
)
s = s.replace(
    "    public void recognize(String url, String script, final Promise promise) {",
    "    public void recognize(String url, final Promise promise) {"
)
s = s.replace(
    "            TextRecognizer recognizer = TextRecognition.getClient(options);",
    "            TextRecognizer recognizer = TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS);"
)

open(p, "w").write(s)
changed = "ChineseTextRecognizerOptions" not in s and "getScriptTextRecognizerOptions" not in s
print("java patched" if changed else "java UNCHANGED (already patched?)")
PY

echo "mlkit trimmed to Latin-only"
