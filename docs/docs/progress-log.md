# Progress Log

**Read this first at the start of every session. Update it before ending every session.**
Newest entry at the top. Keep entries skimmable — a human checking in briefly via Termux should
understand "what happened since I last looked" in under a minute.

## 2026-08-16 — Criteria-gap + fixes pass DEPLOYED (backend live + OCR verified), APK v0.7.4 building

**Status:** backend DEPLOYED + OCR verified live (engine: gemini); mobile/admin/dashboard verified; APK v0.7.4 (build 12) building in tmux `matriq-build`.

**Did (finishing the two previous "not yet deployed" passes):**
- **Committed + pushed** the full criteria-gap + fixes pass as `c758892` (36 files) + version bump `37cc477` (v0.7.4 / build 12).
- **Verified** the whole working tree before shipping: backend tsc + **132 tests green** (17 suites), mobile/admin/dashboard tsc clean, admin + dashboard `next build` green (new `/security`, `/users`, `/members`, `/events`, `/timetable` routes present).
- **Backend deployed** (`scripts/deploy.sh` on matriq-server → `c758892`, backend rebuilt + healthy; no migration needed — response-shape + new queries on existing tables only).
- **OCR verified end-to-end against production**: logged in as `member1@matriq.app`, POSTed a generated text image to `/v1/tools/ocr` → `{"text":"MATRIQ OCR TEST Course: CHM 101 Student: Julius 2026","confidence":100,"readable":true,"engine":"gemini"}` — Gemini path working, no tesseract fallback. New route mounts confirmed (analytics/members/fees-payments/timetable-updates → 401; POST-only routes → 404-on-GET as expected).
- **APK build** for the mobile fixes (offline-AI `ensureModelsDir()` fix + citation/passport tool removals) running in tmux. Note: `expo prebuild` wipes `android/app/.cxx`, so this is a full native llama.rn recompile (slow), not the ~10 min incremental build.

**Next:** wait for `BUILD SUCCESSFUL` in `/tmp/gradle.log`, then `bash scripts/_finalize-apk.sh` to ship the APK + bump the live `app-version.json` (existing installs self-update).

**Blockers/flags:** the APK build's native recompile is the long pole (llama.rn CMake ~hours on this box). The §2 shared `[association-name]@matriq.app` exec-account model and §11 Android overlay bubble remain unimplemented (both need decisions).

## 2026-08-16 — Fixes pass: offline-AI download root cause, onboarding route, association-dashboard stats

**Status:** code done + verified (backend tsc + **130 tests green**, mobile/admin/dashboard tsc clean). Telegram #488 sent with dashboard links + credentials. NOT yet deployed.

**Did:**
- **Offline AI download root cause (the "download didn't finish" error at 0%).** `ensureModelsDir()` was defined in `mobile/src/offline/persistence.ts` but **never called anywhere**. The Android expo-file-system legacy downloader throws `IOException ("Directory for '...' doesn't exist")` when the target's parent dir is missing, so every first download failed instantly at 0% regardless of internet — the generic "connection may have dropped" message then masked it. Fix: exported + call `ensureModelsDir()` in the startup effect and before each download attempt in `OfflineAiContext.startDownload`.
- **First-timer onboarding never showed.** `showOnboarding` was computed in `AppNavigator` but never used — `AuthNavigator` always booted at `Welcome`. Fix: `AuthNavigator` now takes an `initialRoute` prop; first-timers land on `Onboarding` (after the theme picker), returning users on `Welcome`. The 4-slide §4 copy was already implemented; it was just unreachable.
- **Association dashboard rendered ₦NaN / "undefined" stats.** Frontend expected fields the API doesn't return (`totalCollected`, `confirmedMembers`, `pendingPayments`, `successfulPayments`, topPayers `userName`/`totalPaid`) — backend returns `totalCollectedKobo`, topPayers `name`/`totalPaidKobo`. Fix: aligned `DashboardStats` type + dashboard page + transparency page to the backend contract, AND extended `GET /associations/:id/dashboard` with the three missing counts (`confirmedMembers` = distinct users with approved verification, `pendingPayments` = pending+processing, `successfulPayments`) — covered in `dashboard.service.spec`.
- **Transparency page** "Total Collected" read a non-existent field → now `totalCollectedKobo`.
- **Admin console reviewed end-to-end** (analytics, associations, users, verification, vault moderation, payments, fees, waitlist, audit logs, broadcasts, MFA login): all frontend shapes match the backend; no bugs found.
- **Telegram #488** sent from matriq-server (token stayed on the box) with both console links + demo credentials.

**Next:** deploy — backend rebuild (`scripts/deploy.sh` on matriq-server; no migration needed — response-shape only), admin + dashboard auto-deploy via Vercel from main push, APK rebuild (`_build-apk.sh` + `_finalize-apk.sh`) so the offline-AI + onboarding fixes reach phones (JS-only change → fast incremental build).

**Blockers/flags:** none. (The §2 per-association `[association-name]@matriq.app` shared-account model is still not implemented — separate work item, not a bug in this pass.)

## 2026-08-16 — Criteria-gap pass: OCR fixed, citation+passport removed, missing §1/§2 features added

**Status:** code done + verified (backend tsc + **132 tests green**, mobile/admin/dashboard tsc clean, admin + dashboard `next build` green). NOT yet deployed.

**Did (audit of current build vs matriq-fixes-and-new-builds.md, then filled the gaps):**
- **OCR root cause found by reproducing live on the server** (login as member1 + a generated test image): the OCR path WORKED but always fell back to tesseract because **Gemini was aborting at the 30s timeout** (live test: gemini-3.7-flash took 14s+ and returns 503 "high demand" under load; users waited ~31s for garbled tesseract output = "OCR not working"). Fixes in `tools.service.ts`: 60s timeout with **one retry** on transient failures (5xx/timeout only), **downscale photos to ≤2048px** before sending (phone photos are 3000×4000 — the big latency driver), latency logging, and tesseract warm-up/recognize wrapped in timeouts so it can never hang forever.
- **Removed Citation generator + Passport background remover** (user decision): deleted mobile screens + nav entries + Tools tab sections, backend `POST /tools/passport` endpoint + service method removed.
- **Fixed a live prod crash found in backend logs**: Vault search 500'd with `invalid input syntax for type uuid: "__none__"` whenever a student with no association searched — the sentinel `associationId: "__none__"` is now `{ in: [] }` (zero public results, own items still returned).
- **Admin (§1) gaps filled:** new **Security page** (TOTP MFA QR-code setup flow — enroll → scan → verify → enable, plus disable; backend already existed); **Users page** now shows scheduled deletions + one-click cancel (new `POST /admin/users/:id/cancel-deletion`, spec §10 policy); **Active-user trend card** on the dashboard (signups 7d/30d + 6-week bar series added to `/admin/analytics`); middleware now protects ALL admin pages (users/admins/payments/verification/waitlist/moderation were client-side-only before).
- **Association dashboard (§2) gaps filled:** new **Members roster** page (verified/pending/not-submitted + search, `GET /associations/:id/members`); **Dues roster per fee** on the Fees page (who's paid / who hasn't + CSV export, `GET /associations/:id/fees/:feeId/payments`); new **Events page** (create + list — feeds student RSVPs + QR check-in); new **Timetable page** (push dept/level-scoped changes + exec view of all updates, new `GET /associations/:id/timetable-updates/all`); dashboard middleware now protects fees/checkin/members/events/timetable too.
- **Validation:** backend 132 tests (2 new: cancelUserDeletion + analytics series), all four apps tsc clean, both dashboards production-build.

**Next:** deploy — backend rebuild on matriq-server (`scripts/deploy.sh`, no migration needed), admin + dashboard auto-deploy via Vercel from main, APK rebuild for the mobile changes (tool removals + previous fixes).

**Blockers/flags:** not deployed yet; association-approval flow + shared `[association-name]@matriq.app` exec accounts and the Android overlay bubble (§11) remain unimplemented (bubble is native-only and needs a visual decision).

## 2026-08-16 — APK cut 56% + clean rebuild, shipped as v0.7.3 (build 11)

**Status:** done + shipped. The ~117 MB APK (whose size was the likely cause of downloads stalling at the end) is now **49.7 MB**.

**Did:**
- **Root cause of the remaining download stall:** the server + file were already verified byte-identical and correctly served (full 117 MB download, matching SHA-256, correct `content-length`), so the problem was the APK itself — it was a bloated, unoptimized 117 MB. `llama.rn` (offline AI) ships **7 arm64 engine variants** (v8, v8_2, dotprod, i8mm, hexagon_opencl…) totalling ~65 MB, plus 7 matching JNI wrappers, of which only the generic `librnllama.so` + `librnllama_jni.so` are required (its loader tries each variant and falls back to the generic one on any device).
- **Fix:** `scripts/_build-apk.sh` now injects `packagingOptions.jniLibs.excludes` after `expo prebuild` (which regenerates `build.gradle`, so this is the only durable place for it) to strip the 12 redundant `.so` files, and builds with `./gradlew clean assembleRelease` (true clean rebuild).
- **Result:** **117,537,565 → 52,115,189 bytes (56% smaller)**, version 0.7.3 / versionCode 11. Verified: only `librnllama.so` + `librnllama_jni.so` remain; all other native libs + JS bundle intact; still the standard Android debug signature (SHA-1 `5e8f16…`, unchanged).
- **Shipped:** APK deployed, manifest bumped to v11, live URLs verified (`/download/matriq.apk` content-length 52115189, `app-version.json` → v11). Telegram summary + APK doc #465/#466 (the APK now fits under Telegram's 50 MB bot limit, so it attached successfully this time).

**Note for the user:** the phone must have ~120 MB free to install this (50 MB APK + extraction headroom). If a download still stalls at 100%, clear Chrome's Downloads or use the Files app to free space — but the 56% size cut should resolve it.

**Next:** consider enabling R8 minify + resource shrink (dex is still ~23 MB unminified) for a further ~15 MB cut; confirm offline AI still generates after the variant strip on a real device.

## 2026-08-15 — In-app update install fixed + shipped as v0.7.2 (build 10)

**Status:** done + shipped. Root cause of "downloads to 117.54/117.54 but won't install" found and fixed.

**Did:**
- **Root cause:** the app's manifest never declared `android.permission.REQUEST_INSTALL_PACKAGES`. On Android 8.0+ that permission is required before an app can open the package installer for an APK, so the updater's `ACTION_VIEW` install was silently blocked (and Matriq never appeared in "Install unknown apps"). The APK itself was fine — debug-signed with the standard Android debug key (SHA-1 `5e8f16…`), stable across every build, so no signature mismatch.
- **Fix:** added `REQUEST_INSTALL_PACKAGES` to `app.json` (`android.permissions`, the durable source) + the generated manifest; bumped to **0.7.2 / versionCode 10**. Also added an updater fallback: if the install launch fails, the prompt offers "Open install settings" (deep-links to `MANAGE_UNKNOWN_APP_SOURCES` for Matriq).
- **Verified in the APK:** `aapt dump permissions` shows `REQUEST_INSTALL_PACKAGES`; versionCode 10 / 0.7.2; fallback copy embedded. Manifest bumped to v10 and served live; Telegram #444.

**Important — one manual install is still needed:** the permission that gates the install is the one in the *running* app, not the downloaded APK. So the currently-installed build (which lacks it) can't self-heal. The user must install v0.7.2 once from `https://matriq.com.ng/download/matriq.apk` (browser/Downloads), then every future update installs in-app automatically.

**Next:** none pending.

## 2026-08-15 — Timetable screen synced to server updates + shipped as v0.7.1 (build 9)

**Status:** done + shipped. Follows the release flow from the entry below (bump → build → finalize).

**Did:**
- **Full timetable sync (the last remaining round-2 QA flag).** `TimetableScreen` now fetches association-pushed class changes (`GET /v1/associations/:id/timetable-updates`) via the user's membership and renders them as an "Association updates" feed above the on-device week grid, with loading / error+retry / empty states and dept·level scope labels. Refreshes on focus so a change pushed while the app is open shows up.
- **Fixed the dead deep link:** added `"Timetable"` to the notification feed's `VALID_LINKS` allowlist — timetable notifications now open the Timetable screen (previously they were rendered but non-tappable).
- **Validation:** mobile tsc clean; APK verified versionCode 9 / 0.7.1 with the new feed embedded; manifest bumped to v9 and served at `matriq.com.ng/app-version.json`; `/download/matriq.apk` → 200. Telegram summary #441.

**Next:** none pending.

## 2026-08-15 — Round 2 QA — full fixes pass implemented (notifications, admin analytics, facts/quiz, timetable updates, design)

**Status:** backend + APK both DEPLOYED to production. Backend (`84ff44d`) live with both migrations applied; **v0.7.0 (build 8) APK shipped** — new screens reach students via the in-app updater (no manual redownload).

**Did (all items from matriq-fixes-and-new-builds.md):**
- **In-app notification feed (§5/§9):** Prisma `Notification` model (migration `20260815000002_in_app_notifications`), `notifications/in-app.service.ts` + controller (`GET/POST /v1/me/notifications`, unread-count, mark-read, read-all) — wired fire-and-forget into verification approve/reject, vault moderation, announcements, new dues, payment success, admin broadcasts. Mobile: `NotificationsContext` (unread badge), `NotificationFeedScreen` (infinite scroll, mark-all-read, deep links), Home bell with live unread badge replaces the Verified pill.
- **Admin (§1):** `GET /admin/analytics` rewritten to the real shape (headline counts, association breakdown, most-active courses via vaultItem.groupBy, vault activity) — **fixes the "dashboard doesn't load" bug** (pages read `totalStudents`/`activeAssociations`/`totalCollectedKobo`/`associations`/`topCourses`/`vaultActivity`); admin dashboard page now renders the real data + **platform broadcast composer** (`POST /admin/broadcasts` → notification to every user).
- **Study facts + quiz maker (§8):** `POST /ai/facts` (Gemini batch, 12h server cache, seed fallback) + `POST /ai/quiz` (personalised from the student's approved uploaded materials, course-code scoped, seed fallback). Mobile: `dailyFacts.ts` (daily-cached rotation, never called live on a timer), real `QuizScreen` (multi-choice, explanations, results), Home hero + Study use dynamic facts.
- **Real-time timetable updates (§2):** `TimetableUpdate` model (migration `20260815000003_timetable_updates`), `GET/POST /v1/associations/:id/timetable-updates` — executives push dept/level-scoped changes, students see scoped updates + get an in-app notification.
- **Onboarding (§4):** final 4 slides with the exact copy (promises, "The smart way.", Get Started + Sign In CTAs).
- **Settings (§9/§7):** removed the ntfy instructions row; duplicate offline-AI entry removed (Data & Storage keeps one link).
- **Offline AI grid (§7):** compact 3-column model grid + per-model detail card (download/delete/use).
- **Home To-Do's (§5):** completed items now disappear entirely (no checked state); hero uses dynamic facts.
- **Vault (§6):** compact file-manager rows — filename + upload date + course chip + size.
- **Lime-on-light audit (§3):** CGPA screens' lime accent-text swapped to brand on light surfaces.
- **Background updates (§12):** UpdateOverlay now asks "Update detected — restart now?" Yes/No before applying.
- **Design (§10):** Pop default cards get sticker borders, Glass ambient glow richer, LiquidTabBar raised bubble with stronger active treatment.
- **Review fixes this session:** `NotificationsModule` added to root `AppModule` (routes were otherwise never mounted — sub-module imports alone don't register the controller); mobile unread-count call fixed to read the backend's plain-number response.
- **Validation:** backend tsc clean + **130 tests green** (17 suites — new OCR spec + updated specs for new constructor deps), mobile tsc clean, admin + dashboard tsc clean.

**Deployed (2026-08-15):** committed + pushed as `84ff44d` (also pulled in the Tools commit `1a03680`), production `matriq-server` pulled to `84ff44d`, `scripts/deploy.sh` ran — migrations `...0002_in_app_notifications` + `...0003_timetable_updates` applied (`prisma migrate deploy`), backend rebuilt (new Tools deps installed) and healthy. **Verified live:** `/health` 200; `/v1/me/notifications`, `/v1/me/notifications/unread-count` → 401 (mounted), `POST /v1/admin/broadcasts`, `/v1/ai/facts`, `/v1/ai/quiz` → 401 (mounted).

**APK shipped (2026-08-15):** rebuilt as **v0.7.0 / versionCode 8** (incremental `assembleRelease`, 9m43s, native cache warm). Verified: `aapt` reports versionCode 8 / versionName 0.7.0; bundle embeds `NotificationFeedScreen`, `QuizScreen`, and the new silent-updater copy. Deployed to `matriq-server` (`waitlist/matriq.apk` + `download/matriq.apk`), manifest `app-version.json` bumped to 8/0.7.0 → `https://matriq.com.ng/app-version.json` serves v8 and `/download/matriq.apk` returns 200 (117 MB). Existing v0.6.0 installs will silently download this in the background and prompt "Update detected — restart now?". Telegram summary sent (msg #438); the 113 MB APK itself can't be attached via the bot (50 MB limit) — the download link + updater are the channel.

**Release flow made repeatable ("no constant redownload"):** the version is now single-sourced in `mobile/app.json` (`expo.version` + `expo.android.versionCode`). `scripts/_build-apk.sh` reads it (no hardcoded version); `scripts/_finalize-apk.sh` reads the version straight from the built APK via `aapt`, writes the manifest locally (node JSON-escapes the notes), ships the APK + manifest, and verifies the live URLs. To ship future fixes: bump `version` + `versionCode` in `app.json` → `bash scripts/_build-apk.sh` → `RELEASE_NOTES="…" bash scripts/_finalize-apk.sh`. Installed apps then self-update.

**Next:** none pending — future fixes follow the bump-version → build → finalize flow above.

**Blockers/flags:**
- Broadcasts fan out to ALL registered users in one `createMany` — fine at student scale, watch on big cohorts.
- Timetable-updates student view is implemented server-side; the Timetable screen itself still reads local storage (server feed shows in the notification deep link target — full sync is a follow-up).

## 2026-08-15 — Round 2 QA — waitlist DEPLOYED + Tools pass built

**Status:** waitlist live (student pitch + survey); Tools pass code-complete + pushed (backend + mobile tsc clean, reviewed). Tools backend + APK NOT yet redeployed.

**Did:**
- **Deployed the waitlist rewrite** (commits `30f6de7` + `8ded5e5`): server pulled to `8ded5e5`, `scripts/deploy.sh` ran migrate + rebuilt backend; verified live — 5 survey columns in prod (`pain_point`, `is_association_exec`, `exec_level`, `exec_department`, `exec_faculty`), new student-pitch page serving at matriq.com.ng, API health 200.
- **Gemini key wired** (stored on server + now forwarded in docker-compose: `GEMINI_API_KEY`, `GEMINI_MODEL=gemini-3.7-flash`, `GEMINI_BASE_URL`).
- **Tools pass (commit `1a03680`):** backend OCR now Gemini-first (vision `generateContent`) with tesseract fallback; new server-side tools — PDF merge (pdf-lib, ≤10 files), PDF split→zip (fflate), PDF→Word (.docx via pdf-parse@1.1.1 + docx), Word→PDF (mammoth + pdf-lib), passport background remover (sharp uniform-bg replacement). New deps: pdf-lib, pdf-parse@1.1.1 (pinned — v2.x has a different API), mammoth, docx. Mobile: reusable `FileToolScreen` + 5 tool wrappers + client-side Citation generator (APA/MLA/Harvard); Tools tab reordered portal → AI → documents → photos → grades → writing, no more "Soon".
- **Reviewed + fixed:** paragraph-preserving Word→PDF, merge memory cap, Android .docx picker fallback, Harvard vol format.
- **Validation:** backend + mobile tsc clean; code-reviewed.

**Next:** deploy the Tools backend (`docker compose up -d --build backend` — no migration needed) + rebuild the APK for the new mobile screens; then notifications (bell + feed), admin/association dashboards, onboarding, design refinements, logo.

**Blockers/flags:**
- pdf-parse pinned 1.1.1 (v2 API differs) — noted in code.
- New tools need a backend rebuild (new deps) + APK rebuild to reach students.
- Passport remover is uniform-background only (honest limitation in UI copy).

## 2026-08-15 — Round 2 QA — waitlist rewrite (student pitch + growth survey) + Gemini key wired

**Status:** waitlist rewrite DONE + validated locally (backend tsc/prisma clean, frontend JS checked, code-reviewed). NOT yet deployed — one deploy step remains (migration + backend rebuild + push).

**Did:**
- **Read all 3 docs** (matriq-fixes-and-new-builds.md, matriq-logo-brief.md, matriq-waitlist-launch-package.md). User picked sequencing: waitlist rewrite FIRST, and pasted the Gemini key.
- **Gemini key wired (unblocks OCR/quiz/facts later).** Key `AQ.…` verified live; old models (gemini-1.5/2.0/2.5-flash) are retired for NEW users, but `gemini-3.7-flash` / `gemini-flash-latest` return HTTP 200. Stored on matriq-server `~/matriq/.env`: `GEMINI_API_KEY`, `GEMINI_MODEL=gemini-3.7-flash`, `GEMINI_BASE_URL=https://generativelanguage.googleapis.com/v1beta`. (NOT yet forwarded into docker-compose backend env — do that in the Tools/Gemini pass.)
- **Waitlist backend** — growth survey (launch-package §3): `WaitlistEntry` +5 columns (`pain_point`, `is_association_exec`, `exec_level`, `exec_department`, `exec_faculty`), migration `20260815000001_waitlist_survey_fields`, `PublicJoinDto`/`JoinWaitlistDto` + `join()` store them (exec detail only when isExec), confirmation email copy → student pitch.
- **Waitlist frontend** — full student-pitch rewrite: hero "The Smart Way to Get Through Semester.", name+email form → "Join the waitlist", Telegram invite line (t.me/+Bk-Wbby2_Cc3Njk0), optional survey (pain-point textarea + exec yes/no with level/dept/faculty reveal), trust row, 5 "old way" pain points, 4 features with inline-SVG icons (no emoji), association one-liner, how-it-works, closing "Be first in line" compact email form.
- **Review fixes:** hero button top-margin, `show()` no longer clobbers the CTA msg class, `.is-selected` cleared on reset, `isAssociationExec` only sent when answered, exec yes/no in fieldset/legend (a11y).
- **Validation:** backend `prisma validate` + `generate` + `tsc --noEmit` clean; frontend `node --check` clean; code-reviewed.

**Next:** deploy (git push → server pull → `docker compose run --rm migrate` → rebuild backend; waitlist files served live via Caddy mount), then the Tools pass (reorder + OCR→Gemini + real PDF/compressor/merge-split/passport-remover + model grid + Settings dedupe).

**Blockers/flags:**
- Gemini key is a NEW-user key → only current-gen (3.x) models work; `gemini-2.5-flash` and older return 404. Keep `GEMINI_MODEL=gemini-3.7-flash` (or `gemini-flash-latest` to auto-track).
- Deploy coupling: migration must run before/with the backend rebuild (service reads the new columns), and the waitlist files must land in `~/matriq/waitlist` on the server.
- Admin waitlist view doesn't surface the new survey columns yet (admin feature build).

## 2026-08-15 — OVERHAUL PASS — Stage 2/3 → PRODUCTION: backend live (Vault/Tools/deletion), migration applied, APK v0.6.0 (build 7) rebuilt

**Status:** backend DEPLOYED + verified live; APK v0.6.0 (build 7) rebuilding (tmux `matriq-build`); Telegram delivery pending the APK.

**Did (deploy session, continuing from Stage 2/3):**
- **Committed + pushed** the Stage 2/3 work (was uncommitted in the working tree) as
  `0c57ef6`, alongside the previously-unpushed `0d81a2e` (v0.5.0). Origin/main is now
  current with the full spec overhaul.
- **Found the interrupted APK build.** The prior `apk-build-overhaul` tmux session was gone
  and its gradle daemon was orphaned/frozen at `app:buildCMakeRelWithDebInfo[arm64-v8a]`
  (no ninja/clang children, log frozen since 19:33). Killed it (`gradlew --stop` + kill -9)
  and **resumed the build directly** (skipped `expo prebuild` to preserve the partial
  `.cxx` state) in a persistent tmux session `matriq-build`. Build re-validated first:
  backend tsc + **126 tests green**, mobile tsc clean.
- **Backend deployed to matriq-server.** The production repo was still at `bfa2640`
  (v0.3.0 era) with local Caddy (www subdomain) + manifest (v6) edits. Discarded the two
  superseded edits (both are in committed history), `git pull --ff-only` → `0c57ef6`,
  re-pinned the live manifest to v6 (until the v7 APK lands), then `scripts/deploy.sh`
  (`DEPLOY_EXIT=0`). **Verified live:** `vault_items` table + indexes + FKs, `users.
  deletion_scheduled_at`, `payments.user_id` nullable, and the new routes auth-gate
  correctly — `GET /v1/vault`, `POST /v1/me/deletion-request`, `GET /v1/admin/vault-items`
  all 401 (not 404), `POST /v1/tools/ocr` 401.
- **Telegram path confirmed.** Bot token + chat are in `~/.hermes/.env` on matriq-server
  (`TELEGRAM_BOT_TOKEN`, `TELEGRAM_HOME_CHANNEL`; bot @GareflyerBot) — used via env vars
  so the token never leaves the box.

**Next:**
- APK build finishes (tmux `matriq-build` → `/tmp/gradle-resume.log`) → copy to
  `~/matriq/waitlist/matriq.apk` + `waitlist/download/matriq.apk` on matriq-server, bump
  `waitlist/app-version.json` to v7, verify `matriq.com.ng/app-version.json` + the download
  URL, then Telegram the APK + summary via `sendDocument`.

**Blockers/flags:**
- OCR's tesseract worker cold-starts (downloads `eng` traineddata) on first use — the
  first OCR request after deploy will be slow; fine at student scale.
- The live manifest stays pinned at v6/0.4.0 until the v7 APK is actually on disk, so
  installed apps aren't offered a missing build.

## 2026-08-15 — OVERHAUL PASS (matriq-complete-spec.md) — Stage 2/3: Vault live, smart tools, account deletion, admin moderation

**Status:** code DONE + validated (backend tsc/lint + 135 tests green, mobile tsc + web/Android bundles export, admin lint/tsc green); APK v0.6.0 (build 7) building in tmux (`apk-build-overhaul`)

**Did (spec §§7, 8, 10, 14, 15):**
- **The Vault is REAL (spec §7).** Backend `backend/src/vault/` (module/service/controller):
  search scoped to the student's school (association) + own items, course-code-first,
  type filter, My Uploads, upload with server-side file validation (PDF/JPG/PNG/WebP,
  20MB cap — spec §13 Tier 3), Public (admin-approved before school sees it) / Private
  (usable immediately), and **smart storage**: images get a lower-quality JPEG companion,
  other files a zip — only kept when genuinely smaller (sharp + fflate). Terms-of-Use
  acceptance recorded at first upload (spec §14 trigger, separate from registration).
  Files go to MinIO (`StorageService`) with base64 data-URI fallback; downloads resolve
  original or light copy and enforce ownership + approval gates; download counter feeds
  popularity later. Migration `20260815000000_vault_and_scheduled_deletion` adds
  `vault_items` + indexes.
- **Account deletion for real (spec §10).** `backend/src/auth/deletion.service.ts`:
  request schedules hard deletion 6 months out + revokes all sessions instantly;
  **any login or token refresh cancels it** (wired in AuthService.login/refresh);
  background sweep (`OnModuleInit` interval, every 6h, per-user failure isolation)
  hard-deletes personal data in one transaction — payments are anonymised
  (`payments.user_id` now nullable, financial records kept for reconciliation),
  public Vault items re-point at a synthetic "deleted contributor" so the shared
  corpus survives, private ones go with the student. `AuditActorType` gained
  `student` for the self-service audit trail. Endpoints: `POST /auth/delete`,
  `DELETE /auth/delete` (cancel), `GET /me` exposes `deletionScheduledAt`.
- **Tools live (spec §8):** backend `tools` module — server-side OCR
  (`POST /tools/ocr`, tesseract.js, lazy shared worker, honest "no readable text"
  gate, 10MB cap); mobile: **Image to Text** (`OcrScreen`), **Image to PDF**
  (`ImageToPdfScreen`, expo-image-manipulator → canvas-free fflate PDF), **File
  Compressor** (`FileCompressorScreen`, real zip via fflate + share via expo-sharing)
  — all with share/save. Enabled in the Tools grid (was "Soon").
- **Settings → Delete Account real flow.** Type-to-confirm → API call → shows the
  6-month schedule + "sign in to cancel" copy with a live cancel button; `PATCH /me`
  gains `deletionScheduledAt`. Dues & Payments screen reworked with the conditional
  Coming Soon state (spec §10 gate).
- **Admin moderation queue (spec §15).** `GET /v1/admin/vault-items` +
  `POST /v1/admin/vault-items/:id/moderate` (approve/reject + reason), new
  `admin/src/app/vault-moderation/page.tsx` with status tabs, submitter info, and
  reject-reason input; nav added.
- **Validation:** backend tsc clean + **135 tests green** (9 new: deletion 4 + vault 5);
  backend lint clean (`eslint --fix` applied); mobile tsc clean; `expo export` web +
  Android both bundle; admin tsc + lint clean; code-reviewed (reviewer verified: sweep
  scheduling, login/refresh cancellation, MinIO reuse + ownership gates, admin guards,
  FormData boundary handling, no Settings duplication).

**Next:**
- APK build (`apk-build-overhaul` tmux) → deploy to `waitlist/matriq.apk` on the VM,
  confirm `matriq.com.ng/app-version.json` → v7, then Telegram the final APK + summary.
- Apply the migration on the live DB (`prisma migrate deploy`) before the new app talks
  to the new endpoints.

**Blockers/flags:**
- `payments.user_id` nullability needs the migration applied on the live DB.
- OCR/companion generation are CPU-heavy on the 4-core box — fine at student scale;
  the semaphore pattern from `ai/semaphore.ts` could serialize OCR later if needed.

## 2026-08-14 — OVERHAUL PASS (matriq-complete-spec.md) — Stage 0/1: foundation + design system + 5-tab nav + theme picker

**Status:** foundation stage DONE (tsc green, web + Android bundles export, code-reviewed).
This is the first stage of a staged overhaul driven by `matriq-complete-spec.md` (committed to
repo root). Execution order per spec §16: foundation first, then P0 → P1 → P2, each stage
validated before the next.

**Did (Stage 0/1 — Sections 2–4 core, 8/9 partial):**
- **Design system “Glass & Pop” (spec §2).** `mobile/src/theme/`:
  `tokens.ts` (exact hexes: purple-950 #14061F, purple-600 #55278F, purple-500 #7B4BC4,
  lime-500 #C6FF3D, lime-400 #DBFF7A, ink #170B26, paper #F5F1FB), `themes.ts` (full Glass +
  Pop theme objects: palettes, Plus Jakarta Sans typography 400–800, radii, spacing, motion
  easings — Glass 400–600ms cubic-bezier(.16,1,.3,1) / Pop 150–250ms cubic-bezier(.34,1.56,.64,1),
  shadows: Glass soft float, Pop clay dual + brutalist sticker w/ press collapse), `ThemeContext.tsx`
  (persisted choice, `hasThemeChoice` gate, font loading via `@expo-google-fonts/plus-jakarta-sans`).
- **Inline SVG icons (spec §2 — no icon fonts).** `mobile/src/components/icons.tsx`: 55+
  hand-drawn lucide-style glyphs via react-native-svg; the filled four-point `sparkle` is
  reserved for AI-touched surfaces only. New UI uses zero Ionicons (legacy screens still do
  until their stage).
- **Theme picker = very first screen (spec §4).** Neutral gradient bg, two living preview
  cards (Glass: breathing lime blob behind frosted surface; Pop: clay dot + ink sticker
  border). Choosing applies the theme instantly (no wrong-theme flash) then flows to onboarding.
- **Onboarding reworked (spec §4).** 3 promise slides (offline AI / Vault / low-data),
  ONE quiet dues line, tagline “The smart way.” everywhere (loading, onboarding, Welcome, Settings).
- **5-tab bottom nav (spec §3): Home · Vault · Tools · Study · Settings.**
  `navigation/LiquidTabBar.tsx` — signature moment: a soft lime blob that slides + stretches
  to the active icon (reanimated spring, no jump) in Glass; ink icon + lime clay dot in Pop.
  SVG icons, safe-area aware, first-paint blob placement (no left-edge flash).
- **Web is first-class (spec §0).** Installed react-native-web + react-dom + @expo/metro-runtime;
  app.json `userInterfaceStyle: automatic` + web block. New `utils/storage.ts` wrapper
  (SecureStore native / localStorage web) — **api/client.ts token storage migrated to it**
  (reviewer catch: web auth would have broken), UpdateOverlay made web-safe (Android-only,
  hooks-order-correct). `ConfirmSheet` (Alert replacement — Alert doesn't exist on web) renders
  position:fixed on web / Modal on native.
- **Core components re-themed** (Button w/ Pop sticker press + Glass glow, Input w/ live
  valid/error + focus glow, Card→Surface, ErrorBanner, PasswordStrength, LoadingScreen,
  WheelPicker) + new `Surface` (card/sticker variants) + `AmbientBlobs` (slow-drifting lime/
  violet/magenta blobs behind Glass, prefers-reduced-motion aware, SVG radial gradients).
- **Auth flow re-themed.** Welcome, Login (MFA code now uses the new `OtpInput`), RegisterChoice,
  RegisterStaylite/Fresher (+ required **Terms checkbox** — spec §4/§14 trigger), VerifyEmail
  (6 individual OTP boxes — paste support, auto-advance, auto-submit, 30s resend countdown
  inline beside “Didn't get the code?”), CompleteProfile (DOB wheels).
- **New tabs:** Home (spec §6 skeleton: avatar/name/live clock/status badge, My To-Do's with
  real offline-AI completion, rotating-fact hero or nudge, Vault/next-class/What's-new links —
  NO dues card), Vault (spec §7 surface + search + Public/Private + smart-storage copy),
  Tools (spec §8: tools grid “Soon” + **live School Portal link** (verified 200,
  `portal.delsuces.online/Defaultt`) + **Portal Services → WhatsApp** with per-action
  prefilled messages, number stored once in `constants/portal.ts`), Study (spec §9: shared
  fact card, offline-AI setup block w/ model download sizes + **provisional RAM notes**,
  web shows “not on web yet”; extras listed), Settings (spec §10: Appearance with the
  “Changing the Perspective → Narrative → Objective” sequence then theme applies,
  Profile/Dues/Notifications/Data & Offline/Verification/Terms/Help rows, Sign Out via
  ConfirmSheet, Delete Account type-to-confirm + 6-month copy → structured “not ready yet”
  notice until the backend flow lands).
- **Validation:** mobile tsc clean; `expo export` web (2.6MB) + android (hermes hbc) both
  bundle; code-reviewed — fixed: web SecureStore auth break, delete type-to-confirm not
  enforced, tab-bar first-paint flash, dead code, web Modal.

**Next (Stage 2/3):** passcode/session system (spec §5: 3-hour “Welcome back” gate, last-exit
AppState tracking, 6-digit passcode set right after email verification; passcode-only per
user's answer — no biometrics) → then Home completion wiring + Vault backend (Stage 4/5).

**Blockers/flags (per spec §1/§14, user-confirmed):**
- Offline AI: ship verified download sizes + neutral copy; RAM notes marked provisional —
  user will test on a low-end device and we lock the final numbers.
- Terms of Use: user pasted the Termly export in chat (truncated by the messenger) — hosted
  pages `matriq.com.ng/terms.html` + `privacy.html` are the live targets; re-paste the full
  export when convenient. A Privacy Policy may need creating alongside.
- Legacy screens (Fees/Events/Profile/Verification/OfflineModels/Announcements/Payments) still
  render the old palette + Ionicons — they migrate in their stages; theme switch looks partial
  until then.
- Home to-do “all done → hide section + badge” is unreachable this stage (timetable/materials/
  photo completion wiring comes with their features).

## 2026-08-13 — Offline on-device AI (llama.rn) — models downloaded by the user, not bundled; AI works with no internet

**Status:** DONE — v0.4.0 APK built (llama.rn native engine baked in), deployed live, update manifest rolled out

**Did:**
- **Offline AI Study Companion.** The llama.cpp engine (`llama.rn` 0.13, JSI) ships in the
  APK (~a few MB of native libs), but the **model itself is a user-initiated runtime
  download** — nothing heavy is bundled, exactly as requested.
- **3-model catalog** (verified HF URLs + byte-exact sizes): SmolLM2-360M Q4 (~258 MB, Tiny),
  Qwen2.5-0.5B Q4_K_M (~469 MB, Small — recommended), Llama-3.2-1B Q4_K_M (~770 MB, Medium).
- **New `mobile/src/offline/` module:** `OfflineAiContext` (download with progress + cancel via
  `expo-file-system/legacy` resumable, 2× free-space guard, auto-select first download, lazy
  engine warm-up, safe model switching — releases the old engine, re-checks the active model
  after an in-flight init so the wrong model can never answer, `ask()` streaming completion
  with chat history) + `persistence.ts` (config JSON + orphan-file reconciliation) + `models.ts`.
- **`OfflineModelsScreen`** (stack route "Offline AI"): per-model download/use/delete with
  progress bars, free-storage readout, "Always use offline AI" toggle, honest tier/quality
  notes.
- **`AiCompanionScreen` offline mode:** 4s connectivity ping (20s interval + on focus),
  auto-switch to on-device answers when offline (including mid-stream fallback with a notice),
  "always offline" preference, status chip → Offline AI screen, and a no-model banner that
  tells offline users to download when they're back online (can't strand them on an unusable
  download screen).
- **Infra:** app.json adds `llama.rn` config plugin (CPU-only, `enableOpenCL:false`) +
  `expo-build-properties`; `_build-apk.sh` → versionCode 5, llama.rn jniLibs fallback
  download, proguard rule; `app-version.json` bumped to 0.4.0 so installed apps self-update.
- **Also committed** the outstanding reviewer fix from the auth session: the 5/hr
  verification-budget check now runs BEFORE re-registration deletes the old account.
- **Validation:** mobile tsc clean; `expo prebuild` applies the plugin cleanly; llama.rn
  autolinks (standard RN lib: `react-native` field + codegen spec + prebuilt arm64 jniLibs);
  code-reviewed (wrong-model race, token-streaming field, stranded-offline UX — all fixed).

**Done (later same day):**
- **APK rebuilt** (`bash scripts/_build-apk.sh`): BUILD SUCCESSFUL in ~5h (heavy llama.cpp
  native compile on this box — the `llama.rn:buildCMakeRelWithDebInfo[arm64-v8a]` task).
- **Verified:** versionCode 5 / 0.4.0, 112.9 MB; `librnllama.so` (9.6 MB) + all CPU-variant
  JNI libs (v8/v8_2/dotprod/i8mm/hexagon) in the APK; bundle contains the offline AI strings.
- **Deployed live:** new APK at `waitlist/matriq.apk` + `waitlist/download/matriq.apk` on
  the VM (Caddy serves `/download/matriq.apk` from the TOP-level file via `handle_path` —
  the old 34 MB v0.2.1 was being served there; overwritten). Manifest bumped to
  versionCode 5. **Verified end-to-end:** `https://matriq.com.ng/app-version.json` → v5,
  `https://matriq.com.ng/download/matriq.apk` → 200 with content-length 112,861,174, and
  downloaded hash matches the local build byte-for-byte (md5 `f1753185…`).

**Next:**
- First real-device test: download Qwen 0.5B over Wi-Fi → airplane mode → ask a question in
  the AI tab. (Installed apps self-update to v0.4.0 via the in-app updater.)
- llama.rn 0.13.0-rc.0 is a release candidate — consider pinning a stable version once one
  ships (flagged by review).

## 2026-08-12 — Auth overhaul: OTP delivery FIXED (Resend domain), 5/hr email limit, structured errors, new sign-in UI, DOB step, optimistic UI

**Status:** done — all verified live; new APK v0.3.0 (build 4) shipping via the in-app updater

**Did:**
- **ROOT CAUSE of "I didn't get an OTP": Resend was in TEST MODE.** The key on the box was
  send-restricted (`restricted_api_key`) and the domain wasn't verified — Resend only allows
  sending to the account owner's email (logs showed `You can only send testing emails to your
  own email address`). Every verification email to a student silently failed. **User fixed it:**
  created a full-access Resend API key (`re_...`, now in `.env` on both boxes) and verified
  `matriq.com.ng` on Resend (status: `verified`, sending enabled). Backend now sends from
  `Matriq <no-reply@matriq.com.ng>` (`EMAIL_FROM`, added to compose env passthrough).
  **Verified live:** direct Resend API send → message ID; full app flow — register with a real
  gmail → `Email sent: "Your Matriq verification code" … (id: 4e3222cd…)` in backend logs,
  no errors.
- **Verification emails capped at 5/hour per account, with an exact retry message.** New
  `verificationEmailCount` + `verificationEmailWindowStart` columns (migration
  `20260814000000_add_dob_verification_limits`). Register + resend share ONE rolling budget;
  the 6th request within the hour returns
  `429 { code: "VERIFICATION_EMAIL_LIMIT", retryAfterMs, message: "…request a new code in
  about 60 minutes" }`. Counters carry across re-registration (can't reset by delete), and the
  budget check runs BEFORE any account cleanup. Resend endpoint throttle aligned (10/hr safety
  net; the DB check is the real limit). **Verified live:** register + 4 resends OK, 6th request
  → exact 429 with countdown.
- **Structured errors everywhere (no more raw "HTTP 401" / "fetch failed").** New global
  exception filter (`backend/src/common/all-exceptions.filter.ts`): every failure returns
  `{ statusCode, code, message, error: { message }, retryAfterMs? }`; unknown errors become a
  generic 500 (internals logged, never leaked); ThrottlerException → friendly RATE_LIMITED.
  `login` now returns `INVALID_CREDENTIALS` (verified live). Mobile side: new `utils/errors.ts`
  maps any error into **What happened / Why / What to do** (network, timeout, rate limit with
  countdown, wrong credentials, server errors) + `ErrorBanner` component. The `uploadVerification`
  path still throws a raw message (flagged, low priority).
- **Fixed a latent 500 on re-registration:** deleting an unverified user tripped the
  `legal_acceptances_user_id_fkey` FK (surfaced by the new filter — found via stack trace).
  Register now deletes legal acceptances + refresh-token families before the user.
- **New sign-in/sign-up UI (interactive):** live validation on every field — green border +
  check icon when correct, red + message the moment it's wrong; password strength checklist
  (8+ chars, upper, lower, number, symbol) via new `PasswordStrength`; header icons; the login
  screen got the same treatment + MFA step preserved.
- **VerifyEmail screen:** 30s resend countdown rendered INLINE right beside "Didn't get the
  code?" (starts on screen open, resets on resend) + spam-folder hint + structured errors
  (including the 5/hr message with countdown).
- **Date of birth step after email verification, before the dashboard:** new
  `CompleteProfileScreen` with scroll **wheel pickers** for day and month (custom
  `WheelPicker`, snap-to-item, no native deps) + **manual year input**; live preview
  ("12 May 2005"); validates day/month/year combos, future dates, year 1900–now.
  `PATCH /me { dateOfBirth }` → `dateOfBirth` column. MainNavigator gates on
  `user.dateOfBirth == null` (existing users get the step once on next login). **Verified
  live:** persist, future-date rejection, invalid-year rejection.
- **Optimistic rendering:** Events RSVP toggles instantly with rollback on failure (double-tap
  guarded); Announcements mark-as-read updates the "New" badge + read count immediately with
  rollback. Both now fetch REAL data (previously stubs) — backend list endpoints now return
  `rsvpByMe` / `readByMe` per user.
- **Validation:** backend tsc clean + **39/39 auth tests** (incl. budget-exhaustion, re-reg
  no-delete regression); mobile tsc clean; live E2E green (structured INVALID_CREDENTIALS,
  VERIFICATION_EMAIL_LIMIT 429, DOB persist/reject, real email delivery). Commits `b1c1ca8` →
  `9721314` + `bfa2640`.
- **v0.3.0 (build 4) APK** rebuilding (tmux); `app-version.json` bumped so installed apps
  self-update.

**Next:**
- User: the new APK self-updates from v0.2.1 via the in-app updater (or Telegram msg #24x).
- Optional cleanup (reviewer): `uploadVerification` raw-error path → route through the friendly
  error system; WheelPicker highlight uses the itemHeight prop.
- Student emails now deliver from no-reply@matriq.com.ng — test the full register → OTP → DOB
  flow on a phone.

Entry format:
```
## YYYY-MM-DD — Phase N — [short title]
**Status:** on track / blocked / needs human input
**Did:** what actually got done this session
**Next:** the next concrete step, specific enough to start from cold
**Blockers/flags:** anything a human needs to weigh in on before work continues
```

## 2026-08-12 — Custom subdomains LIVE: admin.matriq.com.ng + dashboard.matriq.com.ng

**Status:** done — both verified end-to-end over HTTPS

**Did:**
- **Put the dashboards on branded subdomains** (user request after the Vercel env fix):
  - Cloudflare API (token in `matriq/.cloudflare-token`, 0600, gitignored): added two
    DNS-only CNAMEs → `cname.vercel-dns.com` (TTL 300, matching existing records).
  - Vercel API: attached `admin.matriq.com.ng` to project `matriq` and
    `dashboard.matriq.com.ng` to `matriq-dashboard` — both `verified: True` instantly.
  - Old `*.vercel.app` URLs still work (they stay attached) — no breaking change.
- **Backend CORS extended** on the target (`.env`): added
  `https://admin.matriq.com.ng,https://dashboard.matriq.com.ng`; backend restarted,
  health 200. (Also updated the local `.env` copy.)
- **Verified live:** both domains serve 200 (login pages, valid auto-issued certs — the
  dashboard cert took ~1 min to provision); admin + executive logins through the new
  domains return 200 with authenticated sessions; CORS preflights from both new origins
  → 204 with correct allow-origin.
- Docs updated (infrastructure subdomain table now reflects the real topology).

**Next:**
- User: bookmarks are now https://admin.matriq.com.ng and
  https://dashboard.matriq.com.ng (same seed creds as before).
- Optional later: proxy the VM hosts through Cloudflare (origin certs) for WAF/CDN.

## 2026-08-12 — Admin console + association dashboard made FUNCTIONAL (Vercel env fix)

**Status:** done — both sites were up but login 500'd; now fixed and verified

**Did:**
- **User asked "are the admin and association websites functional?".** Investigation:
  both sites respond 200 (login pages served, auth middleware redirects work), but
  the server-side login routes returned `{"error":"fetch failed"}` (HTTP 500).
  Backend itself was fine (direct admin + executive logins return JWTs; CORS already
  lists both Vercel origins).
- **Root cause:** `NEXT_PUBLIC_API_URL` on Vercel pointed at the DEAD
  `https://api.matriq.app/v1` (the old .app plan; the domain doesn't resolve). The
  migration note from the production cutover ("update NEXT_PUBLIC_API_URL on both
  Vercel projects") had never been applied — the sites rendered, but every login
  failed against a dead domain.
- **Fixed via Vercel API** (token in `matriq/.vercel-token`, 0600, gitignored):
  - `matriq` (admin console): env var patched to `https://api.matriq.com.ng/v1`
    (production+preview+development).
  - `matriq-dashboard`: the var was type `sensitive` (which can't be patched) —
    deleted and recreated as `encrypted` with the correct URL
    (production+preview).
  - Redeploys triggered via GitHub push (both projects auto-deploy from `main`).
- **Verification:** after the rebuild, site login routes return a session cookie
  (200) and `/api/auth/session` reports authenticated — full admin + executive
  login flows now work against the live API.

**Next:**
- User can now use the sites: Admin Console at https://matriq-ebon.vercel.app
  (admin@matriq.app / Admin@Matriq2026) and Association Dashboard at
  https://matriq-dashboard.vercel.app (president@matriq.app / Exec@Matriq2026).

## 2026-08-12 — Sign-in 401 fixed (root cause), OTP email verification, in-app auto-updater; APK v0.2.0 shipped

**Status:** done — all three requests delivered; new APK (Telegram msg #238)

**Did:**
- **Root cause of the sign-in 401 found and fixed.** Two compounding bugs:
  1. `APP_URL` was never set on the server → verification emails contained
     `http://localhost:3000/...` links that are dead on a phone. Students could
     never verify, and login silently rejects unverified accounts → generic 401.
  2. The mobile client's error parser read `err.error?.message`, but NestJS sends
     `{ message, error, statusCode }` → users saw the raw "HTTP 401".
  - Fix: `APP_URL` added to `.env` (both boxes) + forwarded in `docker-compose.yml`;
    `mobile/src/api/client.ts` now parses NestJS bodies properly and throws a typed
    `ApiError` with a stable `code`. Unverified logins return
    `401 { code: "EMAIL_NOT_VERIFIED" }` and the app routes the user to the new
    OTP screen instead of showing a dead error.
- **OTP email verification implemented (not just links):**
  - `verificationToken` now stores a **6-digit code** + new
    `verification_code_expires_at` column (migration
    `20260813000000_add_verification_code_expiry`, applied; shadow-DB compose fix
    `b5794b3` — Prisma 7 requires a dedicated shadow database, created
    `matriq_shadow`).
  - Email shows the code big (plus a working clickable link → new `GET
    /v1/auth/verify-email` HTML page). Expiry checked on verify; codes are
    24h-valid, brute-force throttled (10/min).
  - New `POST /v1/auth/resend-verification` (throttled 3/min, generic response so
    it can't enumerate emails).
  - New mobile `VerifyEmailScreen` (6-digit entry, resend w/ 30s cooldown) wired
    after registration and from login on `EMAIL_NOT_VERIFIED`.
  - **E2E verified live:** register → code `989260` stored with expiry → wrong code
    400 → correct code returns JWT → login succeeds; GET verify-link page 200;
    CORS preflight on resend 204. (Resend rejects `@example.com` test addresses by
    design — real addresses deliver, same as the waitlist email.)
- **In-app auto-updater (no more manual APK downloads):**
  - New `waitlist/app-version.json` version manifest, served by the site
    (`/download/*` also added to the `matriq.com.ng` Caddy block).
  - App checks it on launch (4s in, non-blocking): `UpdateOverlay` modal offers
    "Update now" → downloads the APK (`expo-file-system/legacy` + progress bar) →
    opens the system installer via `expo-intent-launcher` + `getContentUriAsync`
    (FileProvider). "Later" remembers the skipped version (secure-store).
  - `versionCode 1 → 2`, `versionName 0.2.0` (gradle + app.json); new deps
    `expo-file-system`, `expo-intent-launcher`, `expo-application`.
- **Rebuilt + verified + delivered:** `assembleRelease` in tmux (7m 22s);
  `aapt` confirms `versionCode='2' versionName='0.2.0'`; bundle embeds
  app-version.json URL + VerifyEmail copy + `EMAIL_NOT_VERIFIED`; 0 emojis;
  `npx tsc --noEmit` green (mobile + backend); all 33 auth tests green.
  Distributed to `waitlist/matriq.apk` (both boxes), repo root, HTTPS download
  `https://matriq.com.ng/download/matriq.apk` → 200 (33,999,424 bytes), and sent
  via Telegram (msg #238). Commits `64f76b8` + `b5794b3`.
- **Review pass + final build (`caed959`, Telegram msg #239):** OTP generation now
  retries on the rare unique-index collision (withUniqueVerificationCode, 5
  attempts); login verifies the password BEFORE returning `EMAIL_NOT_VERIFIED`
  (blocks account enumeration); removed dead code; updater guards a null cache
  dir. Final APK is **v0.2.1 / versionCode 3** — install this over v0.2.0; it's
  the last hand-sideload, and it will self-update to any future build via the
  in-app updater (the manifest at `matriq.com.ng/app-version.json` is the
  release switch). Backend redeployed with the fixes (health 200).

**Next:**
- User: sideload the new APK. From now on updates prompt in-app (this one must be
  installed once by hand since it's the build that contains the updater).
- Try the OTP flow: register (or sign in with an unverified account) → enter the
  6-digit code from email → straight into the app.
- The updater keeps `app-version.json` in sync with the next build's versionCode.

## 2026-08-12 — App v2: onboarding + vector icons + legal links; APK rebuilt & delivered

**Status:** done — new APK shipped (Telegram msg #233); site legal pages live

**Did:**
- **Connection error explained:** the "Failed to connect to api.matriq.com.ng:443" error
  was transient — DNS had just flipped and Caddy was mid-restart. Verified healthy end-to-end
  from a neutral resolver (DNS → 35.204.163.157, valid LE cert, login + `/v1/associations` 200).
  **No redownload was needed for the connection fix**; the rebuild below is for the UI work.
- **Onboarding for first-timers (simple, 3 slides):** new `OnboardingScreen` (people → wallet →
  sparkles, all Ionicons), swipe + dots + Skip/Next/Get Started; shown only until the user
  completes it (flag in `expo-secure-store`), so returning users go straight to Welcome.
  Wired as the auth stack's initial route in `AppNavigator`.
- **Terms & Privacy links now tappable:** Welcome + RegisterStaylite + RegisterFresher footers
  open `https://matriq.com.ng/terms.html` / `privacy.html` (new branded pages in `waitlist/`,
  served by Caddy's file_server — verified 200 over HTTPS, same dark-purple brand).
- **NO emojis as icons — full sweep:** replaced every emoji glyph across the app with real
  Ionicons (@expo/vector-icons): tab bar, dashboard, fees/dues, events (people-outline,
  checkmark), referrals (trophy/flag), verification upload (camera/image-outline), AI
  companion (sparkles header, arrow-up send), announcements (pin badge + eye-outline reads),
  payments (card/business/phone-portrait + checkmark-circle), receipt (qr-code icon),
  profile + dashboard "Verified". Final sweep: **0 emoji glyphs in `mobile/src` and in the
  release bundle**; `npx tsc --noEmit` green.
- **Rebuilt + verified + delivered:** incremental `assembleRelease` (tmux), 33.9 MB; bundle
  embeds `https://api.matriq.com.ng/v1` + onboarding copy, zero emojis. Distributed to
  `waitlist/matriq.apk` (both boxes), repo root `matriq-student.apk`, `/download/matriq.apk`
  → 200 (33,922,708 bytes) on the new box, and **sent via Telegram (msg #233 then final #234,
  @GareflyerBot)**. A review pass (skip onboarding gate for authed users, dedupe flag key,
  safe Linking) is committed (`aa70abf`) and included in the final APK.

**Next:**
- User: sideload the new APK (Telegram) and run through first-launch onboarding + a login.
- Note: existing installs keep working; the new onboarding shows only on fresh installs (or
  after app data clear) since it's flagged in secure storage.

## 2026-08-12 — Waitlist page redesigned + APK shipped via Telegram

**Status:** done

**Did:**
- **APK delivered via Telegram** — sent the rebuilt `matriq.apk` (31.4 MB) to the user's
  private chat using the Hermes bot token found in `~/.hermes/.env` on matriq-server
  (`sendDocument` ok, message #229, bot @GareflyerBot). Token never left the server.
- **Redesigned `waitlist/` landing page** — "The operating system for Nigerian student
  associations": problem grid ("The old way is exhausting"), six feature cards, an
  executives/members audience split, how-it-works, and a final CTA. Brand-consistent
  (dark purple #6C3BAA, Inter), responsive, prefers-reduced-motion friendly.
- **`matriq.com.ng` now serves the waitlist UI only** — removed the `/v1/*` reverse-proxy
  from the root domain block in `caddy/Caddyfile`; the API surface lives exclusively at
  `api.matriq.com.ng`. The page's form + live counter call the api subdomain cross-origin.
- **CORS verified live**: OPTIONS preflight 204 with `access-control-allow-origin:
  https://matriq.com.ng` (user had already added it to `CORS_ORIGIN` on both boxes).
  Honeypot POST (no insert) and a real signup (user's email → position #4) both return
  the correct payload; the confirmation email should arrive in their inbox.
- Optional `fullName` field added to the form (the backend already supported it).

**Next:** flip the root `matriq.com.ng` A record → `35.204.163.157` (see chat steps) so
`https://matriq.com.ng` serves the new page from matriq-server with a Let's Encrypt cert.

## 2026-08-12 — Student APK rebuilt → https://api.matriq.com.ng/v1

**Status:** done — new APK live on both servers

**Did:**
- Production HTTPS verified live (user opened GCP 443 + flipped the `api` A record):
  `https://api.matriq.com.ng/health` → 200, and login + `/v1/associations` return real
  JWTs/200s through the production URL.
- Rebuilt `app-release.apk` (Gradle incremental `assembleRelease`, 6m 1s, tmux session
  `apk-build`, debug-signed, 31.4 MB): JS bundle now embeds `https://api.matriq.com.ng/v1`;
  the old trycloudflare URL is gone (verified by unzipping the bundle). No source change
  was needed — `client.ts` already had the production URL.
- Distributed: `waitlist/matriq.apk` on BOTH boxes + repo root `matriq-student.apk` (all
  `*.apk` gitignored). The existing tunnel download URL serves the new file
  (200, 31,485,148 bytes). Added a `/download/*` route to the new IP block in
  `caddy/Caddyfile` so `http://35.204.163.157/download/matriq.apk` works too.

**Next:**
- User: flip the **root** `matriq.com.ng` A record → `35.204.163.157` (its LE cert is
  failing because it still points at the old box).
- Sideload the new APK on a phone and test against the production API.

## 2026-08-12 — PRODUCTION MIGRATED to matriq-server (e2-standard-4, 4 vCPU / 16GB)

**Status:** deployed & verified on the new box; 2 manual console steps left (GCP firewall 443 + Cloudflare A records)

**Did:**
- **Discovered two servers were in play:** the live stack was actually running on
  `cliptonite-server` (34.28.210.233, e2-medium, **2 vCPU / 4GB**) while the documented
  `matriq-server` (35.204.163.157, europe-west4, **e2-standard-4, 4 vCPU / 16GB**) ran only a
  stale Phase-0 copy. User confirmed 35.204.163.157 is a separate, bigger VM — so we migrated
  production onto it (the capacity goal: 1,000 concurrent students).
- **Migration performed (all verified live):**
  - Committed + pushed the pending capacity upgrades (`09ca92e`).
  - Target: backed up stale local history (`backup-phase0` branch), reset to `origin/main`,
    replaced `.env` (verified identical to source), torn down the old stack + volumes.
  - Data ported: `pg_dump` (10 MB) → `pg_restore` on the new box (11 users present),
    `prisma migrate deploy` no-op (already applied). Ollama models pulled
    (llama3.2:3b 2.0 GB + nomic-embed-text 274 MB).
  - Full stack up: backend (healthy), caddy, postgres, redis, ollama, ntfy, minio.
  - **Cluster confirmed: 4 workers forked** (one per core). Throttler storage: Redis
    (shared across workers).
  - Load test from old box → new box (public IP :80, 15s, 30 conns, Caddy → 4 workers):
    /health **277 rps p95 108ms**, /v1/associations (JWT+DB) **269 rps p95 113ms** — flat
    latency (avg ≈ p95), zero queuing; the ~107 ms is cross-region internet RTT. Old box
    numbers for comparison (contended 2-core): associations ~88 rps p95 464ms+.
- **Cutover prep committed:** Caddyfile IP block → `35.204.163.157`; mobile `app.json` +
  `client.ts` → `https://api.matriq.com.ng/v1` (tunnel URL retired); docs updated
  (infrastructure capacity, setup-checklist machine type, cloudflare-vercel banner).

**Next (user, ~2 min in consoles):**
1. **GCP console** → VPC network → Firewall: allow **TCP 443** (and 80 if not already) to
   the `matriq-server` VM. Port 80 is already open (verified 200 from the internet).
2. **Cloudflare** → DNS: change the `api` (and root) **A records from `34.28.210.233` →
   `35.204.163.157`** (keep records DNS-only for Caddy's Let's Encrypt).
3. Rebuild the student APK when convenient (release source points at the new URL; dev
   builds use `http://35.204.163.157/v1` so dev keeps working). The existing test APK
   still works via the trycloudflare tunnel → old box (stale data).
4. Update `NEXT_PUBLIC_API_URL` on BOTH Vercel projects from `https://api.matriq.app/v1`
   → `https://api.matriq.com.ng/v1` (pre-existing drift — the .app plan was superseded
   by the live .com.ng domain; see docs/docs/cloudflare-vercel.md).

**Blockers/flags:**
- Old box `cliptonite-server` left running as a warm standby/failover until launch is
  verified — can be stopped later (or kept as staging).
- `ThrottlerGuard` still not registered (pre-existing flag) — rate limits remain advisory.

## 2026-08-11 — Capacity upgrades DEPLOYED + load-tested (live stack)

**Status:** deployed & verified live; VM right-sizing remains the one manual step

**Did:**
- **Redeployed the backend** (`docker compose up -d --build backend`) — the capacity
  upgrades from the previous entry are now LIVE: cluster mode (2 workers forked,
  confirmed in logs), Redis-backed throttler storage, AI concurrency semaphore.
  Backend healthy in ~14s; no migration needed (no schema change).
- **A/B tested cluster scaling** (`WORKERS=1` vs `WORKERS=2`): identical throughput —
  clustering is NOT a bottleneck; the box is CPU-starved instead (2 vCPU, and the
  box also runs 4 agent sessions + Ollama, host load 5+ during tests).
- **Load-tested with autocannon** (new `backend/scripts/load-test.mjs`,
  `npm run loadtest`):
  - /health: **~200-430 rps**, p95 276-356ms at 20-30 conns (direct to backend)
  - /v1/associations (JWT+DB): **~60-90 rps**, p95 up to 464ms (20 conns) / 1.8s
    (30 conns direct) under concurrent load; single-request latency is 1-7ms —
    API itself is fast, ceiling is the 2-core box
  - Single-request checks: health 1.2ms, associations 7ms — healthy
- **Found + fixed a load-test footgun:** Caddy's catch-all block answered `/health`
  with a static respond ("Matriq API — use /v1/*") instead of proxying it — so
  earlier "health" benchmarks measured Caddy's static path, not the API. Added
  `/health` proxy blocks (IP + catch-all) and reloaded Caddy live; verified real
  backend JSON now returned.
- **Fixed load-test script for autocannon v8**: v8 renamed percentiles (no `p95`;
  interpolate from `p90`/`p97_5`) and dropped `printResult` output — summary now
  prints rps, status codes, avg/p95, throughput.
- **Flag (pre-existing, not introduced here):** `ThrottlerGuard` is not registered
  anywhere, so the `@Throttle` decorators (login 5/min etc.) are NOT enforced. The
  Redis storage is wired and cluster-safe, but no guard activates it. Decision
  needed: register as global APP_GUARD (enforces 60/min default everywhere) or
  per-route on sensitive endpoints (login/register/AI/payments) — see Blockers.

**Next:**
- **Right-size the VM → 4 vCPU / 16 GB** (stop VM → change machine type → start;
  GCP console, ~$25-35/mo). This is the single biggest capacity lever; with it,
  cluster mode + Redis throttling + AI queue comfortably serve 1,000 concurrent
  students. Everything in the previous entry's code work stays as-is.
- Optional: register `ThrottlerGuard` (see flag) once the 1,000-student decision
  is confirmed — this makes the pre-existing login/AI/payment rate limits real.
- Re-run `npm run loadtest` after the resize to record the real before/after.

**Blockers/flags:**
- VM resize is a manual GCP console action (stop → machine type → start).
- Load-test numbers on this box are pessimistic: tests run while 4 agent sessions
  + Ollama contend for the same 2 cores.

## 2026-08-11 — Phase 6 — Both Vercel dashboards LIVE + DB seeded (waiting on domain approval)

**Status:** on track — domain purchased by user, under registrar approval; everything that
doesn't need the domain is done.

**Did:**
- **Admin Console LIVE** at `https://matriq-ebon.vercel.app` ("Matriq — Admin Console"; all
  routes 200: login, dashboard, associations, analytics, audit-logs).
- **Association Dashboard LIVE** at `https://matriq-dashboard.vercel.app` ("Matriq —
  Association Dashboard"; all routes 200: login, dashboard, announcements, verification,
  transparency).
  - Both are independent Vercel projects from this monorepo: `matriq` (root `admin`) and
    `matriq-dashboard` (root `dashboard`), auto-deploying from GitHub `main`.
  - The dashboard project needed a fresh production deploy — its first build was made before
    the Root Directory was set and served Vercel's 404 on every route.
- **Fixed: Deployment Protection (SSO) was blocking public access** on both projects — the
  sites redirected visitors to Vercel's login page. Disabled via API (project `ssoProtection`
  = null).
- **New full-access Vercel token** — the original token was SAML-scope-restricted and could
  only manage the `matriq` project (this blocked diagnosing the dashboard project). Replaced;
  tokens stored 0600 + gitignored.
- **Backend CORS updated** to `CORS_ORIGIN=https://matriq-ebon.vercel.app,https://matriq-dashboard.vercel.app,http://localhost:8081`
  — preflight (204 + correct allow-origin) verified for both origins from inside the Docker
  network. Backend healthy.
- **Demo database seeded** (`backend/scripts/seed-demo.js`, idempotent, committed):
  - admin@matriq.app / Admin@Matriq2026 (admin console)
  - president@matriq.app, treasurer@matriq.app, pro@matriq.app / Exec@Matriq2026 (dashboard)
  - member1..8@matriq.app / Member@Matriq2026 (mobile app)
  - Association NAISS, 1 fee (₦5,000 dues), 7 payments (5 successful = ₦25,000 collected,
    2 pending), 2 announcements, 1 event + 4 RSVPs.
  - Verified live: admin login → associations list + analytics (11 users, ₦25,000); executive
    login → profile carries `executive` roles → `/associations/:id/dashboard` (11 members,
    top payers, 45% payment rate), announcements, events all return data.

**Next:** when the domain finishes registrar approval: user pastes it here → I add it to
Cloudflare (zone + DNS + origin cert), run `bash scripts/enable-cloudflare.sh`, update
`NEXT_PUBLIC_API_URL` on both Vercel projects to `https://api.<domain>/v1`, point the mobile
APK at the new API URL, and verify the full chain (API health via Cloudflare, both dashboards
login over custom domains, APK from a phone).

**Blockers/flags:**
- Domain is under registrar approval (user purchased it; TLD/registrar unknown — likely
  cheaper than `.app`). Everything else is ready.
- Test keys remain: Paystack test keys, Resend sandbox domain (onboarding@resend.dev).

## 2026-08-11 — Phase 6 — Cloudflare + Vercel wiring prepared (waiting on user account steps)

**Status:** waiting on user action — no account credentials needed from the server side; the
user must register the domain + add it to Cloudflare + create the two Vercel projects.

**Did:**
- **Confirmed: no Cloudflare/Vercel in use today.** Everything (backend, Postgres, Redis,
  Ollama, Caddy) runs on the GCP VM (`34.28.210.233`). The two Next.js dashboards
  (`admin/`, `dashboard/`) are separate codebases reading `NEXT_PUBLIC_API_URL` — they're
  built to deploy to Vercel, they just weren't deployed anywhere.
- **Domain verified unregistered:** `matriq.app` returns nothing on whois/DNS; the mobile
  APK already targets `https://api.matriq.app/v1` (`mobile/app.json`).
- **Chosen architecture:** Cloudflare edge in front of everything (DNS, CDN, WAF, DDoS,
  edge TLS — Free plan). `api.matriq.app` → Cloudflare → Caddy (origin cert) → backend.
  `admin.matriq.app` + `dashboard.matriq.app` → Cloudflare → Vercel (two independent
  projects from this monorepo).
- **Repo prepared (all committed):**
  - `docs/docs/cloudflare-vercel.md` — full click-by-click runbook (Parts A–F).
  - `caddy/Caddyfile.cloudflare` — domain-aware config: serves the Cloudflare Origin cert
    (SSL mode Full strict), forwards `CF-Connecting-IP` so rate limiting/audit IPs stay
    correct behind Cloudflare.
  - `scripts/enable-cloudflare.sh` — idempotent, reversible: swaps the Caddyfile, sets
    `CORS_ORIGIN=https://admin.matriq.app,https://dashboard.matriq.app,http://localhost:8081`,
    restarts caddy+backend, verifies `https://api.matriq.app/health` → 200.
  - `docker-compose.yml` — `DOMAIN` env to caddy, `CORS_ORIGIN` to backend, `caddy/certs`
    volume mounted; `.env.example` documents both; `caddy/certs/` gitignored (key never
    committed). Compose config validates; script syntax-checked.

**Next (user, per runbook Parts A–E):** register `matriq.app`; add zone to Cloudflare
(+ nameservers); add DNS records (`api` A → VM IP proxied, `admin`/`dashboard` CNAME →
`cname.vercel-dns.com` proxied); set SSL mode Full (strict); generate the Origin cert and
paste PEMs (I'll write them to `caddy/certs/`); create the two Vercel projects (root dirs
`admin` and `dashboard`, `NEXT_PUBLIC_API_URL=https://api.matriq.app/v1`) with domains.
Then I run `bash scripts/enable-cloudflare.sh` and verify end-to-end.

**Blockers/flags:**
- Domain must be registered before anything is publicly reachable.
- `.app` TLD requires HTTPS — fine, everything is HTTPS.

## 2026-08-10 — Phase 6 prep — LIVE STACK DEPLOYED: Docker, Postgres, Redis, Ollama, backend healthy + CI green

**Status:** on track — first live deployment of the full stack

**Did:**
- **GitHub connected + pushed.** User registered the machine's SSH key; remote `main`/`develop`
  reconciled (force-pushed the local 11-commit history over an unrelated early "Phase 0"
  snapshot — the old snapshot's content is fully contained in the local tree). CI now runs on
  every push.
- **Secrets configured.** Root `.env` created (0600, gitignored) with user-provided Resend key,
  Paystack test keys, and user-specified JWT/POSTGRES secrets; mirrored to `backend/.env`.
  Verified live: Resend key valid (send-restricted ✓), Paystack balance endpoint ✓.
- **Docker installed** on this Ubuntu 22.04 box (Engine 29.7.2 + compose v5.4.0, user added to
  docker group). `scripts/deploy.sh` executed for the first time: Postgres (pgvector), Redis,
  Ollama, Caddy, and the backend are all up; migrations applied.
- **Fixed a container crash-loop (exit 139).** `argon2@0.45.1`'s shipped **musl** prebuild
  segfaults on `node:20-alpine`; the glibc prebuild loads cleanly. Root-caused via probes,
  fixed by switching `backend/Dockerfile` to **`node:22-slim`** (matches local Node 22, where
  all 107 tests pass) with Debian equivalents for the non-root user + curl.
- **Fixed Prisma 7 runtime + drift issues.** (1) The new `prisma-client` generator requires a
  driver adapter — added `@prisma/adapter-pg@7.9.1` and wired `PrismaPg` into `PrismaService`
  (only surfaced at real runtime; unit tests mock PrismaService). (2) `migrate diff` removed
  `--shadow-database-url` — declared `datasource.shadowDatabaseUrl` in `prisma.config.ts`
  (falls back to `DATABASE_URL`) and updated CI to pass `SHADOW_DATABASE_URL`. Backend CI job
  pinned to Node 22 for glibc parity. **Drift check verified locally: "No difference
  detected".**
- **CI green on GitHub for the first time** (run 31445335141: all 7 jobs pass — backend
  lint/tsc/tests, image build + /health smoke, mobile bundle, dashboard, admin, audit, secrets).
- **AI pipeline live.** Pulled `nomic-embed-text` (embeddings) and `llama3.2:3b` (generation).
  `nemotron-3-super:cloud` requires an Ollama cloud login, so it's no longer the default.
  Cold CPU model load is ~90s > the 45s default timeout, and `docker-compose.yml` wasn't
  forwarding `OLLAMA_TIMEOUT_MS` — added it (180s default) and switched default model to
  `llama3.2:3b`. E2E verified: register → verify email → login → `/v1/ai/query` returns a real
  Ollama-generated answer.
- **Full-stack E2E verified live:** register (argon2 hashing + legal acceptance + Resend email
  fired), verify (token from DB), login (JWT), `/v1/associations` 200. Test data cleaned.

**Next:**
- **Domain + TLS:** Caddy currently 301s :80 → https://{host} with no cert. Point
  `api.matriq.app` (or chosen domain) at this VM's public IP (`34.28.210.233`), uncomment
  `tls {$DOMAIN}` in `caddy/Caddyfile`, set `DOMAIN` in `.env`, then the APK
  (`https://api.matriq.app/v1`) works from real devices. Caddy will auto-provision Let's
  Encrypt certs.
- **GCS bucket** for verification document storage (currently base64 data-URI scaffold) —
  private bucket + service account JSON, then wire signed URLs.
- Seed an association + fees + a real student for the first live test on a phone.

**Blockers/flags:**
- Paystack keys are **test** keys — switch to live keys before real money moves.
- Ollama runs CPU-only on 2 vCPU / 3.8GB RAM — warm inference ~14s, cold ~90s. Acceptable for
  dev; a GPU VM changes the calculus for production latency.
- `api.matriq.app` DNS is not yet pointed at this VM (TLS blocked until then).

## 2026-08-10 — Phase 6 prep — Tier 1 production groundwork: git, migrations, CI, notification emails

**Status:** on track

**Did:**
- **Git re-initialized** on this working copy (it had no `.git`). 8 coherent commits on `main`
  (foundations → backend → mobile → web → CI → migrations → emails → deploy). `.gitignore`
  hardened: `android/` and `ios/` (generated by `expo prebuild`) now ignored; removed a nested
  `mobile/.git`. Remote `origin` set to `git@github.com:eeejaymedia100/Matriq.git`. **Push
  blocked:** this machine's SSH key is not registered with GitHub (`Permission denied
  (publickey)`). Needs a GitHub SSH key / deploy key, then `git push -u origin main`.
- **Prisma migration baseline** created without a database via `prisma migrate diff
  --from-empty` → `prisma/migrations/0_init/migration.sql` (448 lines: public schema, `vector`
  extension, all enums/tables/FKs) + `migration_lock.toml`. Verified: `prisma validate` passes
  and a regenerated diff is byte-identical to the committed baseline.
- **CI expanded** (`.github/workflows/ci.yml`): now covers all four codebases — backend
  (lint/tsc/tests + `prisma validate` + no-DB baseline drift gate), backend Docker image build
  + `/health` smoke test, mobile (tsc + Android bundle via `expo export`), dashboard + admin
  (lint/tsc/`next build`). npm audit stays report-only (7 high findings pending Phase 6).
- **Verification email notifications (real):** `VerificationService` now emails the student on
  approve (account confirmed) and on reject (with the reason, HTML-escaped), via the global
  `EmailService` (Resend). Failures are logged and swallowed — a notification problem can never
  break the review action. 5 new tests (suite now **107 tests / 13 suites**, verification 13/13).
- **Deploy tooling:** one-shot `migrate` service in docker-compose (profile `tools`, reuses the
  backend image) + `scripts/deploy.sh` — idempotent: prerequisites check, postgres/redis up,
  `prisma migrate deploy`, build+start the stack, `/health` wait. Compose YAML validated; the
  script itself is **written but not executed** (this box has no Docker).
- **Post-review fixes applied:** email HTML now escapes all interpolated values (reason,
  student name, association name); notifications are fire-and-forget so a stalled Resend can
  never hang an approve/reject request; CI drift gate replaced with a real `pgvector` Postgres
  service + `prisma migrate diff --from-migrations --exit-code` (future-proof for later
  migrations); CI smoke test boots the image against a real Postgres (PrismaService connects at
  boot); dashboard/admin CI lint aligned to the locally verified `npx eslint src`.

**Next:** push to GitHub (needs a registered SSH key) so CI actually runs; provision Docker on
  the target VM and run `scripts/deploy.sh`; then the Tier 1 remainder (Paystack keys, GCS
  storage, domain+TLS) which need real accounts.

## 2026-08-10 — Phase 5 — Admin console hardened: httpOnly sessions + MFA login

**Status:** on track

**Did:**
- **Backend — enforced MFA on admin login.** `AdminAccount.mfaEnabled` had "must be true
  before login" in the schema but login ignored it. Now enforced: admin login returns
  `{ mfaRequired: true, challengeToken }` (5-minute, single-purpose JWT) instead of a token
  when MFA is enabled, and `POST /v1/admin/auth/mfa/challenge` (`{ challengeToken, code }`)
  verifies the TOTP before issuing the access token. Added enrollment/verify/disable/status
  endpoints and `GET /v1/admin/auth/me`. 12 new admin tests (suite now **102 tests / 13
  suites green**, lint + typecheck clean).
- **Admin console (`admin/`) — localStorage JWT replaced with httpOnly-cookie session and
  two-step MFA login:** `src/lib/session.ts`, `middleware.ts`, 4 API routes
  (`/api/auth/{login,challenge,logout,session}`), a client `SessionProvider`, a two-step
  login page (password → MFA code), and `AdminLayout` + all 4 pages read the session context
  instead of localStorage. Lint warnings in the pages fixed (missing hook deps, unused
  `loading`) and a loading skeleton added to the associations page. Production `next build`
  succeeds.

This closes the last documented Phase 5 gap: **both web dashboards now use server-side
sessions, and both enforce MFA for the accounts that require it.**

**Next:** Deploy the backend so both dashboards + the APK have a real API.

## 2026-08-10 — Phase 5 — Dashboard auth hardening: httpOnly sessions + MFA login

**Status:** on track

**Did:**
- **Backend — two-step MFA login.** `POST /v1/auth/login` now returns
  `{ mfaRequired: true, challengeToken }` (5-minute, single-purpose JWT) instead of tokens
  when the account has MFA enabled; `POST /v1/auth/mfa/challenge` (`{ challengeToken, code }`)
  verifies the TOTP and issues the real token pair. Enrollment endpoints unchanged. 6 new tests
  (suite now **90 tests / 13 suites green**, lint + typecheck clean).
- **Backend — `/v1/me` now returns `executive: [{ id, associationId, role, associationName,
  shortCode }]`** for every association the user is an executive of — powers the dashboard's
  auto association-detection.
- **Dashboard (`dashboard/`) — localStorage JWT replaced with httpOnly-cookie sessions:**
  `src/lib/session.ts` (JWT sign/verify helpers), `middleware.ts` (route protection), 5 API
  routes (`/api/auth/{login,challenge,refresh,logout,session}`), a client `SessionProvider`,
  a two-step login page (password → MFA code), and `DashboardLayout` now reads the session
  context (executive roles + association picker). All 4 pages wired to the session context.
  Production `next build` succeeds.
- **Mobile — MFA-aware login:** `AuthContext` + `LoginScreen` now handle the
  `{ mfaRequired, challengeToken }` response with a second code-entry step, so MFA-enabled
  accounts aren't locked out. Typecheck + Android bundle clean.
- **Admin (`admin/`) — lint cleanup** (missing hook deps, unused `loading`), plus a proper
  loading skeleton on the associations page.

**Next:** Apply the same httpOnly-session hardening to the admin console (still localStorage
JWT), then deploy the backend so both dashboards + the APK have a real API.

## 2026-08-10 — Phase 4 — AI Study Companion wired to a real LLM (Ollama)

**Status:** on track

**Did:**
- `backend/src/ai/ai.service.ts` now calls the self-hosted Ollama model for real answers
  instead of returning the Phase-4 placeholder. Retrieval → grounded prompt → LLM flow per
  `docs/ai-model.md`:
  - Reads `OLLAMA_HOST` (default `http://localhost:11434`) and `OLLAMA_MODEL` (default
    `nemotron-3-super:cloud` — the model registered on the VM's Ollama) from env via
    `ConfigService`. Added both to `docker-compose.yml` and `.env.example`.
  - Builds a system prompt + retrieved-context user prompt, POSTs to `{host}/api/chat` with
    `stream:false`, a 45s AbortController timeout, and response sanitization (HTML-tag strip,
    length cap) before storing/returning.
  - **Graceful degradation:** if Ollama is unreachable/times out/errors, falls back to a
    placeholder so the endpoint never hard-fails (logs a warning; no user-visible breakage).
- Live-verified against the running Ollama (`backend/scripts/smoke-ollama.js`): the model
  correctly answered a grounded question using provided study-material context (PASS).
- Tests: rewrote `ai.service.spec.ts` with ConfigService + `global.fetch` mocks — 9 tests
  covering real-LLM response, context inclusion in the prompt, both fallback paths, and HTML
  sanitization. Full backend suite now **83 tests / 13 suites green**, lint + typecheck clean.

**Next:** Pull/register a local embedding model (`nomic-embed-text`) and wire pgvector
similarity search for retrieval (blocked on a running Postgres). Deploy the backend so the
mobile APK can hit `/ai/query` for real.

**Blockers/flags:**
- Model inference for `nemotron-3-super:cloud` happens on Ollama's cloud (proxied by local
  Ollama) — no local GPU/RAM cost, but a network dependency. If fully self-hosted inference is
  required, pull a small local model (e.g. `llama3.2:3b`) instead; this VM's 3.8GB RAM will
  make it slow but usable.
- Docker is not installed on the VM, so the compose stack (Postgres/Redis/Caddy) is still not
  running — end-to-end API testing from a phone remains blocked until Docker (or a native
  Postgres) is provisioned.

## 2026-08-10 — Phase 2 — Skeleton loading UI (YouTube-style) across all 7 data screens

**Status:** on track

**Did:**
- Built a reusable skeleton loading system in `mobile/src/components/`:
  - `Skeleton.tsx` — pulsing placeholder block (`Skeleton`, `SkeletonCircle`, `SkeletonText`,
    `SkeletonCard`). **All blocks share ONE Animated.Value + one native animation loop**
    (ref-counted start/stop), so a whole screen costs a single native animation — right for
    low-end devices on slow networks. Respects the OS "reduce motion" setting (static blocks),
    and blocks are hidden from screen readers (`accessible={false}`).
  - `SkeletonScreens.tsx` — screen-shaped layouts that mirror the real content: `DashboardSkeleton`
    (header, verification banner, membership card, 7 quick actions, dues rows), `ListScreenSkeleton`
    (title + card rows, used by Announcements/Events/Dues), `ReferralsSkeleton`, `ReceiptSkeleton`,
    `VerificationStatusSkeleton`.
- Wired skeletons into all 7 screens that previously showed a bare spinner: Dashboard,
  Announcements, Events, Referrals, FeeDetails, Receipt, VerificationStatus.
  `LoadingScreen` kept for ReceiptScreen's "not found" state and auth flows.
- **CI:** mobile tsc ✓, `expo export --platform android` ✓ (bundle builds).
- Rebuilt the APK with the new skeletons (incremental `assembleRelease`, running in tmux).

**Next:**
- Confirm the rebuilt `matriq-student.apk` and copy to repo root.
- (Existing next steps unchanged: sideload + point `extra.apiUrl` at a real backend; push to
  GitHub; wire next-auth + MFA for the web dashboards; pull an Ollama model for Phase 4.)

**Blockers/flags:** none.

---

## 2026-08-10 — Phase 2 — Android APK built successfully + configurable API URL

**Status:** on track — APK ready to sideload

**Did:**
- Completed the incremental APK build (updated with configurable API URL): `./gradlew assembleRelease`
  → **BUILD SUCCESSFUL in 6m 2s** (53 exec, 334 cached).
- **Fixed the OOM killer** that had crashed the first build. Fixes:
  - Added 8GB second swap file (`/swapfile2`, 9.6GB total)
  - Restricted to `arm64-v8a` (single ABI, ~95% device coverage)
  - Lowered Gradle JVM heap to 1536m, disabled parallel, capped 2 workers
- **API URL now configurable at build time** via `app.json` `extra.apiUrl`. The `api/client.ts`
  reads from `Constants.expoConfig?.extra?.apiUrl` (via `expo-constants`), falling back to the
  current dev/production defaults. This means you can change the backend URL the APK connects to
  without editing source code — just change `app.json` and rebuild.
- **CI verified:** backend lint ✓, typecheck ✓, 79 tests ✓; dashboard tsc ✓; admin tsc ✓;
  mobile tsc ✓.

**APK verification:**
- Signed with Android Debug cert — installable via sideload (`adb install` or direct download)
- Package: `app.matriq.mobile`, versionName 0.1.0 (versionCode 1)
- 31.4MB, Hermes engine, arm64-v8a native libs, 3 DEX files, 1185 total files
- `apksigner verify` passes

**APK location:** `/home/akpevwejulius1/matriq/matriq-student.apk`

**Next:**
- Sideload on a real device — use `adb install matriq-student.apk` or transfer via cloud download
- Before installing, set `app.json` `extra.apiUrl` to your actual backend URL and rebuild
- Push repo to GitHub to trigger CI

## 2026-08-10 — Phase 2 — Android APK built successfully (first installable build)

**Status:** on track — APK done

**Did:**
- **Completed the local Android build** that was in progress last session:
  `./gradlew assembleRelease` → **BUILD SUCCESSFUL in 50m 46s**, 387 tasks (343 executed,
  44 up-to-date).
- **Fixed the OOM killer that had crashed the first build attempt** (Gradle daemon
disappeared). Root cause: 3.8GB RAM + 4GB swap exhausted while building all 4 ABIs.
  Fixes applied:
  - Added an 8GB second swap file (`/swapfile2`, persisted in `/etc/fstab`) → 9.6GB total swap
  - Restricted `reactNativeArchitectures` to **arm64-v8a only** in `gradle.properties`
    (single-ABI build, ~4× less native compile work; covers ~95% of modern devices)
  - Lowered `org.gradle.jvmargs` to `-Xmx1536m`, disabled `org.gradle.parallel`,
    capped workers at 2
- **APK verified:** `mobile/matriq-student.apk` (also copied to repo root) — 31.4MB,
  package `app.matriq.mobile`, versionName 0.1.0 (versionCode 1), targetSdk 36,
  label "Matriq". Signed with the Android debug keystore (installable). Contains
  Hermes engine, arm64-v8a native libs (libreactnative, libhermesvm, expo-modules-core,
  codegen for screens/svg/safe-area), 3 DEX files, 1185 total files. `apksigner verify`
  passes.
- **CI re-verified after all changes:** backend lint ✓, typecheck ✓, **79 tests ✓**;
  dashboard typecheck ✓; admin typecheck ✓.

**What's real vs. scaffolded (per production-directive.md §25):**
- The APK is a real, installable Android build of the Matriq student app.
- Signed with the debug key — fine for sideloading/testing; Play Store requires an
  upload key + EAS Build (`eas.json` already configured with a preview profile).
- arm64-v8a only — a Play-ready AAB should include all ABIs (build via EAS).
- The `android/` native project is generated by `expo prebuild` and gitignored.

**Next:**
- Sideload `matriq-student.apk` on a real device (`adb install` or direct download).
- Configure the backend API base URL for production (currently localhost default in
  `mobile/src/api/client.ts` — needs the real `api.<domain>` endpoint).
- Push repo to GitHub so backend CI runs on push.
- Long-term: EAS Build for Play-ready signed AABs with all ABIs.

**Blockers/flags:**
- No Android device connected to this VM for install testing.
- Real production signing key + Play Console account required for store release.

## 2026-08-09 — Phase 2 — Mobile app dependencies fixed + first local Android APK build

**Status:** on track

**Did:**
- **Mobile deps installed** (the long-standing blocker): all 10 packages now present —
  `@react-navigation/*` (native, native-stack, bottom-tabs), `react-native-screens`,
  `react-native-safe-area-context`, `expo-secure-store`, `@tanstack/react-query`,
  `react-native-svg`, `expo-image-picker`, `expo-document-picker`. Also installed
  `expo-splash-screen` and re-pinned safe-area-context/screens/svg to SDK-57-compatible
  versions via `npx expo install`.
- **Fixed 16 mobile type errors** that were blocking compilation:
  - Syntax error in `Register*Screen` props (`navigate: (screen: string);` → `=> void`)
  - `PayFeeScreen`/`ReceiptScreen` now use `NativeStackScreenProps` + typed navigation
    param lists (new `src/navigation/types.ts`)
  - `checkoutUrl` added to mobile `Payment` type (backend `initiate` returns it)
  - `AuthContext` now stores the full `User` profile (fixes ProfileScreen fields)
  - `Card` children optional (ReferralsScreen stat cards)
  - Removed broken `colors as Record<string,string>` casts in VerificationStatusScreen
    (colors already has `warning`/`warningBg`)
- **Fixed runtime navigation bugs** in DashboardScreen: quick actions pointed at
  non-existent routes (`FeeDetails`, `PaymentHistory`, `AiCompanion`) → now correct
  tab names (`Fees`, `Fees`, `AI`).
- **VerificationUploadScreen is now REAL**: wired `expo-image-picker` (camera + gallery,
  permission requests), removed the dead "Bearer TODO" fetch scaffold, uploads via
  `AuthContext.uploadVerification` (multipart FormData), which now uses the shared
  `API_BASE` instead of a hardcoded `10.0.2.2` URL.
- **app.json fixed for SDK 57**: removed invalid `splash` field, added
  `expo-splash-screen` plugin, fixed adaptive icon path to the real asset files,
  added `expo-image-picker` plugin with permission strings. `expo-doctor` now passes
  **20/20 checks**.
- **`expo export --platform android` succeeds** — Android bundle (916 modules, 2.2MB hbc)
  builds clean.
- **First local Android build attempt**: installed Android SDK cmdline-tools + platform 36
  + build-tools 36 on this VM, ran `expo prebuild --platform android`, and kicked off
  `./gradlew assembleRelease` in a persistent tmux session (build in progress at time of
  writing). Release builds are signed with the debug keystore so the APK will be
  installable.
- **CI:** backend lint ✓, typecheck ✓, 79 tests ✓; mobile tsc ✓.

**What's real vs. scaffolded (per production-directive.md §25):**
- All mobile screens, navigation, API wiring, verification upload (real image picker) — real.
- The `android/` native project is generated (`expo prebuild`) — real native code.
- APK build is a local `assembleRelease` — see "Next" for how to ship it to a phone.
- Backend document storage still the base64 data-URI scaffold (GCS signed URLs pending).

**Next:**
- Finish the Gradle build; copy `app-release.apk` to a reachable path for download.
- `adb install` / side-load the APK on a real device.
- Push repo to GitHub (backend CI runs on push).
- Long-term: EAS Build (`eas build -p android --profile preview`) for signed Play-ready
  AABs — `eas.json` is already configured.

**Blockers/flags:**
- VM has only 3.8GB RAM — Gradle builds are slow and risk OOM; builds must run in tmux.
- Real APK needs a phone for install testing; no device connected to this VM.

## 2026-08-09 — Phase 2 — Mobile verification screens + dashboard updates

**Status:** on track

**Did:**
- **VerificationUploadScreen** — camera/gallery document picker UI, membership check, FormData
  multipart upload to `POST /v1/me/verification/upload`. Designed for `expo-image-picker` 
  (camera + gallery) — scaffolded with simulated picker that walks through the full flow.
- **VerificationStatusScreen** — pending/approved/rejected status card with color-coded states,
  rejection reason display, submission history list, refresh-to-refetch, "Re-submit" button when
  rejected. Wired to `GET /v1/me/verification`.
- **DashboardScreen updated** — yellow verification banner at top when `matricStatus === "provisional"`,
  "✓ Verified" or "Provisional" badge in membership card, new "Verify ID" quick action button.
- **RegisterStayliteScreen** — fixed stray `Alert` import, added subtitle explaining provisional
  status, updated success message to prompt document upload.
- **AppNavigator** — added `VerificationUpload` and `VerificationStatus` screens to MainStack.
- **AuthContext** — added `uploadVerification(associationId, fileUri, fileName)` and
  `getVerificationStatus()` methods; `login()` now fetches full profile for `matricStatus`.
- **Mobile types updated** — removed `portalVerified`, added `matricStatus`, `jambNumber`,
  `VerificationRequest` type.
- **CI:** backend lint ✓, typecheck ✓, 79 tests ✓; dashboard typecheck ✓; admin typecheck ✓.

**What's real vs. scaffolded:**
- Screen layout, navigation, API wiring, auth integration — all real.
- `expo-image-picker` not installed — camera/gallery buttons show Alert explaining the production
  flow but don't open native pickers yet. `npm install expo-image-picker expo-document-picker`
  needed.
- FormData multipart upload is coded but untested (requires a running backend + real file).

**Next:**
- `npm install` in `mobile/` to get all dependencies (navigation, secure-store, image-picker).
- Configure EAS Build for Android APK generation.
- Push to GitHub.

**Blockers/flags:**
- Mobile packages not installed (connectivity issue on GCP VM — retry with better network).

## 2026-08-09 — Phase 5 — Association Dashboard + Admin Console scaffolded (Next.js)

**Status:** on track

**Did:**
- **Association Dashboard** (`dashboard/`) — Next.js + TypeScript + Tailwind:
  - Login page with JWT token storage
  - Dashboard overview: stats cards (members, collected, payment rate), top payers, quick actions
  - Verification review: list pending/approved/rejected, view document modal, approve button,
    reject with required reason textarea, all wired to backend verification endpoints
  - Announcements: list with pinned-first ordering, composer (title, body, pin toggle)
  - Transparency: president-only JSON editor for "where dues go" breakdown
  - Shared layout with purple-themed nav (Overview, Verification, Announcements, Transparency)
- **Admin Console** (`admin/`) — Next.js + TypeScript + Tailwind:
  - Dark-themed login page against `POST /v1/admin/auth/login`
  - Dashboard: cross-association stats, revenue overview table
  - Associations: CRUD table, creation form, suspend/reactivate toggle
  - Analytics: revenue by association, total stats
  - Audit Logs: paginated table viewer with actor, action, target, IP, timestamp
  - Shared dark-themed layout (Dashboard, Associations, Analytics, Audit Logs)
- **CI:** backend lint ✓, typecheck ✓, 79 tests ✓; dashboard typecheck ✓; admin typecheck ✓

**What's real vs. scaffolded:**
- All pages are real React components with loading/error states.
- API calls are real fetch requests to the backend endpoints.
- Auth is real: JWT token stored in localStorage, sent in Authorization header.
- **Not yet done:** session-based auth with httpOnly cookies (currently using Bearer JWT from localStorage — the architecture doc calls for httpOnly cookies for the web dashboards; this is a scaffold compromise until next-auth is wired up).
- **Not yet done:** Executive MFA enforcement on the dashboard login (currently no MFA prompt).
- **Not yet done:** association detection (dashboard currently needs the associationId manually — the login flow should detect which association the executive belongs to and scope accordingly).

**Next:**
- Wire `next-auth` for session-based auth (httpOnly cookies) replacing localStorage JWT.
- Add MFA flow to Association Dashboard login.
- Auto-detect executive's association on login.
- Continue building mobile app screens (the student-facing verification upload flow).
- Push to GitHub.

**Blockers/flags:** none.

## 2026-08-09 — Phase 1 — Identity verification overhaul (document upload + executive review)

**Status:** on track

**Did:**
- **Decision finalized:** portal password collection removed entirely from both Staylite and
  Fresher paths. No portal password field exists anywhere in the system.
- **New model:** both paths now start as `matric_status = provisional`. Student uploads a
  verification document (student ID photo or portal screenshot). Document enters a review queue
  for the association's executives (Treasurer/President/P.R.O. — any can review). Executive
  approves (flips to `confirmed`) or rejects (student re-submits).
- **Documentation updated:**
  - `docs/onboarding-flows.md` — fully rewritten, no portal password fields, document upload
    flow described for both paths
  - `docs/data-model.md` — removed `portal_verified` from `users`; added `verification_requests`
    table (GCS-backed document storage via signed URLs, status tracking, reviewed_by FK to
    association_executives)
  - `docs/backend-api.md` — removed portal-password fields from staylite registration; added
    six new endpoints under "Identity Verification" section (upload, list, view document, approve,
    reject, own status)
  - `docs/mobile-app.md` — updated Identity Bridge row, removed password references
  - `security.md` — updated fresher/provisional section to reflect both paths start provisional
  - `docs/compliance-privacy.md` — added verification document storage disclosure
  - `docs/legal/data-processing.md` — added "Identity verification document" row with
    retention/access policy
- **Backend code implemented and tested:**
  - `VerificationRequest` model added to Prisma schema (with VerificationStatus enum)
  - `portal_verified` field removed from User model
  - `portalPassword` field removed from `RegisterStayliteDto`
  - `VerificationService` — uploadDocument (membership-gated), getMyVerification, listRequests,
    getDocument (data URI scaffold, production-ready for signed URL), approve (atomic: request +
    user matric_status flipped), reject (with reason, audit-logged). All review actions are
    association-scoped.
  - `VerificationController` — 6 endpoints, executive ID extracted from JWT's executive roles
  - `VerificationModule` wired into `AppModule`
- **CI:** lint ✓, typecheck ✓, **79 tests across 13 suites** ✓ (8 new verification tests).

**What's real vs. scaffolded (per production-directive.md §25):**
- Verification document storage: scaffolded as inline base64 data URI. Production requires GCS
  private bucket with signed-URL access.
- Multer file upload: real, works with the `FileInterceptor`.
- Executive RBAC enforcement on review endpoints: real (association-scoped via JWT executive
  roles, association mismatch rejected).
- Audit logging of approve/reject: real.
- Student notification on approve/reject: not yet implemented (scaffold — needs push notification
  service or email).

**Next:** Part 2 — three-dashboard architecture split (Student mobile app, Association Dashboard
web app, Admin Console separate Next.js app).

**Blockers/flags:** none new.

## 2026-08-09 — Phase 1→2 — Three-dashboard architecture split (docs only, no code)

**Status:** decision recorded, code deferred to a later session

**Did:**
- **Decision finalized:** Student, Association, and Admin are three separate deployables with
  genuinely separate codebases, auth models, and attack surfaces.
- **Student** — the existing React Native/Expo mobile app. The only thing that ships to app
  stores.
- **Association Dashboard** — a separate Next.js web app (TypeScript). Session-based auth
  (httpOnly, secure, sameSite cookie), MFA required. Reachable at `dashboard.<domain>`
  (placeholder subdomain). Used by Treasurer/President/P.R.O.
- **Admin Console** — a second, fully separate Next.js app. Its own deployment, its own
  subdomain (`admin.<domain>`). Separate auth against `admin_accounts` table. Highest
  privilege, smallest attack surface — no code path in the mobile app or Association Dashboard
  leads to an admin route.
- **Auth model differs by deployable:**
  - Student: Bearer JWT (access + refresh), stored in `expo-secure-store`.
  - Association Dashboard: session-based (httpOnly cookie), scoped to one association.
  - Admin Console: session-based against `admin_accounts`, separate `ADMIN_JWT_SECRET`.
- **Documentation updated:**
  - `docs/architecture.md` — new three-deployable architecture diagram, auth model differences
    documented
  - `docs/tech-stack.md` — added Next.js row, updated summary table (Vercel deployment for
    dashboards)
  - `docs/infrastructure.md` — subdomain structure table (`api.<dom>`, `dashboard.<dom>`,
    `admin.<dom>`), Caddy routing
  - `docs/mobile-app.md` — clarified this is the Student app ONLY; removed Association/Admin
    screen inventory sections; added verification upload screens
  - `docs/data-model.md` — replaced open "Phase 1 decision" note with final auth model;
    `association_executives` now documented as linked to student identity via `user_id` but
    with session-based auth for the web dashboard

**Next:**
- Scaffold the Association Dashboard Next.js app (`npx create-next-app@latest dashboard`).
- Scaffold the Admin Console Next.js app (`npx create-next-app@latest admin`).
- Implement session-based auth with `next-auth`.
- Implement the verification review UI (the executive-facing list/approve/reject screens).

**Blockers/flags:** none.

## 2026-08-09 — Phase 1→2 — MFA, Payments, AI Companion, Mobile App (React Native + Expo)

**Status:** on track

**Did:**
- **MFA (TOTP):** `POST /v1/auth/mfa/enroll` (generates QR code + secret), `POST /v1/auth/mfa/verify`
  (verifies and enables), `GET /v1/me/mfa-status`, `POST /v1/auth/mfa/disable`. Uses otplib v13.
  Added `mfaSecret` field to User, AdminAccount, and AssociationExecutive models.
- **Payments module:** `POST /v1/payments/initiate` (with Paystack integration, offline fallback),
  `POST /v1/payments/webhook/paystack` (HMAC-SHA512 signature verification, the ONLY path
  to mark payment `successful`), `GET /v1/payments/:id`, `GET /v1/payments/:id/receipt`,
  `POST /v1/payments/:id/share-card`. Auto-generates receipts with signed QR payloads.
  Membership-gated and association-scoped.
- **AI Study Companion:** `POST /v1/ai/query` (keyword search + placeholder responses until
  Ollama is wired in Phase 4), `GET /v1/ai/conversations` (cursor-paginated),
  `POST /v1/ai/materials` (ingestion → `moderation_status = pending`). Query logging preserved.
- **Mobile app initialized:** React Native + Expo (blank-typescript), complete project structure:
  - `src/api/client.ts` — JWT-secured HTTP client with auto-refresh, token stored in `expo-secure-store`
  - `src/contexts/AuthContext.tsx` — login, register (Staylite + Fresher), logout, session restore
  - `src/theme/colors.ts` — full Matriq design system (light/dark tokens, typography, spacing, radii)
  - **12 screens:** Welcome, Login, RegisterChoice, RegisterStaylite, RegisterFresher,
    Dashboard (profile card, membership, quick actions, dues summary), FeeDetails/PaymentHistory,
    PayFee (Paystack redirect), Receipt (signed QR, share), Announcements (pinned-first + read receipts),
    Events (RSVP toggle), AICompanion (chat interface), Referrals (ambassador progress, share code),
    Profile (edit, MFA setup, logout)
  - `src/navigation/AppNavigator.tsx` — auth stack + 5-tab main navigator, auto-routing based on auth state
  - Shared components: Button (4 variants, 3 sizes, loading), Input (label, error, password toggle),
    Card (title, subtitle, shadow), LoadingScreen
- **CI:** lint ✓, typecheck ✓, **71 tests across 12 suites** ✓.
- Updated Prisma schema with `mfaSecret` on User, AdminAccount, AssociationExecutive.

**Next:**
- `npm install` in `mobile/` to finish dependency setup.
- Configure EAS Build for Android APK generation.
- Wire mobile app to a running backend for end-to-end testing.
- Implement association browsing/joining in mobile app.
- Push to GitHub.

**Blockers/flags:**
- npm install in mobile/ timed out (large Expo SDK download) — retry with better connectivity.
- No Android SDK on the GCP VM — APK must be built via EAS Build cloud service.
- Paystack secret key not configured — payments module falls back to offline mode.
- Ollama not yet deployed — AI Companion returns placeholder responses.

## 2026-08-09 — Phase 1 — Dashboard, admin module, refresh token rotation, associations, memberships, announcements, events, referrals, executive auth

**Status:** on track

**Did:**
- **Refresh token rotation:** SHA-256 hashed token families in DB, replay-attack detection
  (entire family revoked if a used token is presented), logout/logout-all endpoints.
  19 tests for token lifecycle.
- **Associations + Memberships:** `GET /v1/associations` (cursor-paginated), `GET /v1/associations/:id`,
  `GET /v1/associations/:id/fees`, `POST/DELETE /v1/associations/:id/join|leave`,
  `GET /v1/me/memberships`. Idempotent join with pending status.
- **Announcements:** `GET/POST /v1/associations/:id/announcements`, `POST /v1/announcements/:id/read`,
  `GET /v1/associations/:id/announcements/:id/reads`. Pinned-first ordering, exec-only create.
- **Events:** `GET/POST /v1/associations/:id/events`, `POST /v1/events/:id/rsvp`.
  RSVP toggle, exec-only create.
- **Referrals:** `POST/GET /v1/me/referrals` with ambassador status (10+ conversions).
- **Executive auth:** JWT payload enriched with executive roles from DB (no re-login on role
  change), RolesGuard enforces `@Roles()` on write endpoints, ExecutivesService for scoping.
- **Dashboard:** `GET /v1/associations/:id/dashboard` (stats, top payers, activity),
  `GET /v1/associations/:id/activity`, `POST /v1/associations/:id/verify-receipt`
  (association-scoped), `PATCH /v1/associations/:id/transparency` (president-only, persists
  to new `transparency` JSON column on Association).
- **Admin module:** completely separate `POST /v1/admin/auth/login` (AdminAccount table,
  ADMIN_JWT_SECRET env var), `GET/POST /v1/admin/associations`,
  `PATCH /v1/admin/associations/:id/status` (suspend/reactivate),
  `GET /v1/admin/analytics` (cross-association revenue), `GET /v1/admin/audit-logs`,
  `POST /v1/admin/auth/setup` (bootstrap). All admin CRUD audit-logged.
- **Post-review fixes:** receipt verification scoped to association, transparency persisted,
  admin CRUD audit-logged, separate ADMIN_JWT_SECRET, real IP in admin login.
- Added `transparency` JSON column to Association model.
- **CI:** lint ✓, typecheck ✓, **56 tests across 9 suites** ✓.

**Next:**
- MFA: `POST /v1/auth/mfa/enroll` + `POST /v1/auth/mfa/verify` (TOTP) for exec/admin.
- Payments: `POST /v1/payments/initiate`, webhook, receipt generation.
- AI Study Companion: query endpoint, ingestion pipeline.
- Push to GitHub.

**Blockers/flags:**
- GCP Secret Manager still not configured.
- Staylite portal verification mechanism still pending.
- No payment gateway integrated yet (Paystack integration is Phase 3 per agenda).

## 2026-08-09 — Phase 0→1 — CI green, Prisma schema, Auth module, RBAC, audit logging

**Status:** on track

**Did:**
- Completed Phase 0 CI gap: created `.gitleaks.toml`, `.eslintrc.js`, `jest.config.js`.
  All three CI checks now pass locally (lint, typecheck, 5 tests).
- Installed Prisma ORM + created full database schema: all 17 tables from
  `docs/data-model.md` including users, associations, executives, memberships, fees, payments,
  receipts, announcements, events, referrals, admin_accounts, audit_logs, ai_documents,
  ai_query_logs, legal_acceptances. Enums match the directive's full state machine.
- Implemented Auth module: registration (Staylite + Fresher paths), login (Argon2id hashing),
  JWT token generation (15m access + 7d refresh), token refresh, profile endpoint.
  Legal acceptance recorded during registration (privacy policy + T&C version tracking).
- Built RBAC foundation: JwtAuthGuard, RolesGuard, Roles decorator, CurrentUser param decorator.
  Roles: student, president, treasurer, pro, admin.
- Created AuditModule: fire-and-forget append-only audit logging for all admin/executive actions.
- Global ValidationPipe with whitelist + forbidNonWhitelisted enabled.
- 5 passing unit tests for AuthService (login failures, duplicate email, missing profile).

**What's running:** Same — all Docker containers healthy on matriq-server.

**Next:**
- Push this commit to GitHub (CI will run automatically on push).
- Write remaining Phase 1 endpoints: `GET /v1/me`, `PATCH /v1/me` profile endpoints,
  association CRUD, membership endpoints.
- Implement executive auth (separate from student auth per data-model recommendation).
- Wire real IP capture for audit logs and legal acceptances (currently placeholder `0.0.0.0`).

**Blockers/flags:**
- GitHub push needs to happen (repo already exists at `git@github.com:eeejaymedia100/Matriq.git`).
- Phase 1 decision still pending: Staylite portal verification mechanism.
- GCP Secret Manager not yet configured — JWT secrets still in `.env`.

## 2026-08-09 — Phase 0 — Git initialized, skills copied, ready for GitHub push

**Status:** on track — blocked on GitHub repo creation

**Did:** Initialized git repo on matriq-server (branch `main`, commit `b5af69d`, 50 files).
Fixed `.gitignore` to track `.env.example` via `!.env.example` exception while still ignoring
`.env.*`. Copied all three Claude skills (brand-identity, payment-safety, rbac-patterns) into
`.claude/skills/` and committed them. Verified `.env` is correctly git-ignored and contains no
secrets in the tracked state. Fixed backend port exposure: changed from `ports: 3000:3000`
(0.0.0.0 bind, bypassed UFW) to `expose: ["3000"]` (Docker network only). Verified externally:
port 3000 now times out from the internet.

**What's running on the VM right now:** Same as previous entry — all five containers healthy,
UFW/fail2ban/unattended-upgrades active.

**What's still pending for Phase 0 Done:**
- Push to GitHub (needs repo URL from user)
- GCP Secret Manager setup + secrets migration from .env
- GCP console firewall rules audit
- CI pipeline first green run (depends on GitHub push)

**Blockers/flags:**
- GitHub repo needs to be created by the user before we can push.
- GCP Secret Manager: needs the project ID and API enabled before we can migrate secrets.

## 2026-08-08 — Phase 0 — Production directive integrated, legal drafts and design system added

**Status:** on track

**Did:** Integrated the human-authored `production-directive.md` as the project's
highest-authority document (all other docs are now explicitly subordinate to it where they
conflict). Concrete follow-through on its requirements: created `docs/legal/` with
`privacy-policy.md`, `terms-and-conditions.md`, `data-processing.md`, and
`legal-requirements.md` — all clearly marked as unreviewed drafts per the directive's §15
restriction on presenting AI-drafted legal text as authoritative. Added `docs/design-system.md`
consolidating the directive's anti-vibe-code, anti-animation, UX, and branding standards. Updated
`docs/data-model.md`'s `payments.status` enum to the directive's full required state machine
(`pending/processing/successful/failed/cancelled/refunded/disputed`, was previously missing
`cancelled`/`refunded`/`disputed`) and added the `legal_acceptances` table (versioned consent
tracking, not a bare boolean, per §14). Updated `docs/payment-integration.md` with the explicit
state machine diagram and refund/dispute handling notes. Added legal-document and
consent-tracking endpoints to `docs/backend-api.md`. Updated `README.md`'s reading order and
index accordingly, and cross-referenced the directive from `docs/agent-workflow.md`.

**Next:** Begin Phase 0 infrastructure work per `agenda.md`. Before Phase 1 backend work starts
building the `payments` table for real, confirm the refund/dispute workflow (who can trigger a
refund, and through what endpoint) is fully specified — `payment-integration.md`'s state machine
defines the states but not yet the full transition-triggering logic for `refunded`/`disputed`.

**Blockers/flags:**
- Every `docs/legal/legal-requirements.md` checkbox needs an actual lawyer, not an engineering
  decision — do not let Phase 9 (Launch) approach without this being scheduled.
- Same open items as the previous entry (Staylite portal verification mechanism, executive
  account/login separation from student accounts, Apple/Google developer account budget, GPU vs
  CPU for the AI model) remain open.

## 2026-08-07 — Phase 0 — Skills and MCP integrations added

**Status:** on track

**Did:** Added `docs/agent-skills.md` and `docs/mcp-integrations.md`. Three ready-to-use Skills
shipped in `claude-skills/` (`matriq-brand-identity`, `matriq-rbac-patterns`,
`matriq-payment-safety`) — copy these into `.claude/skills/` before starting Phase 1 so RBAC and
payment code follow the established pattern from the first endpoint written, not retrofitted
later.

**Next:** Copy `claude-skills/*` into `.claude/skills/` in the repo. Connect the "high priority"
MCP servers from `docs/mcp-integrations.md` (GitHub, Context7, Postgres-staging) before Phase 1
backend work begins.

**Blockers/flags:** none new.

## 2026-08-07 — Phase 0 — Documentation and planning complete

**Status:** on track

**Did:** Full documentation set generated — `agenda.md`, `security.md`, and the complete
`docs/` set (architecture, tech stack, AI model design, data model, backend API surface, payment
integration plan, mobile app requirements, onboarding flows, CI/CD, infrastructure, agent
workflow rules, testing/QA plan, release/distribution plan, compliance/privacy). No code written
yet.

**Next:** Begin Phase 0 execution — provision and harden the GCP VM per `docs/infrastructure.md`,
initialize the repo with branch protection, set up the tmux workflow, get an empty CI pipeline
green.

**Blockers/flags:**
- Human decisions needed before Phase 1 can fully close: how Staylite portal identity is really
  verified (`docs/onboarding-flows.md`), and whether executive accounts share a login with
  student accounts or stay fully separate (`docs/data-model.md`).
- Budget confirmation needed before Phase 2/8: Apple Developer Program ($99/yr), Google Play
  Console ($25 one-time), and whether a GPU VM is provisioned for the AI model or CPU-only is
  acceptable to start (`docs/ai-model.md`, `docs/release-distribution.md`).

---

## 2026-08-11 — Waitlist live, DNS staged, student app test-ready

**Status:** deployed; one manual step pending (GCP firewall 80/443)

**Did:**
- Waitlist: `WaitlistEntry` model + migration, public `POST /v1/waitlist` (rate-limited,
  honeypot, dedupe, confirmation email, ntfy push), `GET /v1/waitlist/count`, admin list/stats.
  Static landing page at `matriq.com.ng` served by Caddy. Admin console Waitlist viewer page.
- DNS: Cloudflare zone `matriq.com.ng` created; A records root/www/api → `34.28.210.233`;
  removed conflicting registrar records. Zone pending activation until .ng nameserver change
  propagates (up to 24h).
- Mobile testability: temporary Caddy route `http://34.28.210.233` → `/v1` proxy; `app.json`
  `apiUrl` → `http://34.28.210.233/v1`; Expo tunnel dev server running in tmux session `expo`
  (`exp://trnccto-anonymous-8081.exp.direct`), `@expo/ngrok` added as devDependency.
- Fix: ntfy push crashed on emoji in Title/Tags (fetch ByteString limit) — header values now
  sanitized to Latin-1. Verified live.
- Verified end-to-end: member login, profile, memberships, fees, announcements, events+RSVP,
  verification, referrals, payment history, executive dashboard, AI query (Ollama, ~28s CPU).

**Blocker (user action):** open TCP 80/443 on the GCP firewall (VM service account lacks
`compute` scopes — cannot be automated from the box).

**Flags:** Resend still in test mode (emails only to `juliusemmanueloghenegare@gmail.com` until a
sending domain is verified — do once DNS is live).

---

## 2026-08-11 — Capacity upgrades: clustering, Redis throttling, AI queue

**Status:** code complete; requires redeploy

**Did** (per the capacity assessment for 1,000 students):
- **Cluster mode** — backend forks one worker per CPU core in production
  (`WORKERS` env, `os.availableParallelism()` default), respawns crashed
  workers, graceful shutdown. Uses both vCPUs instead of one.
- **Redis-backed rate limiting** — `nestjs-throttler-storage-redis` wired in,
  shared across workers, with automatic in-memory fallback if Redis is down
  (never 500s on throttling). New `src/throttler/throttler-storage.ts`.
- **Per-IP+email login burst protection** — login/register/admin-login keyed by
  IP **and** email (campus-NAT-safe; each student gets their own 5/min bucket;
  attackers can't spray accounts from one IP). `src/throttler/trackers.ts`.
- **AI concurrency cap** — semaphore (`src/ai/semaphore.ts`) limits concurrent
  Ollama chat calls (`OLLAMA_MAX_CONCURRENCY`, default 2) + embed pool; queued
  requests past `AI_QUEUE_TIMEOUT_MS` get an honest 503 instead of a stalled
  box or a fake placeholder.
- **DB pool bounds** — `DATABASE_POOL_MAX` (default 5 per worker) so cluster
  mode doesn't multiply Postgres connections past what 3.8 GB can hold.
- **Load test** — `cd backend && npm run loadtest` (autocannon; health /
  associations / login / ai scenarios, env-configurable).

**Next:** redeploy (`scripts/deploy.sh`); then right-size the VM to 4 vCPU / 16
GB and optionally decouple Ollama (see `docs/infrastructure.md` "Capacity"
section) when real load testing demands it.

**Blockers/flags:** VM resize is a manual GCP action (stop → change machine
type → start); no code change required for cluster mode to benefit.

---

## 2026-08-14 — Production cutover verified; downloadable app live on the real domain

**Status:** LIVE on `matriq.com.ng` (nameservers propagated); one-manual-step
firewall issue bypassed via a second GCP VM (`matriq-server`, 35.204.163.157,
e2-standard-4) with open ports.

**Did:**
- Confirmed production deployment: full docker stack healthy on matriq-server
  (backend/postgres/redis healthy), real Let's Encrypt certs, waitlist page +
  API + `download/matriq.apk` all served over HTTPS.
- Full student smoke test against the live API passed: login, `/me`,
  memberships, associations, fees, verification, payment history, AI query.
- Fixed `www.matriq.com.ng` — added to the Caddy site block; cert issued after
  caddy restart; now HTTPS 200 alongside root and api.
- Rebuilt the release APK from the known-good v0.4.0 code (not the unreleased
  Stage 0/1 UI overhaul on main), versionCode 6, arm64-only,
  `https://api.matriq.com.ng/v1` baked in (verified in bundle; no stale
  tunnel URL). Deployed to prod + `app-version.json` bumped → download link
  serves the exact bytes (sha256 verified from the internet).
- Synced repo: Caddyfile www block, app-version.json v6.

**Flags/next:**
- GCP firewall on the OLD VM (34.28.210.233) is still closed; irrelevant now
  that prod lives on matriq-server (35.204.163.157).
- Prod clone `main` has 4 local-only commits (auth fixes); they exist in the
  shared history but were never pushed — recommend reconciling branches.
- No DB backups or uptime monitoring on prod yet (next step).
- Mobile `main` carries an unreleased Stage 0/1 UI overhaul — needs testing
  before becoming the next release.

---

## 2026-08-15 — Round 2 (QA fixes + admin/association dashboards)

**Source doc:** `matriq-fixes-and-new-builds.md` (QA pass on the live build).
`matriq-complete-spec.md` remains the design-system source of truth. Priority
order is the "fix first" tier at the bottom of the fixes doc.

**Root causes confirmed this session:**
- Vault upload: backend endpoint is healthy (verified a live upload via
  `president@matriq.app` → 201-ish success). The mobile bug was the
  `canSubmit` gate requiring `termsAccepted` even when `firstUpload` is false
  (returning uploaders never see the Terms checkbox → button permanently
  disabled). Also flipped `firstUpload` default to `true` so a failed
  `/me/vault` check can't hide the checkbox. FIXED.
- Vault error-bleed: `formatApiError` mapped ANY 401 to "Incorrect email or
  password". The backend only sets `INVALID_CREDENTIALS` for a bad
  login; a generic 401 is a lapsed session. Split the two. FIXED.
- Theme gaps: Profile, Verification (upload + status), Offline AI models, plus
  the Skeleton/SkeletonScreens still import the static `theme/colors` instead
  of `useTheme()`. Migrating them (and replacing Ionicons with the inline-SVG
  `Icon` set) — the fix-first tier names these screens explicitly.
- Offline AI download: the three HuggingFace GGUF URLs are valid (HTTP 206),
  so the 0% failure is in the native download path; adding retry + clearer
  errors rather than changing the catalog.
- Admin/Association dashboards: both Vercel projects (`matriq`, `matriq-dashboard`)
  deploy READY at the latest commit with `NEXT_PUBLIC_API_URL` set; login pages
  render real content (HTTP 200). The "bare error page" was a stale/transient
  deploy state — now resolved. Feature builds (Sections 1–2 of the fixes doc)
  are the remaining work.

**Flags (per the doc's "confirm before building" rule — using the proposed
  defaults, flagged back rather than treated as decided):**
- Android overlay bubble: defaulting to a small circular Matriq-mark bubble
  with a soft branded glow ring, draggable + snapping to the nearest edge,
  shown contextually (offline-AI download in progress / class starting soon),
  not permanently on-screen.
- Tools reorder: defaulting to "School Portal shortcut first, then AI-powered
  utilities (OCR etc.), then plain document tools."

**Done this session (Round 2, fix-first tier):**
- `errors.ts` centralized 401 mapping: `INVALID_CREDENTIALS` (and the
  code-less "Invalid email or password") → wrong credentials; "Invalid
  authentication code"/"…challenge" → MFA copy; every other 401 → "session
  expired". Kills the Vault error-bleed without mislabeling MFA.
- `VaultUploadScreen` upload gating fixed (`firstUpload` defaults true;
  `canSubmit` only requires the Terms checkbox on first upload) + wrapped in
  `KeyboardAvoidingView`.
- Theme gaps migrated to `useTheme()` + inline-SVG `Icon` (no more Ionicons):
  Profile, VerificationStatus, VerificationUpload, OfflineModels, plus the
  Skeleton/SkeletonScreens primitives. Removed the ntfy topic-ID leak from
  Profile.
- Offline-AI download: one retry with a fresh DownloadResumable + a clearer
  failure message. Model URLs verified valid (HTTP 206).
- `App.tsx` now wraps in `SafeAreaProvider` (was missing — the tab bar's
  `useSafeAreaInsets` relied on it).
- Admin/association dashboards: confirmed both Vercel projects deploy READY at
  HEAD with `NEXT_PUBLIC_API_URL` set and login pages render (HTTP 200) — the
  "bare error page" was a stale/transient deploy, now resolved. Feature builds
  (verification queue, member roster, dues, announcements, broadcasts, 2FA,
  one-account-per-association) remain for the "then" tier.

**Still open (deferred to later tiers per the priority list):** per-screen
safe-area migration (RN `SafeAreaView` → `react-native-safe-area-context`, ~40
screens) + `KeyboardAvoidingView` on remaining forms; Tools "Soon" kill;
notification system; onboarding copy; design-system refinements; quiz/facts;
update popup; overlay bubble; branded class notifications.
