# Matriq — Build Agenda

## Objective

Turn the Matriq prototype (a single self-contained HTML file demonstrating the student journey,
association dashboard, and admin console) into a real, installable mobile application for iOS
and Android, backed by a secure backend and a self-hosted AI study companion — built and operated
by an autonomous coding agent running persistently on a GCP server, accessed via Termux + tmux.

## Ground rules for every phase

1. **Security is not a phase — it's a constraint on every phase.** Read `security.md` before
   Phase 1 and do not violate it to move faster. If a shortcut in this agenda conflicts with
   `security.md`, `security.md` wins.
2. **Nothing goes to production undocumented.** Every schema change, every new endpoint, every
   new environment variable gets written down as it happens, not after.
3. **The agent must be resumable.** Sessions will drop. Work in small, committed increments.
   See `docs/agent-workflow.md`.
4. **Student-journey first.** The prototype's biggest, most-used surface is the student flow
   (identity, dues, receipts, AI companion). Build and harden that before the association/admin
   surfaces, even though they exist in the prototype already.
5. **No feature ships without its cost and its owner being clear.** Apple Developer Program
   ($99/yr), Google Play Console ($25 one-time), GCP compute (variable, higher if a GPU is used
   for the AI model), and a payment gateway's transaction fees are real costs — confirm before
   provisioning, don't assume.

## Phases

### Phase 0 — Foundations (no user-facing code yet)
- Repo created, branch protection on `main`, `.gitignore` covers all secrets/env files.
- GCP VM provisioned, hardened per `security.md` (SSH key-only, non-root deploy user, firewall).
- tmux session convention established (`docs/agent-workflow.md`).
- CI skeleton running (lint + a "hello world" test) on every PR — before there's real code to
  test, so the pipeline is never the thing blocking a later phase.
- Secrets management decided and wired (GCP Secret Manager, not `.env` files in git).
- `docs/progress-log.md` initialized.

**Definition of done:** an empty backend project and an empty mobile project both build green in
CI, and a human can SSH into the GCP box and see nothing sensitive sitting in plaintext.

### Phase 1 — Backend core + data model
- Database schema implemented per `docs/data-model.md`.
- Auth implemented: registration (Staylite + Fresher paths, see `docs/onboarding-flows.md`),
  login, session/token handling, password hashing (Argon2id — see `security.md`).
- RBAC implemented: Student, Treasurer, President, P.R.O., Admin — matching the roles already
  designed in the prototype.
- Audit logging for every admin/executive action from day one, not bolted on later.

**Definition of done:** every endpoint in `docs/backend-api.md` marked Phase 1 exists, is
authenticated correctly, has tests, and passes the CI security scan.

### Phase 2 — Mobile app: student core flows
- Identity Bridge (Staylite + Fresher), Dashboard, Fee Details, Payment Summary screens.
- Wired to the real backend from Phase 1 — no more mocked state.
- Runs on a real device via the fastest available loop (see `docs/release-distribution.md`) —
  don't wait until Phase 8 to see this on a phone for the first time.

**Definition of done:** you can install a debug build on your own phone and complete the flow
from "open app" to "see your dues" against the real backend.

### Phase 3 — Payments
- Real payment gateway integrated per `docs/payment-integration.md` (Paystack recommended for
  Nigerian cards/transfers/USSD).
- Webhook verification, idempotency, reconciliation job.
- Digital receipt + QR generation, matching the prototype's design.
- Shareable payment card (the canvas-rendered "flex card") ported to native.

**Definition of done:** a real test transaction (Paystack test mode) completes end-to-end and
produces a verifiable receipt, with the webhook path covered by tests, not just the happy-path
in-app confirmation.

### Phase 4 — AI Study Companion (self-hosted)
- Model server stood up per `docs/ai-model.md` (Ollama + a quantized open-weight model).
- Retrieval pipeline (pgvector) wired to a moderated ingestion pipeline for past questions and
  student-submitted materials.
- Mobile app's AI Companion screen calls your own backend (which calls the self-hosted model) —
  never a third-party AI API, and never the model exposed directly to the internet.

**Definition of done:** a real query against real ingested course material returns a grounded
answer, and the ingestion pipeline rejects unmoderated/unsafe content by default.

### Phase 5 — Announcements, Events, Services, Association Dashboard
- Remaining student-facing screens from the prototype: Announcements (with read receipts),
  Events (with RSVP), Services (WhatsApp handoff, unchanged from prototype — this stays external
  by design, don't build a in-app version of something you deliberately chose to keep external).
- Association Dashboard: role-aware (President/Treasurer/P.R.O.), leaderboard, fund transparency.
- Admin console: kept genuinely separate and access-gated (see `security.md` — this is not the
  "click the logo 5 times" prototype trick anymore; it needs real auth).

### Phase 6 — Security hardening pass
- Full pass against every item in `security.md` that couldn't be verified incrementally.
- Dependency and container vulnerability scan clean.
- Rate limiting and abuse protection load-tested, not just implemented.
- If budget allows: an external or semi-automated penetration test before Phase 8.

### Phase 7 — CI/CD maturity
- Full pipeline per `docs/ci-cd.md`: automated mobile builds (EAS Build), automated backend
  deploys with manual production approval gate, automated rollback path.
- Staging environment that mirrors production, used for every release before it ships.

### Phase 8 — Distribution and real-device testing
- TestFlight (iOS) and Play Console Internal Testing (Android) both live, per
  `docs/release-distribution.md`.
- You (the human) test the full app on your own phone, both platforms, before any wider testers
  are invited.

### Phase 9 — Launch
- NDPR-compliant privacy policy published in-app (see `docs/compliance-privacy.md`).
- Monitoring and alerting live (not just logging — someone/something gets notified on failure).
- Rollback plan rehearsed at least once before this phase closes.

## Explicit non-goals for v1

- Multiple simultaneous association memberships with independent dues pipelines (the prototype
  stubbed this — keep it stubbed until there's a second real association to onboard).
- True on-device continuous learning for the AI model (see `docs/ai-model.md` for why, and what
  you get instead).
- Building native iOS/Android separately — cross-platform (see `docs/tech-stack.md`) unless a
  specific native requirement forces a fork later.

## Priority order when phases conflict for agent time

1. Security requirements that block Phase 1 (auth, RBAC, secrets).
2. Anything that blocks getting a real build onto your phone (Phase 2 → Phase 8 dependencies).
3. Payment correctness (money bugs are the worst kind of bug to ship).
4. Everything else.
