# Matriq — Student Web App (iPhone users)

## Why it exists

The Android APK is distributed directly, but iPhone users can't install it —
Apple requires the $99/yr Developer Program + TestFlight, and until that's
live the App Store is closed to us. The web build gives **every iPhone user
the full Matriq app in the browser today**: registration, verification, dues,
Vault, tools, notifications, and the AI companion. It's the same codebase
(`mobile/`, react-native-web) — one app, three targets (Android APK, iOS
build, web).

## Current state

- The app is already web-capable: `react-native-web` is installed, `app.json`
  has a `web` block (`bundler: metro`, `output: "single"`), and the storage
  wrapper (`utils/storage.ts`) falls back to `localStorage` on web so auth,
  the passcode, chat history, and offline-AI config all persist in the browser.
- `npm run web:export` produces a static `mobile/dist` (verified green —
  `index.html` + one JS bundle, ~2.9 MB).
- The AI chat on web: online streaming answers, OCR (server path), file
  imports (server extraction for PDF/DOCX, direct read for txt), voice notes
  (server transcription) — all already wired and platform-guarded.

## Deploy (on the VM)

```bash
cd mobile && npm run web:export          # → mobile/dist
sudo mkdir -p /srv/matriq-web
sudo rsync -a --delete dist/ /srv/matriq-web/
# Caddy already serves app.matriq.com.ng → /srv/matriq-web (SPA fallback).
# Add https://app.matriq.com.ng to the backend's CORS_ORIGIN in .env, then:
docker compose up -d caddy backend
```

DNS: `app` A record → VM IP (DNS-only, like `api`), so Caddy auto-issues the
Let's Encrypt cert via HTTP-01.

## Giving iPhone users the offline AI too

The native offline engine (`llama.rn` / `whisper.rn`) can't run in a browser.
The web build uses a different engine with the **same product pattern** —
download a small model once, then answer with no internet:

| Capability | Native (Android) | Web (iPhone) | Plan |
|---|---|---|---|
| Offline chat LLM | llama.rn (GGUF) | **transformers.js** (WASM/WebGPU, ~same download-once UX) | Add a web branch to `OfflineAiContext` that loads a small Qwen/SmolLM ONNX model from Hugging Face into IndexedDB and runs `pipeline("text-generation")` — same `ask()` surface, same chat screen |
| Offline image reading | ML Kit OCR (bundled) | tesseract.js (WASM, ~4 MB) | Wire `offline/ocr.ts` web branch to tesseract.js with the `eng` traineddata fetched once |
| Offline voice notes | whisper.rn | Web Speech API (Safari's built-in, offline-capable for short notes) | Web branch of `offline/whisper.ts` using `webkitSpeechRecognition` with `continuous: false` |
| Offline storage | SecureStore / FileSystem | localStorage + IndexedDB | Already done (`utils/storage.ts`) |

**Honest limit:** transformers.js on a phone browser is slower than native
llama.cpp and needs WebGPU or a recent phone for the larger models. A 0.5B
Qwen ONNX model answers simple questions acceptably offline on modern iPhones
(Safari 18+ has WebGPU); the tiny model covers low-end devices. This is a
follow-up build, not a blocker for shipping the web app itself — the cloud AI
already works in the browser today.
