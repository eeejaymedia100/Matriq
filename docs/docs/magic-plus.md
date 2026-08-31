# Magic Plus — premium foundation (architecture, not a paywall)

This document defines *how* Matriq will eventually monetize without ever
feeling like it charges rent for basic student life. It deliberately does NOT
implement a subscription system yet — it sets the capability boundaries so the
product can grow into them cleanly.

## Philosophy

- **The free tier is genuinely useful.** Offline AI, notes, OCR, Image to PDF,
  the CGPA tools, the Community library and the Vault are free, forever. They
  are the reason students use Matriq; they are never the hostage.
- **Magic Plus is an optional upgrade** for students who want more power,
  convenience and personalization. No fake urgency, no dark patterns, no
  forced subscriptions, no aggressive blocking.
- **Charge where Matriq actually spends.** Students resist paying for ordinary
  apps because free alternatives exist. The things worth charging for are the
  ones whose cost to Matriq grows with usage: private storage, high-quality
  processing, deeper AI/document work, notifications.
- **The community ecosystem stays free.** Its value increases with every
  contributor, so a paywall in front of contributing (or browsing) the
  Community library would be self-defeating. Public academic resources are the
  network effect, not the product to sell.

## What free users get (today, and by design)

| Area | Free (always) |
| --- | --- |
| Offline AI (Qwen 2.5 0.5B) + offline chat | Full |
| Focus Mode (cloud, DeepSeek) | **Free allowance: 10 uses** — then Magic Plus only |
| Notes (private, on-device) | Full |
| OCR → Save as note | Full |
| Image to PDF | Full |
| CGPA Calculator / Predictor | Full |
| Community library (browse, search, download, contribute) | Full, no quota |
| Private Vault uploads | Up to a sensible allowance (see below) |

## Entitlement foundation (shipped)

Focus Mode is the first real Magic Plus feature: it calls DeepSeek (via the
backend, never from the app), so every request has a real cloud cost. The
entitlement layer lives in `backend/src/entitlement/` and is the single source
of truth for premium access:

- **Backend authority.** The backend gates every Focus Mode request — the app
  never decides entitlement, and a client-side premium flag is never trusted.
- **Free allowance.** Every account starts with **10 free Focus Mode uses**
  (`FocusModeUsage` counts consumed uses per user). After the 10 free uses, the
  endpoint returns a paywall (Magic Plus required) error; the app shows the
  upgrade prompt.
- **Pluggable plans.** `MagicPlan` (seed: `PLUS` = unlimited + free tier) reads
  from the DB, so future subscription/pass providers (Stripe, a term pass) just
  grant a plan. Quotas are config constants, not hardcoded all over the code.
- **Abuse protection.** Per-user rate limiting (throttler) + a configurable
  daily cap, so one automated client can't drain the DeepSeek balance.
- **Offline-first is preserved.** Offline AI stays entirely free and local; only
  the *cloud* Focus Mode is gated.

## What Magic Plus can eventually offer

Each capability is tagged in `mobile/src/utils/premium.ts` (`PremiumCapability`)
so the boundary stays explicit and reviewable in one place. None are built yet.

1. **Larger private storage allowance.** Private files directly create storage
   cost, so a generous-but-capped private allowance is the natural free limit —
   and a larger allowance is the natural premium perk. This is a *limit that is
   actually necessary*, stated transparently, not an artificial gate. The
   Community library stays unlimited: public resources are the network effect.
2. **Higher-quality processing.** Full-resolution OCR (free OCR is downscaled
   to keep it fast on low-end phones), larger uploads, batch document jobs,
   priority processing for long tasks.
3. **Document intelligence.** Search inside your own materials, smart
   summaries, auto-tagging, and eventually answers grounded in YOUR vault —
   deeper personalization that free users don't need to survive.
4. **Advanced study planning.** Spaced-repetition scheduling, adaptive focus
   plans, deadline planning with real notifications. Automation and
   personalization at scale, not basic utilities.
5. **Cloud backup & sync** of private notes/materials across devices —
   a convenience that costs real infrastructure.

## Pricing posture (for when it ships)

- Low-friction: one simple tier, student-friendly price, monthly + term
  options.
- Transparent limits: any cap is shown *before* the user hits it, with a clear
  reason (e.g. "private storage costs us real money; the Community library is
  free forever").
- Optional upgrade: a calm "Magic Plus" entry in Settings/Profile, not
  interruptive upsells.
- No deceptive patterns: no countdown timers, no fake discounts, no locking
  previously-free features.

## Architecture notes

- **Capability gate:** `mobile/src/utils/premium.ts` (`PremiumCapability`) plus
  the new `mobile/src/hooks/useEntitlement.ts` hook. The hook fetches
  entitlement state from the backend and caches it locally so the offline-first
  principle holds (no network → the app degrades gracefully, never breaks).
- **Provider chain (backend, never the app):** Focus Mode uses **DeepSeek as
  primary** (`DEEPSEEK_API_KEY` server-side only), then fails over to NVIDIA
  NIM and then Gemini. The key never leaves the backend; the app only talks to
  `POST /v1/focus/*` on the Matriq backend.
- **Staged + cached to control cost:** the initial request generates the overall
  concept map + core concepts; expanding an individual concept fetches details
  on demand. Common topics are cached server-side (normalized keys, keyed with
  prompt/model version) so identical topics don't re-bill.
- **Privacy boundary (unchanged):** private documents are never used for model
  training, never surfaced publicly, and never shared with the community.
  Public resources are community contributions under the Terms of Use.
