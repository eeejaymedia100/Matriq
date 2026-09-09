import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * PRE-LAUNCH PRIVACY (owner's rule): the app is invite-only until launch.
 * The public waitlist site builds anticipation — it must never hand out the
 * application. The app reaches students through the Telegram community, not
 * through matriq.com.ng.
 *
 * Locked here so it can only be reversed deliberately (with the owner's
 * sign-off), never by accident via a stray edit, script, or `git checkout`:
 *   1. no download page / APK / update manifest exists in the web root
 *   2. no public-facing file links or refers to any of them
 *   3. no release script ships artifacts into the public web root
 */

const ROOT = join(__dirname, "..", "..", "..");
const WAITLIST = join(ROOT, "waitlist");

const FORBIDDEN_FILES = [
  "download.html",
  "matriq.apk",
  "app-version.json",
  join("download", "matriq.apk"),
];

const LEAK_PATTERN =
  /download\.html|download\/matriq\.apk|app-version\.json|downloadUrl|matriq\.apk/i;

describe("waitlist site: no public download surface", () => {
  it.each(FORBIDDEN_FILES)("does not track or keep %s", (rel) => {
    expect(existsSync(join(WAITLIST, rel))).toBe(false);
  });

  it.each(["index.html", "privacy.html", "terms.html"])(
    "%s has no download references",
    (page) => {
      const html = readFileSync(join(WAITLIST, page), "utf8");
      const hits = html.match(new RegExp(LEAK_PATTERN, "gi")) ?? [];
      expect(hits).toEqual([]);
    },
  );

  it.each(["llms.txt", "robots.txt", "sitemap.xml"])(
    "%s has no download references",
    (asset) => {
      const text = readFileSync(join(WAITLIST, asset), "utf8");
      const hits = text.match(new RegExp(LEAK_PATTERN, "gi")) ?? [];
      expect(hits).toEqual([]);
    },
  );

  it.each(["index.html", "index.css", "app.js"])(
    "telegram-miniapp/%s has no download references",
    (asset) => {
      const p = join(WAITLIST, "telegram-miniapp", asset);
      if (!existsSync(p)) return; // miniapp may not ship every asset
      const hits = (readFileSync(p, "utf8").match(new RegExp(LEAK_PATTERN, "gi")) ?? []);
      expect(hits).toEqual([]);
    },
  );

  it.each(["_build-apk.sh", "_send-apk-telegram.sh", "_send-apk-chunks.sh"]) (
    "delivery script %s never ships artifacts into the public web root",
    (script) => {
      const src = readFileSync(join(ROOT, "scripts", script), "utf8");
      // Distribution is Telegram-only pre-launch: no script may target the
      // public web root or serve the APK over HTTP.
      expect(src).not.toMatch(/waitlist\/(download\/)?matriq\.apk|waitlist\/app-version\.json/);
      expect(src).not.toMatch(/scp .*\bAPK\b .*matriq:(~\S*)?\/matriq/);
    },
  );
});
