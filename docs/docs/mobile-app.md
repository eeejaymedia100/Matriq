# Mobile App Requirements

**This is the Student app — the ONLY mobile app.** The Association Dashboard and Admin Console
are separate Next.js web apps (see `docs/architecture.md`). This mobile app ships to the App
Store and Play Store. Nothing else does.

Framework: React Native + Expo (see `docs/tech-stack.md` for why). This document maps the
prototype's screens to real app requirements — build these against the real backend from
`docs/backend-api.md`, not mocked local state.

## Screen inventory (student journey — build this first, per `agenda.md`)

| Screen | Prototype behavior | Real-app changes |
|---|---|---|
| Identity Bridge | Staylite/Fresher fork, form validation | See `docs/onboarding-flows.md` in full — no portal password collected, both paths now include document upload after registration for executive-review verification |
| Identity Sync | Animated checklist | Cosmetic only, low priority to get exactly right |
| Dashboard | Profile, due-date countdown, badges, membership chips, shortcuts | Wire every card to real data; the due-date countdown is computed from the real `fees.due_date` |
| Fee Details | Amount, due date, transparency breakdown | Transparency breakdown is now editable by the association's President — pull it live, don't hardcode |
| Payment Summary → Gateway → Verification | Simulated processing | Replaced entirely by the real Paystack flow, see `docs/payment-integration.md` |
| Digital Receipt | QR + details, download, share card | QR must be a signed payload now, not a decorative pattern; share card render logic can port largely as-is |
| Payment Complete | Confetti, rank badge, share card | Rank is now `rank_at_payment`, computed server-side at the moment of verified success |
| AI Study Companion | Canned chat responses | Real calls to `POST /v1/ai/query`, see `docs/ai-model.md` |
| Announcements | List, pinned, author/role | Add "mark as read" call on view, for the read-receipt feature |
| Association Services | WhatsApp deep links (`wa.me`) | Unchanged in behavior — this stays external by design |
| Payment History | List of past payments | Real data from `/v1/me/payment-history`, paginated |
| Events | List, RSVP toggle | Real RSVP calls, live attendee counts |
| Profile quick-edit | Modal, name/department/level | `PATCH /v1/me` |
| Verification Upload | Upload student ID / portal screenshot | `POST /v1/me/verification/upload` |
| Verification Status | View pending/approved/rejected status + reason | `GET /v1/me/verification` |

## Screen inventory (NOT in the mobile app)

**Association Dashboard** and **Admin Console** are separate Next.js web apps (see
`docs/architecture.md` and `docs/tech-stack.md`). They are NOT screens inside this mobile app.
There is no code path in the mobile app that leads to an executive or admin route — these are
genuinely separate codebases and deployments with their own auth models. The mobile app is
Student-only, by design.

## Cross-cutting requirements

- **Light/dark mode** — the prototype's theme system (CSS custom properties swapped via a
  `data-theme` attribute) translates to React Native as a theme context provider with the same
  color tokens; port the token values directly, including the contrast-corrected light-mode
  accent (`#2E6B00`, not the raw neon lime) and the `on-accent`/`on-success` text-color pairing
  logic — don't reintroduce the contrast bug the web version had.
- **Offline handling** — unlike the web prototype, a real mobile app needs to behave sensibly
  with no connection: cached read-only views (last-known Dashboard, Announcements) via
  `react-query`'s cache, clear "you're offline" states on anything requiring a live call
  (payment, AI query).
- **Push notifications** — payment confirmation, new announcement, event reminder. Needed for a
  real app in a way the prototype (browser-only) never required; scope this for Phase 5+.
- **Deep linking** — a payment webhook completing while the app is backgrounded should be
  reflected the next time the app is opened, ideally via a push notification deep-linking
  straight to the receipt.
- **Accessibility** — reasonable baseline (proper labels, contrast already handled by the theme
  tokens above, minimum tap target sizes) — not exhaustively specified here, but don't regress
  below what a default React Native + accessible-components setup gives you for free.

## What not to build

- No in-app implementation of Course Registration, Merch, Tickets, or Past Questions requests —
  these stay WhatsApp hand-offs (`docs/payment-integration.md` explains why this is deliberate).
- No second fully-functional association membership pipeline until there's a real second
  association to onboard (`agenda.md` non-goals).
