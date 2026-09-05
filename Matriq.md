# Matriq — The Smart Way to Get Through Semester

**Current build: Matriq 2.0.0 (Version 2) · Android build 26 · September 2026**

Matriq is a study operating system for Nigerian university students: past questions, lecture
materials, offline AI, and the everyday tools students actually reach for — one app, built for
how Nigerian students genuinely study, including on bad data and low-end phones.

This document is the single source of truth about the product, the builds, the screens, the
decisions, the stack, and the workflow. It is written for the development team, the marketing
team, the advertisement team, and anyone who needs to understand Matriq well enough to grow it
with direction. Nothing in this document contains secrets, credentials, or private keys.

---

## 1. Mission, Vision, Goal & Audience

### Mission
Give every Nigerian student a real fighting chance at their semester — by putting the exact
materials and intelligence they need on their own phone, so studying stops depending on
expensive data, chaotic WhatsApp groups, or luck.

### Vision
Matriq becomes the default academic companion for Nigerian students — the app a student pulls
out in a lecture hall that makes the person next to them lean over and ask what it is. Over
time, every Nigerian campus has its own living academic archive (past questions, notes,
materials), each student has an AI that knows their courses and works offline, and associations
use Matriq as the neutral, transparent backbone for dues and verified membership.

### Goal (for this build — Version 2)
Ship the **v2 direction build** as a stable, bug-free product students keep coming back to:
a server-authoritative badge & achievement system, a meaningful-activity streak engine,
hardened rate limiting across every public and authenticated endpoint, referral conversions
that actually credit, and upload dedupe — on top of the full v1 feature surface. Narrower but
solid beats wider but shaky. **"Build the actual product", never "make it look like an app".**

### Audience
- **Primary:** Nigerian university students, 16–26, on Android phones that are often low-end
  (2–4 GB RAM), on prepaid mobile data where every megabyte and every naira counts, on networks
  that frequently drop to no signal inside lecture halls and hostels.
- **Primary (segments):** Staylites (already enrolled — have a matric number) and Freshers
  (admitted, no matric number yet, register with their JAMB number).
- **Secondary:** association executives (President, Treasurer, P.R.O.) who use the association
  dashboard to run verification, dues, announcements, events and timetable updates for their
  members.
- **Platform staff:** the administrators who run the platform (approving associations,
  moderating the public library, broadcasting, monitoring).
- **iOS users:** served by the web build of the same app until a native iOS path is worth the
  App Store overhead.

### User persona (primary)
**Chiamaka, 19, 200-level Computer Science, a federal university in the South-South.**
- Phone: an Android device bought second-hand; 3 GB RAM; storage constantly tight.
- Data: prepaid; she buys ₦500–₦1000 bundles and treats them like money (they are).
- Study reality: past questions for CHM 101 live in six different WhatsApp groups with 500+
  unread messages; her lecturer's slides are a 200 MB PDF she re-downloads every time the phone
  clears it; ChatGPT doesn't know what *her* lecturer asked *last year*; in exam week she asks
  "what do I even read first?"; in the exam hall there is no signal at all.
- What she needs: searchable past questions by course code, an AI that answers her course
  questions with zero data cost after a one-time download, a CGPA tool built for the Nigerian
  5-point scale, and tools that work when the network doesn't.
- What makes her stay: Matriq works on bad data, never logs her out randomly, never burns her
  bundle, and visibly rewards her consistency (streaks, badges) without nagging.

**Secondary persona (executive):** **Tunde, 300-level, class representative / association
Treasurer.** He needs to verify his members' identities, collect and reconcile association dues
transparently, push class/timetable changes that reach exactly the right department + level, and
never want to explain a missing naira.

---

## 2. Product in one screen each (v2 surface)

### Student mobile app (Android APK + web build) — every screen

**Auth & first run**
- Theme Picker (very first screen — Glass or Pop chosen before anything else)
- Onboarding (4 slides: the AI, the Vault, the tools, offline/low-data promise)
- Welcome / Register Choice (Staylite "I'm already a student" vs Fresher "JAMB number")
- Register Staylite / Register Fresher (live field validation, Terms checkbox, optional
  referral code from an inviter's share link)
- Verify Email (6 individual OTP boxes, auto-advance, paste support, auto-submit)
- Passcode Setup (mandatory 6-digit passcode before Home)
- Passcode Unlock ("Welcome back, [Name]" after 3h away)
- Login, Complete Profile (date of birth collection, profile photo)

**Home**
- Header (avatar, greeting, live date/time, notification bell with unread badge)
- Quick access list (collapsed tile rows), My To-Do's (set up timetable / offline AI / upload
  materials / profile photo — cards disappear on genuine completion)
- Hero fact card (rotating course-relevant facts generated in batches, cached)
- Streak badge (game-style arrival: spring, count-up numeral, flame flicker)
- Announcements row (flyer/text cards), Vault & today's-class glance

**Vault & Library**
- Vault screen (course-code-first search, past-question filter)
- Vault Upload (Public/Private choice, metadata: title, type, university, faculty, department,
  course code/title, level, session, description; Terms acceptance at first upload; server-side
  type/size validation; content-hash dedupe; smart companion files)
- Document Reader (in-app reading, A4 documents reflowed for phones, Continue Reading)
- Library discovery ("Netflix for students": Popular, Recently Added, From Your University,
  From Your Faculty/Department, Past Questions, Lecture Notes, Recommended For You, Continue
  Reading)
- Library Search (filtered, paginated), Library Saved, Library Detail (+ report moderation)
- My Materials (the student's own saved items for the offline AI)

**Tools**
- Tools grid (one unified equal-height grid)
- CGPA Calculator + Predictor (Nigerian NUC 5-point scale, exact reachability math)
- Image to Text (OCR: on-device ML Kit + server Gemini rescue tier), Image to PDF
- Deep Read (handwritten notes → documents, Magic Plus premium OCR)
- School portal link (plain link only), Portal Services → WhatsApp hand-offs (course reg, fees)

**Study**
- Facts card (shared mechanism with Home hero), Timetable (set-up + real-time updates scoped by
  department/level)
- Offline AI setup (model picker with download size/RAM/speed, resumable downloads)
- AI chat (streaming, memory, history, files/OCR/images, voice notes via whisper.rn, listen
  aloud), Focus Mode (concept maps — offline workspace or cloud DeepSeek), Focus Journey,
  Focus Questioner (tap-to-answer intake), Voice Mode
- My Materials, Quiz screen, Deadline Tracker, Focus Timer, Offline Models

**Community & identity**
- Announcements screen (read receipts), Events (RSVP, attendance), Referrals (share code, list,
  Ambassador status), Achievements board (v2: 20-badge server-authoritative catalog with
  Skia badge ceremonies)
- Notifications feed (in-app + FCM push: verification, payment receipts, dues, announcements,
  timetable changes, app updates)
- Notes (on-device note editor; notes feed the activity journal + "Ask my notes")
- Verification Upload / Verification Status (student ID or portal screenshot → executive review)
- Profile (photo pick/upload/remove, edit), Settings (appearance, profile, dues & payments,
  notifications, data & offline, verification, legal, help & about, sign out, delete account)
- In-app updater (validated APK download → restart prompt), keyboard-safe input on every screen,
  Glass/Pop theming everywhere, edge-to-edge safe areas, reduced-motion support.

### Association Dashboard (Next.js web app) — every screen
Login (MFA), Dashboard (stats, top payers, fund allocation), Verification queue (approve/reject
student documents), Members roster (verified/pending, search), Fees & dues management (who's
paid, payment history, CSV export), Announcements & Events posting, Transparency page ("where
dues go", president-editable), Timetable updates (scoped by department/level), Receipt QR
check-in.

### Admin Console (Next.js web app) — every screen
Login (MFA), Overview/Analytics (students, associations, active-user trend), Associations
(approve/suspend, issue dashboard accounts), Users (search, deletion requests, cancel
deletion), Vault moderation queue, Library reports moderation, AI moderation queue, Payments &
fees overview, Verification overview, Banners (home-screen broadcasts), Institutions catalog,
Waitlist management, Admins, Audit logs, Security (MFA setup).

### Marketing site (matriq.com.ng) & web app (app.matriq.com.ng)
Waitlist landing page ("The Smart Way to Get Through Semester"), email capture + two light
survey fields, Telegram invite, brand OG/Twitter cards, structured data, and the Expo web build
of the student app for iPhone users (same app, no offline AI on web).

---

## 3. Version 2 — what this build ships

Version 2 (2.0.0 / build 26) is the first stable "direction" release. On top of everything in
the v1 feature surface, this build adds the systems that make Matriq trustworthy at scale:

- **Achievement Board v2 (the badge system).** A 20-badge catalog across five categories —
  Foundations, Consistency, AI Learning, Knowledge, Community. Every badge maps to a REAL,
  server-authoritative signal: none can be earned from fake, repeated or farmed activity.
  - Streaks & day-counts come from a new **activity journal** — a server-authoritative record
    of meaningful activity (focus maps, mastery passes, notes, tasks, uploads, library saves,
    AI generations, deep reads, referral verifications). Every entry is idempotent
    `(userId, eventKey)` so replays, retries and racing clients can never double-credit.
    App launches are never journaled, so they can never build a streak.
  - Focus journeys and mastery checkpoint passes are counted from the server records
    themselves (dedupe by map+session).
  - Upload badges count only **distinct valid uploads** — the Vault now computes a SHA-256
    content hash per file so a farmed duplicate counts once.
  - Referral badges count only **email-verified conversions** — a referral code captured at
    registration is consumed at email verification, with self-referral and double-conversion
    rejected; the conversion is journaled so it also counts toward First Spark.
  - Timing badges (Early Explorer / Founding Student / Beta Pioneer) use tunable launch-window
    constants documented in code.
  - Unlock moments render as Skia badge ceremonies with gesture-first, Apple-style polish;
    client-trusted signals were removed from the evaluate endpoint entirely.
- **Rate limiting, everywhere.** A resilient Redis-backed throttler with an in-memory fallback
  (rate limiting must never take the API down), per-route buckets, IP+email trackers on
  auth/register/admin-login (campus NAT can't be poisoned by one student; a single source
  can't spray many accounts), per-user trackers on premium/cost-incurring endpoints, and tuned
  limits on the achievements evaluate/sync endpoints.
- **On-device notes + tasks sync into the journal** via an idempotent client sync endpoint
  (notes/tasks live offline-first, so the server journals their ids once each).
- **Meaningful referral conversion flow** that makes the Community badges actually earnable.

---

## 4. Release history — every build so far

The project shipped through a rapid 0.x iteration line (25 Android builds) while the product
was found and hardened in production, then crossed into the **Version 2** line.

### The 0.x era → 1.0 direction builds (in brief)
- **v0.1–0.5 era (earliest commits):** spec-driven build-out — auth, onboarding, dashboard,
  dues/payments, verification, announcements, events, tools, the self-hosted AI companion,
  association dashboard + admin console (Next.js), the Glass/Pop design system, waitlist site.
- **Builds 12–14 (mid-August 2026):** criteria-gap + fixes passes — real OCR (Gemini rescue for
  handwriting), offline-AI download root-cause fix, first-timer onboarding route fix,
  association-dashboard contract alignment, admin security/users pages, resumable model
  downloads, offline-AI chat screen + history, in-app-only releases (no Telegram spam).
- **Builds 15–18 (late August):** keyboard/resize work, edge-to-edge safe-area audit, offline
  token-repetition fix, theme-aware offline AI chat, **branding pass** (theme-aware launcher
  icons, animated splash handoff, the faceted Matriq M mark), ML Kit OCR, resilient token
  refresh (the random-logout root cause), Vault offline cache + persistent downloads, release
  pipeline automation, splash dead-end fix.
- **Builds 19–24 (late August–early September):** theme-picker crash fix; institution catalog
  (331 institutions, exact faculty lists); associations hierarchy + association logins + ₦150
  developer fee; NVIDIA NIM fallback + Redis answer cache; Vault view-only documents; Android
  keyboard resizes the window properly; **DeepSeek-powered Focus Mode (Magic Plus)** with 10
  free uses + entitlement foundation; **Academic Library** discovery layer; real-device push
  via Firebase Cloud Messaging; hybrid OCR (Tesseract + Gemini rescue); **v0.7.17 (build 25)**
  shipped to production: no more surprise logouts, general-purpose Focus Mode, chat scroll fix,
  hardened in-app updater.
- **Phase 6 & 7 (this v2 build):** Skia badge ceremonies; Focus Mode questioner; achievements
  v2 (server-authoritative activity journal + mastery passes + content-hash dedupe + verified
  referral credits); Redis-backed resilient rate limiting; referral capture/consume flow; the
  **v2.0.0 (build 26)** release.

### Current versioning rules
- Version is single-sourced from `mobile/app.json` (`expo.version` → versionName,
  `expo.android.versionCode` → versionCode).
- Each release: bump both, run the local Android build, ship the APK + bump the live
  `app-version.json` so installed apps self-update in the background.

---

## 5. Every important decision, locked

Product & scope
- Tagline everywhere: **"The smart way"** / "The Smart Way to Get Through Semester."
- Five bottom-nav tabs: Home · Vault · Tools · Study · Settings. No dedicated AI tab; no Dues
  card on Home (dues live in Settings).
- Settings is its own tab. Account deletion is hard-delete scheduled 6 months out (login
  cancels it); no separate "disable".
- CGPA uses the Nigerian NUC 5-point scale (A = 70%+, 5 pts … F below 40%, 0 pts).
- Re-authentication is a 6-digit passcode after 3 hours away (created mandatorily at
  onboarding). OTP entry is 6 individual boxes.
- School portal integration is a plain link only — never stores portal credentials, ever.
  Portal services (course reg, fees) are WhatsApp hand-offs by design.
- iOS is served by the web build of the same app until a native path is worth the cost;
  Android ships first.
- Payments: Paystack (hosted checkout, webhook + independent verify; card data never touches
  our servers). Only association dues move through real money in v1. Client never tells the
  server a payment succeeded.
- No streak before v2 rules: streaks count only *meaningful* activity days (never app
  launches), one streak, one badge, no levels.
- Badges award for real completed actions with a real celebration moment — never a silent list.
- Onboarding copy, error-handling three-part rule (what happened / why / what to do), legal
  document versioning and consent tracking are all locked in the product spec.
- Emoji are never interface icons; the four-point spark icon is reserved exclusively for
  AI-touched things; inline SVG icon set only (icon fonts caused real bugs and were banned).
- AI is never called live on a timer — batches are generated and rotated client-side.
- Third-party AI keys never exist in client code — the app talks only to the Matriq backend.
- Free tier is genuinely useful forever (offline AI, notes, OCR, Image→PDF, CGPA, community
  library). Magic Plus charges only where Matriq spends (cloud AI, private storage,
  high-quality processing) — no dark patterns, no fake urgency.
- The community ecosystem (public academic library) stays free and unlimited — it is the
  network effect, never the hostage.

Design (locked in the design system)
- Two themes: **Glass** (deep-purple void, ambient lime/violet glow blobs, frosted translucent
  surfaces, 400–600ms fluid motion) and **Pop** (pale lavender-white clay, thick ink borders +
  hard offset shadows on one hero element per screen, snappy 150–250ms spring).
- Colors: deep purple `#14061F` / `#55278F` / `#7B4BC4`, electric lime `#C6FF3D` (one accent
  moment per screen, never under body text), ink `#170B26`, paper `#F5F1FB`.
- Two-font system at one voice at a time: **Plus Jakarta Sans** owns the UI; **Fraunces**
  (serif) is reserved for display/headlines and big numerals only.
- Size floors: display 30 / h1 26, touch targets ≥44pt, caption ≥12, radii 8/14/20/28.
- Home = compact Quick access list; Vault & Library = hairline list rows; Tools = one unified
  equal-height grid; lime accent spent in exactly one place per screen.
- Accessibility baseline: WCAG AA contrast, proper labels, focus marks, reduced-motion
  respected — the app must feel complete with animations disabled.
- The app icon is the **faceted Matriq M mark** (not a static "M text inside a box") — used on
  the launcher (light/dark adaptive variants + Android-13 monochrome), splash, notifications,
  favicon, and marketing assets.

Architecture & engineering
- Three separate deployables: Student app (React Native + Expo), Association Dashboard and
  Admin Console (separate Next.js apps with their own auth — no code path between them).
- One backend (NestJS), one database (PostgreSQL + pgvector), Redis for rate limiting/cache.
- No Firebase/Firestore assumptions anywhere — everything is self-hosted or server-side.
- Money stored as integer minor units (kobo); payment status only ever set server-side via
  verified webhook + independent verification.
- Verification documents live in private storage behind signed short-lived URLs, never public.
- Migrations are never applied silently; schema drift fails CI.
- Releases are built locally (`gradlew assembleRelease`, arm64 single ABI), shipped by a
  finalize script, delivered in-app — with no secret material in the repo.

---

## 6. The stack, end to end

| Layer | Choice | Why |
|---|---|---|
| Student mobile | React Native + Expo SDK 57 (TypeScript), react-navigation, react-query, reanimated, Skia, react-native-svg, expo-secure-store | One codebase → Android APK + iOS-capable + web; TypeScript across the whole stack; EAS solves iOS-without-a-Mac |
| On-device AI (Android) | llama.rn (GGUF, Qwen 2.5 0.5B family), whisper.rn (voice), ML Kit OCR | Download once over Wi-Fi, then zero-data, zero-signal answers; offline reading of files/images |
| Web offline AI (iOS) | transformers.js (WASM/WebGPU) + Web Speech API | Same download-once product pattern in the browser (follow-up build) |
| Cloud AI (server) | DeepSeek primary → NVIDIA NIM → Gemini fallback, via the backend only | Quality Focus Mode + Gemini vision OCR rescue + study facts/quizzes; keys never in the app |
| Backend | NestJS 10 (Node + TypeScript), Prisma, JWT auth (Argon2id, rotating refresh families), TOTP MFA | RBAC-friendly structure, one language family, hard to bypass guards |
| Database | PostgreSQL + pgvector | Relational + vector retrieval in one DB |
| Cache/rate-limit | Redis (ioredis, nestjs-throttler-storage-redis) with resilient in-memory fallback | Shared limits across cluster workers; never takes the API down |
| Object storage | MinIO-compatible with signed presign URLs | Large files transfer phone↔storage directly |
| Payments | Paystack (hosted checkout + verified webhooks) | Nigerian cards/transfer/USSD; minimal PCI scope |
| Push | Firebase Cloud Messaging (FCM HTTP v1, server-side) | Branded native notifications, banners over any screen, delivery when closed |
| Infra | Single hardened GCP VM (`matriq-server`, e2-standard-4, 4 vCPU/16 GB), Docker Compose, Caddy (TLS + reverse proxy), cluster-mode workers | Right-sized for ~1,000 concurrent students; one box to operate |
| DNS/CDN | Cloudflare DNS; Let's Encrypt via Caddy | Proxied edge when needed, DNS-only for origin hosts |
| Web dashboards | Next.js (TypeScript) on Vercel; Dockerized self-host option ready | Separate attack surface, session auth, same tokens |
| CI/release | GitHub Actions + local Android builds + EAS path; deploy.sh on the VM | One documented deploy entry point; migrations explicit |
| Monitoring | Backend `/health`, structured logs, gemini-quota watchdog | Simple, sufficient for current scale |

### Infrastructure layout
`matriq.com.ng` (marketing/waitlist) → Caddy on the VM · `api.matriq.com.ng` (NestJS) → Caddy
reverse proxy · `app.matriq.com.ng` (web student app) → Caddy static · `admin.matriq.com.ng`
and `dashboard.matriq.com.ng` → Vercel (self-host option ready). Only 443/22 open externally;
Postgres, Redis and AI endpoints stay on the private network.

---

## 7. How it's built — workflow, tools, and the humans+agents operating model

### Operating model
Matriq has been built by a small human founder working with autonomous coding agents over SSH
(Termux + tmux), driven by an unusually disciplined documentation system:

1. **Documentation is the source of truth.** `production-directive.md` (highest authority),
   `agenda.md`, `security.md`, and the `docs/docs/*` set (architecture, tech-stack, data-model,
   backend-api, design-system, ai-model, payment-integration, mobile-app, onboarding-flows,
   infrastructure, ci-cd, release-distribution, testing-qa, compliance-privacy, deployment-cost,
   progress-log, and more) govern every decision. Re-read `progress-log.md` at the start of
   every session; update it at the end.
2. **The progress log is the continuity mechanism.** It records what shipped, what's in
   progress, what's blocked, and what the next step is — so any agent or human can resume.
3. **Small committed increments.** Work in tiny coherent commits; sessions drop, so nothing
   valuable sits only in a shell.
4. **The production directive's bar:** never "make it look like an app" — build the actual
   product. No fake features, no pretending. Loading/empty/error/success/validation/recovery
   states on every screen. Security is a constraint on every phase, not a phase.
5. **Skills keep output on-brand.** Brand identity, RBAC patterns, payment safety, and design
   skills are installed so agents produce decisions consistent with the project's locked
   choices rather than generic defaults.

### The release pipeline (as of v2)
1. Bump `mobile/app.json` (`version`, `android.versionCode`).
2. `bash scripts/_build-apk.sh` — Expo prebuild → arm64-only single-ABI gradle
   `assembleRelease`, llama.rn libs trimmed (APK ~50 MB), version pinned into build.gradle.
3. `bash scripts/_finalize-apk.sh` — reads the real version from the built APK, ships it to
   the server download URL, bumps the live update manifest so installed apps self-update.
4. Backend deploys via `scripts/deploy.sh` on the VM (explicit migrations, idempotent).
5. Marketing/web deploys: waitlist static rsync + web export → `/srv/matriq-web`.

### Verification culture
- Backend: `tsc --noEmit` + Jest (342+ tests across 30 suites as of this build — auth, focus,
  achievements, activity, vault, notifications, tools/OCR, deletion, executives and more).
- Mobile: `tsc --noEmit` + Expo export checks per change; real-device passes on the VM after
  each APK rebuild (keyboard, dark-mode layering, uploads, streaming AI, downloads).
- Load testing: `npm run loadtest` (autocannon) — measured ~270 rps at p95 ≈113 ms after the
  server migration.
- Smoke tests: waitlist HTML/SEO battery, health checks, live OCR/API verification against
  production.

---

## 8. Retention, growth & community mechanics

- **Streaks** — consecutive days of meaningful study only (a completed AI Q&A, a saved note, a
  focus map, an upload…). One gentle local reminder at 19:30 only when a streak needs saving;
  a broken streak cancels reminders (no guilt loop).
- **Achievements** — the 20-badge v2 board described in §3, celebrated with Skia ceremonies.
- **Referrals** — every student gets a share code; a conversion is only credited when the
  invitee verifies their email (self-referral and double-conversion are impossible). Rising
  Ambassador (5) and Matriq Ambassador (10, legendary) are board badges.
- **The community library** — the network effect: students contribute past questions and
  materials, get admin-moderation approval, and everyone's university gets smarter.
- **Founding Circle** — a named group from the waitlist (thoughtful survey answers + identified
  class reps/executives across levels/departments/faculties) with earliest access, a direct line
  in Telegram, and a real seat in prioritization.
- **Waitlist as research** — signup fields capture "the single most annoying part of studying"
  and whether the student holds a class/department/faculty position, turning signups into
  market research and an executive-recruitment channel.

---

## 9. Marketing, advertising & launch material

**Positioning:** "The Smart Way to Get Through Semester." One line for students, never the old
association-dues-first pitch: *Past questions, offline AI, and the tools you actually reach for
daily — one app, built for how Nigerian students actually study.* Trust row: 🇳🇬 Built for
Nigerian campuses · 📶 Works on bad data · 🤖 Offline AI, zero data cost.

**The old way is exhausting (pain copy):** past questions scattered across forgotten WhatsApp
chats · data too expensive to re-download a 200 MB PDF a third time · ChatGPT doesn't know what
your lecturer asked last year · "what do I even read first" panic every exam week · no signal in
the hall.

**Waitlist funnel:** email capture on matriq.com.ng + Telegram invite
(`t.me/+Bk-Wbby2_Cc3Njk0`) + two light survey fields → Founding Circle → invites as the app
rolls out.

**Ad frameworks (all ~45s, CTA = join the waitlist, no corporate language, built for
scene-based assembly):**
- *A — A Day In The Life:* fast-cut documentary realism from 6:47am alarm to offline-AI answer
  on a no-signal bus, ending "The Smart Way" logo + waitlist.
- *B — POV:* text-on-screen native short-form — "POV: it's 11pm and the past question you need
  doesn't exist online. It does now."
- *C — Epic trailer:* every semester the questions repeat… "One app. Built for the fight you're
  already in" with a post-credit comedic scene (dues dashboard).
- *D — Myth vs Reality:* productivity-influencer myth vs the real student on a cracked screen
  between stops.

**Launch assets:** brand OG/Twitter share image, favicon + apple-touch-icon (brand M mark),
structured data (Organization/WebSite/SoftwareApplication), robots.txt + sitemap, branded 404,
SEO titles/descriptions per page, Google Search Console checklist documented.

---

## 10. Business model & Magic Plus

- **Association dues** move through Paystack (with a ₦150 platform developer fee) — the
  revenue stream that pays for the platform while associations get transparent dues.
- **Magic Plus** is the optional premium layer. The first real Magic Plus feature is cloud
  Focus Mode: 10 free uses per account, then Magic Plus. The entitlement layer is server-side
  authority with pluggable DB-backed plans, per-user rate limits and daily caps.
- Planned premium capabilities (flagged in code, none built yet): larger private storage
  allowance, higher-quality processing (full-res OCR, larger uploads), document intelligence
  (search/summaries/answers grounded in your vault), advanced study planning, cloud backup &
  sync. Free stays genuinely useful forever; pricing posture is one simple tier, transparent
  limits, optional calm upgrade, no dark patterns.

---

## 11. Security posture (no secrets here)

- Passwords: Argon2id. Sessions: short access JWT (1h) + 90-day rotating refresh-token
  families with replay detection and a benign-reuse grace window (no surprise logouts).
- MFA: TOTP required for admin/executive accounts; challenge-token login flow.
- Rate limiting: Redis-backed with in-memory fallback; IP+email buckets on auth/register/admin
  login; per-user buckets on premium endpoints; verification-email budget (5/hour/account).
- Payments: server-authoritative only — verified webhook + independent Paystack verification;
  state machine pending/processing/successful/failed/cancelled/refunded/disputed.
- File uploads: server-side type/size validation; verification documents in private storage
  behind signed short-lived URLs.
- Keys & secrets: never in client code, never in git; `.gitleaks` scanning; git history was
  scanned and rotated.
- Error handling: three-part friendly messages only; raw errors/codes never reach the client.
- Access control: student-scoped data server-side; RBAC across roles; audit logging on
  admin/executive actions.

---

## 12. Privacy & legal

- Privacy Policy, Terms & Conditions and data-processing records exist as drafts in
  `docs/legal/` — **drafts must be reviewed by a qualified lawyer familiar with Nigerian data
  protection law (NDPA/NDPR) before being presented to real users.** Consent is versioned and
  recorded per user (`legal_acceptances`); Terms are re-surfaced at registration and at first
  Vault upload.
- The engineering posture: data minimization, private buckets for personal documents,
  on-device-first AI (no student data leaves the device for offline features), clear retention
  (6-month scheduled deletion).

---

## 13. Documentation map (for the team)

- `production-directive.md` — governing standard (read first)
- `agenda.md` — roadmap/phases · `security.md` — security requirements
- `docs/docs/` — architecture, tech-stack, data-model, backend-api, design-system, ai-model,
  payment-integration, mobile-app, onboarding-flows, infrastructure, ci-cd,
  release-distribution, testing-qa, compliance-privacy, deployment-cost, cloudflare-vercel,
  seo-checklist, web-app, magic-plus, mcp-integrations, agent-skills, agent-workflow,
  progress-log
- `matriq-complete-spec.md` — full product & UI spec (screen-by-screen)
- `matriq-fixes-and-new-builds.md` — round-2 fixes/builds source
- `matriq-logo-brief.md` — brand/logo brief · `matriq-waitlist-launch-package.md` — growth &
  launch ads
- `Matriq.md` — this document: the whole product in one place

---

## 14. Direction of travel — what's next

Shipped & stable in v2: the full student app, association dashboard, admin console, waitlist,
offline-first AI stack, DeepSeek Focus Mode + Magic Plus foundation, Academic Library, FCM
push, hybrid OCR, badge system v2 + activity journal, resilient rate limiting, verified
referrals.

The honest next steps, in priority order:
1. **Seed and grow the real corpus** — the Academic Library only gets smarter as students
   publish and admins approve; seeding quality materials first is the single highest-leverage
   action.
2. **On-device verification passes** of v2 on real low-end hardware (streaks, badges, referral
   conversion, sync, rate-limit messaging, icon on home screen).
3. **Google Search Console + sustained SEO/content** for matriq.com.ng; backlinks over time.
4. **Play Store + iOS paths** (Play Console internal testing; Apple Developer Program +
   TestFlight/EAS) when ready for wider distribution.
5. **Founding Circle activation** — turn waitlist survey answers into the feedback loop and
   the class-rep network that powers association features.
6. **Magic Plus monetization build-out** when entitlement boundaries are validated by real
   usage.
7. Grow the community mechanics deliberately: more journaled activity kinds, more badges that
   reward genuine depth, class/timetable notification branding.

---

*Matriq — The Smart Way to Get Through Semester. Built for Nigerian students, by the people
who study here. Version 2.0.0.*
