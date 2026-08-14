# Matriq — Complete Product & UI Spec

This is the only document the coding agent needs for this pass. It is fully self-contained — every screen, every feature, every design decision made across this whole planning process, plus this round's changes, folded into one place. Nothing here should require guessing.

---

## 0. Read this first

**Context:** Matriq (matriq.app) is a live app for Nigerian university students, currently deployed with real users — this is a major overhaul of an existing product, not a greenfield build. Inspect the existing codebase before changing anything; preserve what already works correctly and isn't addressed here.

**Stack:** do not assume Firebase, Firestore, or any other specific backend anywhere in this document. Every instruction is written stack-agnostic on purpose ("your database," "your backend," "a server-side endpoint"). Check what the project actually runs on before writing new backend code.

**Platforms — both are first-class, not an afterthought:** Android ships first (native/store-friendly path, easier approval). A **web version exists for iOS users**, who use it until a native iOS path is worth the App Store review overhead. The web version has **no offline AI** — that section degrades gracefully there with a clear "not available on web yet, coming with the Android app" message rather than a broken or missing section. Build every screen with both targets in mind from the start, not web as a stripped-down afterthought.

**Tagline, everywhere in the app:** **"The smart way."** Replace any previous tagline wherever it currently appears — splash/loading text, onboarding, footer copy, anywhere else.

**Priority philosophy:** the goal of this pass is a bug-and-error-free app, not the largest feature list possible. Where narrower-but-solid and wider-but-shaky compete, take narrower-but-solid. Section 16 has the full tier breakdown.

---

## 1. Resolved decisions — read this before anything else in the doc

Several things went back and forth during planning. These are now final, no ambiguity left:

- **Settings is its own bottom-nav tab**, not a sheet opened from an avatar. Five tabs total.
- **Account deletion is hard-delete only** (no separate "disable" feature) — full detail in Section 10.
- **CGPA: A = 70%** on the standard Nigerian NUC 5-point scale (confirmed, not just a default).
- **Re-authentication is a 6-digit passcode**, not full login, triggered after **3 hours** away from the app — not the earlier 1-minute idea. Full flow in Section 5.
- **School portal integration is a plain link only** — no credential storage, no popup, no pre-fill, in any version. Fully decided, not deferred.
- **OTP entry is 6 individual boxes**, not a single text field.

**One thing is still genuinely open and needs real-world testing, not a desk decision:** which offline AI model(s) to ship, and the exact download-size/RAM numbers shown in the UI (Section 9). Test on an actual low-end Android device before locking that copy in.

---

## 2. Design system — Glass & Pop

**Brand constants, unchanged across both themes:** Plus Jakarta Sans only (weights 400–800 for hierarchy — no second typeface). Deep purple + electric lime as the only two accent hues in both themes. This consistency is what makes the two themes read as one product instead of two.

| Token | Hex | Use |
|---|---|---|
| `--purple-950` | `#14061F` | Glass base background |
| `--purple-600` | `#55278F` | Pop brand accent |
| `--purple-500` | `#7B4BC4` | Avatar gradients, both themes |
| `--lime-500` | `#C6FF3D` | Primary accent, both themes — never used under body text, always means "this is alive, look here" |
| `--lime-400` | `#DBFF7A` | Lighter lime, on-dark text/hover |
| `--ink` | `#170B26` | Pop text, brutalist borders/shadows |
| `--paper` | `#F5F1FB` | Pop base background |

**Glass (dark).** Never flat black — the background is a purple so deep it reads as void until 2–3 large, slow-drifting blurred color blobs (lime, violet, a whisper of magenta) bloom behind everything, giving the frosted surfaces (`backdrop-filter: blur(20px) saturate(160%)`) something to actually refract. Every card sits on top of that as translucent glass, colour visible and softened behind it. Motion is fluid and continuous — 400–600ms, `cubic-bezier(.16,1,.3,1)`, never bouncy. Signature moment (spend the boldness here, nowhere else): the bottom nav's active-tab marker is a soft lime blob that slides and stretches to the next icon rather than jumping.

**Pop (light).** Soft lavender-white base. Every card looks pressed from pale clay — a gentle dual shadow that makes it look faintly raised, like you could push a thumb into it. On top of that softness, the one important thing per screen (a hero card, the primary button, a status badge) gets a thick `--ink` border, a hard offset shadow with no blur, and sometimes a 2–3° rotation for a sticker feel. Tapping one of those collapses the offset shadow as the element visibly presses down, then springs back — the tactile signature of this theme. Motion: snappy with slight overshoot, 150–250ms, `cubic-bezier(.34,1.56,.64,1)`.

**Both themes:** icons are inline SVG only, never an icon font (this was the direct cause of the broken-glyph bug on the current Verification Pending and email-verify screens — fix by migrating off icon fonts entirely). Respect `prefers-reduced-motion`. Keep keyboard focus visibly marked. One small sparkle icon (four-point, like a tiny flash) is reserved exclusively for anything AI-touched — the offline AI section in Study, nowhere else — so it stays a signature instead of wallpaper.

**The test for every screen:** it should feel like something a student pulls out in a lecture hall that makes the person next to them lean over and ask what it is.

---

## 3. Information architecture

**Bottom nav — five tabs: Home · Vault · Tools · Study · Settings.**

There is no dedicated "AI" tab. A cloud AI Companion was considered and cut for this version — too much competition in that specific space, and Matriq's offline-first AI is the actual differentiator worth building well first (see Section 9). The nav slot that would have said "AI" is repurposed as **Tools** — practical utilities, not a chat interface.

---

## 4. First-run experience

**Theme picker — the very first screen, before onboarding, before anything else.** Background is neutral, doesn't commit to light or dark, since nothing's chosen yet. Two cards, each with a living preview rather than a flat label — the Glass card already has a soft blur breathing behind it, the Pop card already shows a small clay shadow under a lime dot. Choosing one transitions the whole interface into that theme immediately, no flash of the wrong theme first.

**Onboarding.** Three or four fast slides, each built around one concrete promise, not a paragraph: the offline AI, the Vault, low-data/offline-first design. Payment/dues gets at most one quiet line near the end, not a slide of its own — it is not the reason someone should install this app.

**Registration.** Fresher/Staylite choice, then the form. **Every field validates live as the student fills it in — not just at submit.** If they jump between fields out of order, whichever are still incomplete or invalid should already be visibly flagged, so nothing is a surprise at the end. (Worth noting: the app's own last update notice already promised "live field validation" and "friendly error messages" — this spec is what actually delivers on that.) Includes the required Terms of Use checkbox (Section 14) before account creation completes.

**OTP verification.** Six individual digit boxes, not one text field — auto-advance focus as each digit is entered, support pasting a full 6-digit code from clipboard/SMS suggestion directly into the first box and filling all six, auto-submit once all six are filled.

**Passcode creation — mandatory, immediately after verification succeeds, before the student ever sees Home for the first time.** This is where the 6-digit passcode from Section 5 gets set. Not optional, not a My To-Do's card — every account needs one before it's usable, since it's the mechanism protecting the account afterward.

---

## 5. Returning-user flow (session & passcode system)

This replaces any assumption that a returning user sees the sign-in/create-account screen again. Logic:

- **First-ever open (no account yet):** theme picker → onboarding → registration → OTP → passcode creation → Home. As above.
- **Every open after that:** never show the sign-in/create-account screens again. Instead:
  - **Less than 3 hours since the app was last exited:** go straight to Home, no prompt at all.
  - **3 hours or more since last exit:** show a **"Welcome back, [Name]"** screen requesting the 6-digit passcode before proceeding.

**The passcode entry screen needs real design attention — "very modern," not a bare number pad.** Treat it as its own themed screen (Glass/Pop per the student's chosen theme): six individual filled/outline boxes that light up or fill in as digits are entered, satisfying micro-feedback per digit (in Glass, a soft glow per box as it fills; in Pop, a small clay-press per box), a shake/error state on a wrong code, and — a reasonable addition worth confirming with Julius rather than assuming — device biometric (fingerprint/face) offered as a faster unlock alongside the passcode, with the passcode always available as the fallback.

Track the "last exited" timestamp from the moment the app loses foreground focus, not just from a hard close, so backgrounding counts the same as closing.

---

## 6. Home

**Header:** avatar · "Hello, [Name]" · directly beneath, small and unobtrusive, the live date and time · a status badge on the right (verification state, or a badge earned per Section 11).

**My To-Do's** — horizontal-scroll row, sits right under the header. Four cards: **Set up your timetable · Set up offline AI · Upload study materials · Add a profile photo.** (Passcode isn't here — it's mandatory during account creation per Section 4, not an optional to-do.) Each card launches its real flow elsewhere in the app and **disappears from the row the moment that task is genuinely completed** — check actual completion state, not just "visited the screen." When all four are gone, remove the section entirely. Completing all four awards a badge (Section 11).

**Hero card:** rotating interesting facts, terminology, and definitions relevant to the student's own courses — this is what replaced the AI Companion hero card. **Don't call any AI live on a timer** — generate or extract a batch once (from the student's own uploaded materials via simple text extraction, or the offline AI model in one pass if installed) and cycle through the cached batch client-side roughly once a minute. If the student has neither uploaded materials nor installed offline AI yet, show a friendly nudge toward those two To-Do items instead of an empty card.

**Below the hero:** smaller cards for Vault and today's next class (Timetable-at-a-glance). **No Dues card anywhere on Home** — fully relocated to Settings (Section 10).

**Announcements:** horizontal-scroll row of fixed-aspect "confined space" cards, each holding either a flyer image (contained/cropped cleanly, never stretched) or a short text announcement in the same card shape, so the row stays visually consistent regardless of content type.

---

## 7. Vault

The shared, cross-student academic database — materials students contribute for each other, not personal-only storage (that's Tools' File Compressor / general utilities instead).

- **Search**, course-code first.
- **Past-Question Vault** — same database, filtered to past exam questions.
- **Upload flow:** every upload is marked **Public** (visible to relevant students, scoped by course/school) or **Private** at upload time. First upload specifically (not just first registration) surfaces the Terms of Use (Section 14) — a separate trigger point from the registration checkbox.
- **Smart storage:** true lossy compression can't be losslessly "uncompressed" back to the original — that promise would eventually break trust the first time someone compares files. The correct version: **keep the original untouched, generate a lightweight companion version alongside it automatically on upload**, and let the student pick whichever they need — light for bad data, original when detail actually matters.
- This shared corpus (covered by the consent already in the Terms of Use) also becomes the training data for a Matriq-specific model later — worth a line in the upload flow's copy, not the headline of the screen.

---

## 8. Tools

Practical utilities — fast, obviously useful within seconds, no AI-hype framing.

**Document utilities:**
- **Image to Text (OCR)** — validate real text was actually detected before returning a result; if confidence/character count is near zero, show "No readable text found — try a clearer photo" instead of returning garbage or emptiness.
- **Image to PDF**, **File Compressor** (general-purpose version of Vault's auto-compression, usable on any file, not just Vault contributions).
- Worth adding, confirm which before building all of them: PDF merge/split, PDF↔Word conversion, a passport-style photo background remover (realistic on-device via an image segmentation model), a citation generator (APA/MLA/Harvard).

**CGPA Calculator.** Nigerian NUC 5-point scale, confirmed: A = 70–100% (5pts), B = 60–69% (4pts), C = 50–59% (3pts), D = 45–49% (2pts), E = 40–44% (1pt), F = below 40% (0pts). CGPA = Σ(grade point × units) ÷ Σ(units). Classification: First Class 4.50–5.00 · Second Upper 3.50–4.49 · Second Lower 2.40–3.49 · Third Class 1.50–2.39 · Pass 1.00–1.49.

**CGPA Predictor**, same page, clearly separated section. Exact formula, not a suggestion to improvise:

Inputs: current CGPA · total units completed so far (mathematically required even though not in the original ask — you cannot solve for future grades needed without knowing how many units already exist in the average) · desired CGPA · a timeframe presented as friendly choices ("Next semester," "This academic year," "By final year") translated internally to a semester count using the student's registered Level · expected units for the upcoming semester(s).

```
QP₀ (current quality points)        = CurrentCGPA × UnitsCompleted
Uf  (total future units)            = units per semester × number of semesters
QPt (required total quality points) = TargetCGPA × (UnitsCompleted + Uf)
QPneeded                            = QPt − QP₀
GPrequired (average GP needed going forward) = QPneeded ÷ Uf
```

If `GPrequired` exceeds 5.0 (the maximum), the target isn't reachable in that timeframe — say so plainly, show what CGPA *is* reachable assuming straight A's from here, and suggest a longer timeframe as the constructive alternative. This is the "2.41 to 4.50 in one semester" case. Otherwise, show 2–3 illustrative example grade combinations that clear `GPrequired` (e.g. "all B's clears this," "3 A's with the rest at C also clears this") — not an exhaustive enumeration of every mathematically possible combination.

**School Portal link** — last item in Tools. Opens `https://portal.delsuces.online/Defaultt` in a new tab (worth confirming that URL directly — the double "t" is unusual). **Plain link only, fully final:** no credential fields, no popup, no pre-fill, in this version or any future one described here — Julius has explicitly decided not to take on the security/liability weight of handling student portal passwords.

**Portal Services → WhatsApp.** Course Registration, Pay School Fees, and similar actions each open a `wa.me` link to a single configurable phone number (+234 705 250 1821 currently — store it once, reference everywhere, since it's expected to change) with a distinct pre-filled message per action stating exactly what the student needs.

---

## 9. Study

No cloud AI Companion, no Course Intel (no peer-visible layer at all in this version — "every student to his app").

Order, top to bottom:
1. **Rotating fact/term card** — identical mechanism to Home's hero card (Section 6); implement once, reuse, don't build it twice.
2. **Offline AI setup** — first real functional block. If multiple models are offered, present them as distinct choices, each showing: download size (data cost), rough phone RAM needed, and one plain-language pro ("smaller and faster, less detailed" vs. "larger, better accuracy, longer download"). **Still open per Section 1 — needs real low-end-device testing before the numbers in this copy are final.**
3. **Timetable** — this is what Home's "Set up timetable" To-Do card links into.
4. **Uploaded materials/books shortcut** — this student's own saved items, distinct from Vault's shared cross-student view.
5. Worth adding, confirm before building all three: flashcards with spaced repetition, a Pomodoro-style focus timer, a deadline/assignment tracker.

---

## 10. Settings (its own tab)

Full tab now, not a sheet. Rows, top to bottom:

1. **Appearance.** Switching themes triggers a brief themed loading sequence rather than an instant flip: the phrase builds as **"Changing the Perspective"** → **"Changing the Narrative"** → **"Changing the Objective,"** with the final word of each phrase (*Perspective, Narrative, Objective*) rendered in a different accent color as it appears, completing before the new theme actually applies.
2. **Profile** — edit name, matric number, faculty, department, level, photo.
3. **Dues & Payments** — lives here only, never on Home. Conditional: if the student's association has registered for dues collection, show the real payment flow; if not, a well-styled, on-brand **"Coming Soon"** state, not a bare placeholder.
4. **Notifications, Data & Offline, Verification, Terms of Use & Privacy, Help & About** — standard rows.
5. **Sign Out.**
6. **Delete Account — the only account-removal action; no separate "disable."** Hard delete, but not immediate: on request, the account is scheduled for deletion **6 months out**, and the student is told this explicitly and clearly at the moment they request it — plain language that logging back in any time before the 6 months are up cancels the deletion and restores the account exactly as it was. After 6 months with no login, the hard delete actually executes and is not recoverable after that point. (In effect, the 6-month window also functions as the account being quietly inactive/hidden during that period, which is why a separate "disable" feature isn't needed on top of this.) Needs a type-to-confirm step at request time, not a single tap.

---

## 11. Badges & celebrations

No streak mechanic. Badges instead, awarded for real completed actions — finishing all four My To-Do's items is the first concrete trigger, more will follow later. The unlock moment needs an actual celebration: particle burst/confetti, a bounce-in reveal, a glow sweep — not a badge quietly fading into a list. Evaluate an existing lightweight library built for exactly this (e.g. `canvas-confetti`) rather than hand-building particle effects. Build it as one reusable "badge unlock" component/event so future badges can trigger the same celebration without new animation work each time.

---

## 12. Error handling

Julius's instinct here — three things a user should see: what happened, what caused it, what to do — turns out to match decades-established UX practice closely. Jakob Nielsen's foundational 10 usability heuristics include, as heuristic #9, helping users recognize, diagnose, and recover from errors — recognize maps to "what happened," diagnose to "what caused it," recover to "what to do." Current guidance from Nielsen Norman Group (nngroup.com, "Error-Message Guidelines") stays close to the same shape: error messages should be highly visible, communicate constructively, and respect the user's effort, written in human-readable language that concisely and precisely describes the issue and offers constructive advice, without blaming the user.

**Concretely, for every error surfaced anywhere in the app:**
1. **What happened** — plain English, no technical jargon, no raw error codes or stack traces surfaced to the user. This is a security concern as much as a UX one: raw errors can hint at exactly the kind of implementation detail (endpoint names, library versions, internal logic) that helps an attacker, so nothing beyond the friendly message should ever reach the client-facing UI.
2. **What caused it** — the plain-language reason, where knowable ("No internet connection," "That file is too large," "This code has expired").
3. **What to do** — one clear, specific next step, not a generic "try again."

**Implementation:** build one centralized error-handling/translation layer that every part of the app routes through, mapping real backend/network errors to these friendly three-part messages, rather than letting individual screens catch and display raw errors ad hoc. This keeps the messaging consistent and makes it structurally impossible for a raw error to leak through by accident.

---

## 13. Security hardening

**Tier 1 — blocking, applies to whatever backend the project actually runs on:**
- No AI/LLM key or payment-provider secret key in client-side code — route those calls through a server-side endpoint.
- Scan full git history (not just current files) for anything ever committed; rotate anything found rather than only deleting the file.
- Access-control rules at the database layer: a student can only read/write their own record, and cannot self-edit fields like payment or verification status directly.
- Payment confirmation verified server-side against the provider's real verify endpoint — never trusted from the client.

**Tier 2 — confirm, don't rebuild:** password hashing and session/token handling are almost certainly already handled by the existing auth system — confirm it's being used as intended rather than building anything custom alongside it.

**Tier 3:** rate-limit login (the same instinct already applied to verification emails after real abuse); bot protection on registration (genuinely relevant given the NAAS/SUG voting platforms Julius has already shipped, where fake accounts are a proven incentive, not theoretical); sanitize/escape user-generated text before render; server-side file-type/size limits on uploads, not just the file picker's client-side `accept` attribute.

**Tier 4:** security headers on the hosting config, dependency scanning, trimming API responses to only what a screen needs.

---

## 14. Terms of Use integration

Generated via Termly for **GARÉ INDUSTRIÉS** (Nigeria-registered, Udu, Delta State), covering the Matriq app. What was shared during planning cut off mid-document — get the complete export or hosted Termly link before building against it. Separately worth confirming: does a Privacy Policy exist alongside it? Matriq collects verification documents and payment data, which typically needs one.

**Trigger points:** Settings → Terms of Use & Privacy row · required checkbox on registration before account creation completes · Vault's first-time upload flow (Section 7).

Legal body text keeps its own plain, high-contrast styling regardless of theme — wrap it in the app's current header chrome only; no Glass blur or Pop clay/brutalist decoration on the dense paragraphs themselves.

---

## 15. Platform behavior & admin

**Background updates:** new versions download silently in the background — no blocking modal, no visible progress bar demanding the app stay open (this directly replaces the app's current "downloading… 17%, keep the app open" modal). The app restarts once the download completes, ideally at a natural reopen rather than interrupting an active session.

**Web vs. Android**, reinforced: Android is the primary path; the web version serves iOS users until a native path is worth building, and excludes offline AI specifically, with a clear in-app message rather than a broken section. Every screen in this spec should be built with both targets in mind, not designed for Android first and retrofitted.

**Admin:** should see the operational side of most of the above — extend the bulk-approval/CSV-export patterns already built for the NAAS/SUG voting platforms rather than inventing a new admin pattern. Concretely: a Vault moderation queue for public uploads, the verification review queue, a dues/payment overview per association, and basic user management (view/delete) using the same deletion policy from Section 10.

**Build principle throughout:** more updates are coming after this pass — favor a modular, flag-able structure over hardcoded assumptions that would block extending any of these systems later. Speed and accuracy take priority over visual flourish anywhere the two trade off against each other.

---

## 16. Priority tiers & suggested build order

**P0 — foundation, nothing else works without these:**
Design system + 5-tab nav + theme picker (Sections 2–4) → passcode/session system (Section 5) → Home minus AI hero (Section 6) → Vault core (Section 7) → Settings core incl. dues relocation and the finalized delete flow (Section 10) → centralized error handling (Section 12) → Security Tier 1 (Section 13).

**P1 — the features that make daily use real:**
Tools core utilities + CGPA calculator/predictor (Section 8) → Study core (Section 9) → Terms of Use multi-trigger integration (Section 14) → Security Tier 3.

**P2 — polish and expansion, confirm exact scope before building:**
Badges + celebration effects (Section 11) → extra Tools utilities → Portal Services/WhatsApp routing → background-update mechanic → admin additions → extra Study features (flashcards/timer/deadline tracker).

Build order: `0/1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9 → 10 → 11 → 12 → 13 → 14 → 15`
