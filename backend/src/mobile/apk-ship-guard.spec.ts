import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * APK SHIP GUARD — the release APK is delivered as a single Telegram
 * document, and Telegram's Bot API hard-caps documents at 50 MB. The Aug
 * release grew to 94 MB (R8 off, uncompressed native libs, redundant
 * per-CPU .so variants) and became undeliverable. The build script must
 * enforce every shrink lever and verify the result before shipping.
 */

const ROOT = join(__dirname, "..", "..", "..");
const build = readFileSync(join(ROOT, "scripts", "_build-apk.sh"), "utf8");

describe("APK ship guard (scripts/_build-apk.sh)", () => {
  it("enables R8 minification for release builds (template property)", () => {
    expect(build).toMatch(/enableMinifyInReleaseBuilds=true/);
  });

  it("enables resource shrinking alongside R8", () => {
    expect(build).toMatch(/enableShrinkResourcesInReleaseBuilds=true/);
  });

  it("keeps llama.rn native classes R8-safe", () => {
    expect(build).toMatch(/-keep class com\.rnllama/);
  });

  it("keeps whisper.rn native classes R8-safe (the library ships no rules)", () => {
    expect(build).toMatch(/-keep class com\.rnwhisper/);
  });

  it("compresses native libs instead of storing them page-aligned", () => {
    // expo.useLegacyPackaging=true → extractNativeLibs=true → .so deflate in the APK.
    expect(build).toMatch(/useLegacyPackaging=true/);
  });

  it("excludes whisper.rn per-CPU .so variants (generic lib runs everywhere)", () => {
    for (const lib of ["librnwhisper_v8.so", "librnwhisper_v8fp16_va_2.so"]) {
      expect(build).toContain(lib);
    }
  });

  it("excludes unused Hexagon DSP delegate libs (noQualcomm DSP path)", () => {
    expect(build).toMatch(/libggml-htp/);
  });

  it("dedupes libc++_shared.so across native libs", () => {
    expect(build).toContain('pickFirsts += ["**/libc++_shared.so"]');
  });

  it("hard-verifies the built APK against the Telegram 50 MB cap", () => {
    expect(build).toMatch(/MAX_APK_MB/);
    expect(build).toMatch(/apk-shape-guard|BUILD EXCEEDS/);
  });
});
