# Matriq — Round 2: Fixes, Admin/Association Dashboards & New Builds

This builds on `matriq-complete-spec.md`, which the agent already has and should still be treated as the design-system source of truth (tokens, Glass/Pop mechanics, screen inventory, priority philosophy). This document does not repeat that — it covers what QA on the live build actually surfaced: bugs, gaps, and features that were never fully specified the first time around.

**A few things below need your confirmation before the agent builds them — flagged inline and collected at the end of my reply, not buried in here.**

---

## 1. Admin Dashboard — currently broken, never fully specified

**Bug:** doesn't load at all right now (confirmed from the screenshot — a bare browser error page, not an app screen). Root-cause this before adding any of the features below; a broken dashboard with more features added on top is still broken.

**Feature set — platform-level oversight, distinct from any one association:**
- **Overview:** total students, total associations, active-user trend, growth over time.
- **Association management:** approve new associations onto the platform, issue their dashboard account (Section 2), suspend or remove one if needed.
- **Vault moderation queue:** flagged or reported public uploads, with the ability to remove content and see who uploaded it.
- **Platform-wide dues/payment overview:** aggregate across every association, with the ability to drill into any single one.
- **User management:** search any student account, action account-deletion requests per the 6-month policy already defined in the complete spec.
- **Broadcasts:** platform-wide announcements that aren't tied to any one association (e.g. app-wide outages, new feature announcements).
- **Basic usage analytics:** most-active courses, Vault contribution activity — useful for exactly the kind of decisions Section 15 below is about.

**Security — 2FA required for admin specifically:** TOTP-based two-factor (compatible with Google Authenticator, Authy, or any standard authenticator app — TOTP is an open standard, not something exclusive to one app, worth wording the UI that way rather than naming only Google Authenticator) via a QR-code setup flow, plus device fingerprint as an additional local unlock layer on top. This is on top of, not instead of, normal login.

---

## 2. Association Dashboard — broken, and built around the wrong model

**Bug:** same broken-load issue as Admin — fix the underlying cause, likely shared between both.

**The important correction:** the current build ties the dashboard to a single officer (`president@matriq.app`). An association is a body of executives, not one person — singling out the president or treasurer is the wrong model. **Replace it with one account per association: `[association-name]@matriq.app`**, shared by whichever executives need access, not personalized to a role. Simplest correct approach for now: one shared login per association, issued by Admin when the association is approved (Section 1) — a more granular per-officer permission system is a reasonable future improvement, not a requirement for this pass.

**Feature set — this is what the current build never actually defined:**
- **Verification queue** — approve or reject the student ID / portal screenshot submissions described on the app's own verification screen ("association executives review your uploaded document"). This has always belonged here, not with platform Admin — it doesn't scale to one person reviewing every student on the platform.
- **Member roster** — who's verified, who's pending, basic search.
- **Dues management**, if the association has registered for it: who's paid, who hasn't, set/edit amounts, payment history, CSV export — extend the same bulk-approval/export pattern already built for the NAAS/SUG voting platforms rather than building this from zero.
- **Announcements & events posting** — this is what feeds the student-facing Home announcements carousel. Associations are the ones who should be populating that feed for their own students, not a manual admin process.
- **Real-time class/timetable updates**, scoped by department and level (a 200-level Computer Science schedule and a 300-level one aren't the same thing) — an executive or class rep can push a change ("GST 202 moved to 2pm") that reflects immediately in the Timetable for students in that exact department+level, and fires the branded class notification described in Section 10.

---

## 3. Cross-cutting bugs — apply everywhere they occur, not just one screen

- **Theme system has real gaps.** Profile, Verification, and the offline-AI download screen are still rendering the old plain-white styling regardless of the student's chosen theme — meaning theming was applied inconsistently rather than as a true global system. Audit every screen against `data-theme`, not just the ones that were visibly wrong in this pass; if three were missed, others may be too.
- **Lime is unreadable on light backgrounds in Pop mode.** Fix per the complete spec's own rule: lime is only ever paired with a dark backing (a chip, a badge, a button fill with dark text on top) — never lime text or a lime icon directly on a light/white surface. Where that rule was violated, swap to purple instead.
- **The splash/skeleton screen needs to go.** A purple screen with a loading skeleton sits there for a stretch before the real app appears — remove the artificial delay, and get to the theme picker (first-run) or Home (returning user) as fast as the app can manage. This is the same class of problem flagged during the NSG-site audit earlier in this project: a blank shell before real content is the opposite of "works even on bad data," which is the actual point of this whole app.
- **An unrelated "Incorrect email or password" error is bleeding into the Vault search screen** — an auth-flow error rendering in a completely different context. This is exactly why the complete spec calls for one centralized, properly-scoped error-handling layer (Section 12 there) instead of ad hoc error states per screen — this bug is what happens without it. Fix the immediate leak, and treat it as a live example when building that centralized layer.
- **The on-screen keyboard covers input fields** with no layout adjustment — sometimes a student can't see what they're typing at all. Fix with proper viewport handling: use `100dvh` instead of `100vh` where relevant, and scroll the focused field into view on focus (`scrollIntoView` or listening to `visualViewport` resize) rather than letting the keyboard simply overlap fixed content.
- **Content sits too close to the top of the screen in multiple places** — respect safe-area insets (`env(safe-area-inset-top)`) globally rather than case-by-case.

---

## 4. Onboarding — final copy, implement exactly as written

Four slides, tagline "The Smart Way" carried through:

**Slide 1 — Welcome & Intelligence**
Headline: *The Smart Way to Study.*
Body: *Access localized, on-device AI designed to answer course-specific questions, explain tough concepts, and keep you learning anywhere.*
Visual: a 3D brain model floating over deep void glass (matches the reference image's aesthetic direction — see Section 10).

**Slide 2 — Shared Academic Vault**
Headline: *Your Campus Archive, In One Place.*
Body: *Explore past questions, lecture materials, and shared summaries contributed by fellow students across departments.*
Visual: a Vault folder with glowing course-code badges (e.g. CHM 101, PHY 102).

**Slide 3 — Essential Study Utilities**
Headline: *Practical Tools for Daily Success.*
Body: *Calculate target CGPAs, extract text from snapshots, convert documents, and link directly to your campus portal without the clutter.*
Visual: a stack of utility cards (OCR scanner, CGPA target dial, document utilities).

**Slide 4 — Low-Data & Offline First**
Headline: *Built for Speed. Works Offline.*
Body: *Download light companion files to save mobile data, and stay fully productive even without an active internet connection.*
Visual: a seamless sync ring with an "Offline-Ready" status pill.

CTA: **Get Started** (primary) / **Sign In** (secondary). Footer: *By continuing, you agree to our Terms of Use and Privacy Policy.* Subtitle: *Matriq — The smart way.*

---

## 5. Home

- **Replace the "Verified" pill in the header with a notification bell**, showing an unread-count badge. Verification status still exists — it just lives in Settings now, not the header (this also fixes the exposed-technical-detail problem in Section 9).
- **My To-Do's: completed items must disappear entirely, not show a checked state.** The current build appears to be marking items done rather than removing them — this was already specified once; treat this as confirmation the first implementation didn't match the spec, not a new requirement.

---

## 6. Vault

- **Upload is completely broken right now** — nothing can be saved to the Vault. This is close to the most important fix in this whole document; Vault is the shared database the rest of the product's value depends on.
- **Fix the misplaced auth error** described in Section 3.
- **Redesign the materials list.** Large column-style blocks aren't working — switch to a compact row style showing filename and upload date clearly, closer to a file-manager list than a card grid.

---

## 7. Tools — make it real

**Right now, only the CGPA calculator/predictor actually work.** Everything else — including items just labeled "Soon" — needs to become real, not stay as a placeholder. "Soon" isn't an acceptable state for a shipped tab.

- **OCR (Image to Text), Image to PDF, File Compressor** — build these for real. For OCR specifically, use the Gemini API (Section 13) rather than a separate OCR library — send the image with an extract-the-text prompt server-side; this is genuinely more robust than traditional OCR for photographed pages and reuses infrastructure you're already paying for instead of adding a second pipeline.
- **PDF merge/split, PDF↔Word, passport background remover** — build these too, not leave them as "Soon."
- **Reorder the tab: School Portal shortcut moves to the top**, ahead of the document utilities (worth confirming this is the read on "then the AI" — I've taken it as AI-powered utilities like OCR sitting right after the portal link, ahead of the plain document tools; correct me if that's not what was meant).
- **Offline AI model download is broken** — the download simply fails right now (confirmed from the error screen: "Download failed. Check your internet connection and try again" at 0%). This needs to actually work, not just describe the models.
- **Redesign the model list.** Full-height cards per model take up too much space — arrange them in a compact 3-column grid showing just name and size, and tapping one opens the fuller detail (RAM needed, speed, description) in its own view instead of everything being visible inline at once.
- **Remove the duplicate offline-AI entry point in Settings → Data & Offline.** Offline AI setup lives in exactly one place: Study. Data & Offline in Settings should only cover general storage — downloaded materials, cache — not AI model management.

---

## 8. Study

- **"Did you know" facts are stuck on five hardcoded templates that just repeat.** This needs to be genuinely unlimited and non-repeating — generate a fresh batch via Gemini (Section 13) periodically (on new material upload, or on a daily cadence) rather than cycling a fixed set forever. The "don't call AI live on a 60-second timer" rule from the complete spec still applies — generate in batches, rotate the cached results client-side.
- **Quiz Generation needs to be real and AI-powered**, personalized to the student's own uploaded materials/course rather than generic — same Gemini-backed pipeline as the facts above, different output shape (test questions instead of trivia).

---

## 9. Notifications — build the system that's currently missing

There's no notification banner or feed in the app at all right now, and the header's new bell icon (Section 5) needs somewhere to point.

**Build:** tapping the bell opens a scrollable notification feed — verification updates, payment receipts, new dues, announcements relevant to the student's department/level, app-update prompts (Section 12). Unread count shows on the bell itself.

**This also fixes a real problem visible in the current build:** the Profile screen currently tells students to manually install a separate third-party "ntfy" app and subscribe to a raw technical topic ID to receive push alerts — that's implementation detail leaking directly into a user-facing screen, not a real notification system. Once the in-app feed exists, push notifications should ride on the platform's own mechanism (native push for the Android app, web push for the web version) — nothing about receiving a notification should ever require a student to install a second, unrelated app.

**Class/timetable notifications specifically** should use a distinct, branded style — Matriq's own purple/lime, not the default system notification look. **I don't have the specific reference you mentioned liking** — none of the ten screenshots in this round show a notification example, so if you have a screenshot of the exact style, attach it and I'll match it precisely. In the meantime, the safe default: branded accent color, a custom small icon, and an actionable notification (e.g. a "View Timetable" action) rather than a plain text alert.

---

## 10. Design system refinements

**Pop (light mode) — two real changes, not just bug fixes:**
- The thick-dark-border-plus-offset-shadow treatment (previously reserved for one hero card per screen) **becomes the default container style across the board**, not an occasional accent. Every card/container uses it.
- **More color, less white.** The current build is reading as too pale/plain — lean into the claymorphic surfaces being genuinely colorful (tinted, not just white-with-a-shadow), consistent with the "students like hype" brief from the very start of this project.

**Glass (dark mode) — match the attached reference image's richness.** The ambient glow blobs should read as more visible and saturated than whatever currently shipped — the reference shows a busier, more luminous purple/lime glow presence behind the glass surfaces than the current build has. Use that image directly as the calibration target for blob opacity/saturation, not the more conservative version in the original spec.

**Footer/bottom nav — redesign per the reference image's shape, not the current flat bar.** The active tab's icon should render as a raised circular bubble that pops up above the bar's top edge, with the bar's own silhouette curving/notching around that bubble rather than staying a flat rectangle underneath it. This needs a real notch/cutout shape (an SVG mask or a `clip-path` cut into the bar, with the active icon's bubble absolutely positioned to sit in that notch) — not just an icon rendered on top of a plain bar, which won't produce the same silhouette.

---

## 11. Android system overlay (floating bubble) — new feature, Android-native only

This is not buildable on the web version — system overlay windows are an Android OS capability, native-app only. Exact technical spec, as provided:

- **Permissions:** declare `SYSTEM_ALERT_WINDOW` in the manifest; check status with `Settings.canDrawOverlays(context)`; if not granted, open `Settings.ACTION_MANAGE_OVERLAY_PERMISSION` with the app's package URI.
- **Service lifecycle:** run the overlay inside a Foreground Service for persistence and to comply with Android's background execution limits; initialize the required notification channel for that service.
- **Window rendering:** obtain `WindowManager`, inflate the custom popup view, and set `WindowManager.LayoutParams` — window type `TYPE_APPLICATION_OVERLAY` (API 26+) or `TYPE_PHONE` (legacy), flag `FLAG_NOT_FOCUSABLE` for correct touch routing, format `PixelFormat.TRANSLUCENT`. Attach via `windowManager.addView(view, params)`.
- **Navigation & cleanup:** tap opens the main Activity via an Intent with `FLAG_ACTIVITY_NEW_TASK` and `FLAG_ACTIVITY_CLEAR_TOP`; remove the view via `windowManager.removeView(view)` on tap, dismissal, or service termination.

**What the spec doesn't say, and needs a decision:** what the bubble actually looks like and when it appears. Proposed default — a small circular bubble carrying the Matriq mark with a soft branded glow ring, draggable and snapping to the nearest screen edge on release, appearing contextually (an offline-AI download in progress, a class starting soon) rather than being permanently on-screen, which would read as intrusive. Confirm or override before the agent locks in the visual/trigger behavior.

---

## 12. Background updates — refined behavior

The complete spec's version (silent download, restart at next natural reopen) is now more specific: **download silently in the background as usual, but once it's finished, show a popup — "Update detected — restart the application?" with Yes/No** — not a forced restart, and not silent until next launch. "No" should defer, not cancel; the update still applies next time the app restarts on its own.

---

## 13. AI backend — Gemini, and how it's different from offline AI

**There's a Gemini API key already provisioned on the server — store and reference it via an environment variable, never in client-side code**, per the Tier 1 security rule already established. This is the backend for: OCR (Section 7), Quiz Generation and the Study facts card (Section 8), and any other cloud-AI-powered utility in Tools.

**This is a separate system from offline AI, and the two shouldn't be conflated in the build:** offline AI (Study tab) is the on-device model a student downloads and runs locally, zero data cost after download, no server involved. Gemini is a cloud call, server-side only, used for the specific utility features listed above where an on-device model isn't the right fit (or isn't available yet, e.g. on the web version). Keep the implementation — and the UI language describing each to students — clearly distinct.

---

## Priority tiers for this round

**Fix first, nothing else matters until these are solid:** Vault upload broken · Admin/Association dashboards not loading · offline AI download broken · the Vault error-bleed bug · keyboard/viewport bug · theme gaps on Profile/Verification/offline-AI screens.

**Then:** Tools functionality pass (kill every "Soon") · notification system · Admin/Association feature builds · onboarding final copy · Home/To-Do's fix.

**Then:** design system refinements (Pop default-card style, Glass glow richness, footer redesign) · Quiz Generation · dynamic facts card · background-update popup behavior.

**Last:** Android overlay bubble (native-only, and still needs the visual/trigger decision above) · branded class notifications (also still needs your reference image).
