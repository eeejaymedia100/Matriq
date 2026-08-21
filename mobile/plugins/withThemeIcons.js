/**
 * Matriq — theme-aware adaptive launcher icons.
 *
 * Expo's app.json `android.adaptiveIcon` only supports one foreground +
 * background, but Android switches launcher icons with the system dark mode
 * via resource qualifiers. This plugin rewrites the prebuild-generated
 * adaptive icon XML to reference drawables and ships light + night variants:
 *
 *   res/drawable/           -> light  (purple M on white)
 *   res/drawable-night/     -> dark   (lime M on black)
 *   res/drawable/           -> monochrome (white M, Android 13 themed icons)
 *
 * Assets live in mobile/assets/adaptive/*.png and are copied into the res
 * tree during `expo prebuild`. The legacy mipmap icons generated from
 * app.json's `icon` stay untouched, so API < 26 launchers keep working.
 */
const { withDangerousMod } = require("@expo/config-plugins");
const fs = require("fs");
const path = require("path");

const ADAPTIVE_ICON_XML = `<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@drawable/ic_launcher_background"/>
    <foreground android:drawable="@drawable/ic_launcher_foreground"/>
    <monochrome android:drawable="@drawable/ic_launcher_monochrome"/>
</adaptive-icon>
`;

function copy(src, dest) {
  if (fs.existsSync(src)) fs.copyFileSync(src, dest);
}

module.exports = function withThemeIcons(config) {
  return withDangerousMod(config, [
    "android",
    async (config) => {
      const projectRoot = config.modRequest.projectRoot;
      const platformRoot = config.modRequest.platformProjectRoot;
      const res = path.join(platformRoot, "app", "src", "main", "res");
      const src = path.join(projectRoot, "assets", "adaptive");

      // 1. Point both adaptive icon XMLs (launcher + round) at our drawables.
      const v26 = path.join(res, "mipmap-anydpi-v26");
      for (const name of ["ic_launcher.xml", "ic_launcher_round.xml"]) {
        const p = path.join(v26, name);
        if (fs.existsSync(p)) fs.writeFileSync(p, ADAPTIVE_ICON_XML);
      }

      // 2. Light variants + monochrome (default resources).
      const drawable = path.join(res, "drawable");
      fs.mkdirSync(drawable, { recursive: true });
      copy(path.join(src, "foreground-light.png"), path.join(drawable, "ic_launcher_foreground.png"));
      copy(path.join(src, "background-light.png"), path.join(drawable, "ic_launcher_background.png"));
      copy(path.join(src, "monochrome.png"), path.join(drawable, "ic_launcher_monochrome.png"));

      // Prebuild's own background drawable would collide with our PNG name.
      const oldBg = path.join(drawable, "ic_launcher_background.xml");
      if (fs.existsSync(oldBg)) fs.unlinkSync(oldBg);

      // 3. Dark (night) variants — same resource names, night qualifier.
      const night = path.join(res, "drawable-night");
      fs.mkdirSync(night, { recursive: true });
      copy(path.join(src, "foreground-dark.png"), path.join(night, "ic_launcher_foreground.png"));
      copy(path.join(src, "background-dark.png"), path.join(night, "ic_launcher_background.png"));

      return config;
    },
  ]);
};
