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
| Offline AI (Qwen 2.5 0.5B) + Focus Mode | Full |
| Notes (private, on-device) | Full |
| OCR → Save as note | Full |
| Image to PDF | Full |
| CGPA Calculator / Predictor | Full |
| Community library (browse, search, download, contribute) | Full, no quota |
| Private Vault uploads | Up to a sensible allowance (see below) |

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

- **Capability gate:** `isPremiumCapability(capability)` in
  `mobile/src/utils/premium.ts`. All off today. When subscriptions ship, the
  gate reads the user's plan from the backend (`/me/plan`) with a local cache
  so the offline-first principle is preserved (no network = free capabilities,
  never a broken app).
- **No UI yet:** nothing in the app references premium state. The module is
  the placeholder so future work has a single, reviewable boundary.
- **Privacy boundary (unchanged):** private documents are never used for model
  training, never surfaced publicly, and never shared with the community.
  Public resources are community contributions under the Terms of Use.
