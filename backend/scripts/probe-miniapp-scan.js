/** Reproduce the Mini App scan flow against PRODUCTION with a real image. */
const fs = require("fs");
const crypto = require("crypto");
const path = require("path");

const env = fs.readFileSync(path.resolve(__dirname, "..", ".env"), "utf8");
const get = (k) => (env.match(new RegExp(`^${k}="?([^"\r\n]+)"?`, "m")) || [])[1];
const token = get("TELEGRAM_BOT_TOKEN");

// Build valid Telegram initData (manual HMAC flow, no dependencies).
function buildInitData() {
  const authDate = Math.floor(Date.now() / 1000);
  const user = { id: 6911908487, first_name: "ScanProbe", username: "scanprobe", auth_date: authDate };
  const params = new URLSearchParams({
    auth_date: String(authDate),
    query_id: "AAA-test",
    user: JSON.stringify(user),
  });
  const dataCheckString = [...params.entries()].sort().map(([k, v]) => `${k}=${v}`).join("\n");
  const secret = crypto.createHmac("sha256", "WebAppData").update(token).digest();
  const hash = crypto.createHmac("sha256", secret).update(dataCheckString).digest("hex");
  params.set("hash", hash);
  return params.toString();
}

// A real photo with big black text, rasterized to a genuine PNG via the
// backend's own sharp (validates the server's magic-byte sniffing too —
// the old Buffer.from(svg) sent SVG text bytes, not a PNG).
const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="512" height="200"><rect width="100%" height="100%" fill="white"/><text x="20" y="120" font-family="DejaVu Sans" font-size="72" fill="black">HELLO MATRIQ 101</text></svg>';

(async () => {
  let png;
  try {
    png = await require("sharp")(Buffer.from(svg)).png().toBuffer();
  } catch (e) {
    console.error("sharp not available — run from backend/ with deps installed:", e.message);
    process.exit(1);
  }
  const initData = buildInitData();
  console.log("[1] miniapp/auth…");
  const authRes = await fetch("https://api.matriq.com.ng/v1/telegram/miniapp/auth", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ initData }),
  });
  const auth = await authRes.json().catch(() => ({}));
  console.log("    HTTP", authRes.status, JSON.stringify(auth).slice(0, 120));
  if (!auth.token) { console.error("NO SESSION — stopping"); return; }

  console.log("[2] miniapp/scan with a rendered-text PNG…");
  const form = new FormData();
  form.append("image", new Blob([png], { type: "image/png" }), "probe.png");
  const scanRes = await fetch("https://api.matriq.com.ng/v1/telegram/miniapp/scan", {
    method: "POST",
    headers: { Authorization: "Bearer " + auth.token },
    body: form,
  });
  const scan = await scanRes.json().catch(() => null);
  console.log("    HTTP", scanRes.status, JSON.stringify(scan).slice(0, 400));
  console.log(scanRes.status === 200 || scanRes.status === 201 ? "HTTP OK" : "HTTP FAIL");
  console.log(scan?.readable ? "SCAN WORKS ✅" : "SCAN BROKEN ❌");
})().catch((e) => { console.error("FAILED:", e); process.exit(1); });
