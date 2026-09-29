# OTA Updates (expo-updates) — release guide

**The rule now:** JS-only changes never require an APK rebuild. They ship as
silent background updates that every installed app downloads by itself and
applies at its next cold start.

## When to rebuild vs publish

| Change | Path |
|---|---|
| Screens, styles, logic, pure-JS libs | **OTA** — `bash scripts/_publish-ota.sh "note"` |
| New native module / SDK bump | Rebuild APK (bump `versionCode` first) |
| `app.json` plugin/permission change | Rebuild APK (bump `versionCode` first) |
| `expo.version` bump | Rebuild APK (it defines the runtime version) |

Rule of thumb: if `expo prebuild` output would change, rebuild. Otherwise OTA.

## Publishing a JS-only update (the normal path)

```bash
bash scripts/_publish-ota.sh "Fix: notes search on small screens"
# then sync the export to the server:
rsync -az --delete ~/matriq/ota/ matriq:~/matriq/ota/
# verify (204 = no update / 200 = manifest served):
curl -s -o /dev/null -w '%{http_code}\n' \
  -H 'expo-platform: android' \
  -H 'expo-runtime-version: <app.json version>' \
  -H 'expo-protocol-version: 1' \
  https://matriq.com.ng/api/updates/manifest
```

What the app does with it: checks at launch, on every foreground, and every
30 minutes (the existing `UpdateOverlay` loop), downloads silently in the
background, and loads the new bundle at the next cold start. No prompt, no
interruption. If a download fails, the app keeps running its current update.

## How it works (architecture)

```
scripts/_publish-ota.sh
  └─ npx expo export --platform android     → mobile/dist/ (Hermes .hbc + assets + metadata.json)
  └─ rsync into ota/<runtimeVersion>/android/
       └─ rsync to matriq:~/matriq/ota/     → bind-mounted read-only into:
            ├─ backend  /srv/updates        → GET /v1/updates/manifest (protocol v1)
            └─ caddy    /srv/updates        → https://matriq.com.ng/updates/* (assets, immutable)
```

- The app's `updates.url` is `https://matriq.com.ng/api/updates/manifest`.
  Caddy strips `/api`, re-adds `/v1` (backend routes are `/v1`-prefixed and
  there is no global prefix), and proxies to the backend, which assembles the
  manifest from `metadata.json` + file hashes (stateless, no DB, no auth —
  it must answer before the user is authenticated).
- **Runtime isolation:** `expo.runtimeVersion` uses the `appVersion` policy
  (=`expo.version`). The manifest endpoint only serves updates matching the
  request's `expo-runtime-version` header, so a JS update can never reach a
  native binary it doesn't match. When you bump `expo.version` you MUST ship
  a new APK (the OTA stream for the old runtime version keeps the old
  binaries working until they update).
- **Integrity:** every asset URL carries a base64url SHA-256 hash that
  expo-updates verifies on download; a partial/corrupt bundle is discarded.
- **Rollback:** delete or move the `ota/<runtimeVersion>/android/` directory
  on the server → the next check gets 204 → devices stay on (or return to)
  the embedded bundle.

## The APK path (only when truly needed)

```bash
# 1. bump expo.version + android.versionCode in mobile/app.json
bash scripts/_build-apk.sh
bash scripts/_send-apk-telegram.sh   # or _release-and-ship.sh
```

## First-run status

- The v2.2.0 (versionCode 28) binary embeds expo-updates and points at the
  production manifest URL. Until the first OTA is published, the manifest
  returns 204 and the apps simply run their embedded bundle — safe no-op.
- `__DEV__` builds never check OTA (the dev client hot-reloads instead).
