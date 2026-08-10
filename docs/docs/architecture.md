# Architecture

## Three deployables, one backend

Matriq is three separate applications, not one app with role-based routing:

```
                         ┌─────────────────────────────────────┐
                         │          Backend API (NestJS)        │
                         │    Auth · RBAC · Payments · AI · …   │
                         └───┬───────────────┬──────────────┬───┘
                             │               │              │
            ┌────────────────▼──┐  ┌─────────▼────────┐  ┌──▼──────────────────┐
            │  Student Mobile   │  │  Association      │  │  Admin Console      │
            │  React Native     │  │  Dashboard        │  │  Next.js · TS       │
            │  + Expo           │  │  Next.js · TS     │  │  admin.<domain>     │
            │  App/Play Store   │  │  dashboard.<dom>  │  │  (separate deploy)  │
            └───────────────────┘  └───────────────────┘  └─────────────────────┘
```

**Decision (final — do not re-litigate):** Student, Association, and Admin are three separate
deployables with genuinely separate codebases, auth models, and attack surfaces.

- **Student** — the React Native/Expo mobile app. The only thing that ships to the App Store
  and Play Store. Unchanged from the existing mobile app architecture.
- **Association Dashboard** — a separate Next.js web app (TypeScript, same shared language as
  the rest of the stack). Used by Treasurer/President/P.R.O. for dues reconciliation,
  verification review, announcements, and transparency management. Reachable at its own
  subdomain (e.g. `dashboard.<domain>` — referenced as a placeholder until the domain is
  actually registered).
- **Admin Console** — a second, fully separate Next.js app (not a route inside the Association
  Dashboard). Its own deployment, its own subdomain (e.g. `admin.<domain>`). Highest privilege,
  smallest attack surface by design — there is no code path in either the mobile app or the
  Association Dashboard that leads to an admin route, because the admin app is a genuinely
  separate codebase and deployment.

**Auth model differs by deployable:**
- **Student app**: Bearer JWT (access + refresh), stored in `expo-secure-store`. Role: `student`.
- **Association Dashboard**: session-based auth (httpOnly, secure, sameSite cookie) because it's
  a web app — no mobile secure store to hold tokens. Executive roles scoped to one association.
  MFA required per `security.md`.
- **Admin Console**: same session-based auth, but against the `admin_accounts` table with its
  own `ADMIN_JWT_SECRET`. MFA required. Separate login path entirely.

## System overview (unchanged backend)

```
                          ┌─────────────────────────────┐
                          │   Mobile App (iOS/Android)  │
                          │   React Native + Expo       │
                          └───────────────┬──────────────┘
                                          │ HTTPS (TLS 1.3), JWT
                                          ▼
                          ┌─────────────────────────────┐
                          │        Backend API          │
                          │   NestJS (Node.js/TS)       │
                          │   Auth · RBAC · Payments ·   │
                          │   Announcements · Events     │
                          └───┬───────────┬──────────┬───┘
                              │           │          │
                 ┌────────────▼──┐   ┌────▼───┐   ┌──▼─────────────┐
                 │  PostgreSQL   │   │ Redis  │   │  Model Server   │
                 │  (+ pgvector) │   │ (cache,│   │  (Ollama, self- │
                 │               │   │ queues)│   │  hosted, private│
                 └───────────────┘   └────────┘   │  network only)  │
                                                    └─────────────────┘
                              │
                              ▼
                  ┌─────────────────────────┐
                  │  Payment Gateway         │
                  │  (Paystack — hosted      │
                  │  checkout, webhooks)     │
                  └─────────────────────────┘
```

All of this runs on a single GCP VM to start (see `docs/infrastructure.md`), as Docker Compose
services. Nothing here requires multiple servers for v1 — don't over-provision before there's
real load to justify it.

## Component responsibilities

**Mobile App** — presentation and interaction only. Holds no business logic that matters for
security or correctness (fee amounts, payment status, role permissions are never decided
client-side). Talks only to the Backend API, never directly to the database, payment gateway, or
model server.

**Backend API** — the single source of truth. Owns auth, RBAC enforcement, payment
verification, data validation, and is the only component allowed to call the Model Server or the
Payment Gateway.

**PostgreSQL (+ pgvector extension)** — relational data (users, associations, payments,
announcements, events) and the vector store for AI retrieval, in one database rather than
running a separate vector DB service. Simpler ops for a single-VM deployment; can be split out
later if it becomes a bottleneck.

**Redis** — session/rate-limit counters, short-lived caches, and background job queue (for
things like the payment reconciliation job and the AI ingestion pipeline).

**Model Server (Ollama)** — serves a self-hosted, quantized open-weight LLM. Lives on a private
network path reachable only from the Backend API — never exposed to the internet, never called
directly by the mobile app. See `docs/ai-model.md`.

**Payment Gateway (Paystack)** — handles all real money movement and card data. The backend
never touches raw card numbers; see `docs/payment-integration.md`.

## Why one backend for both mobile platforms

There is exactly one API. iOS and Android are two clients of the same backend — there is no
"iOS backend" and "Android backend." This is what makes the cross-platform mobile framework
choice (see `docs/tech-stack.md`) low-risk: the hard, security-sensitive logic lives in one
place regardless of which mobile framework renders the UI.

## Environments

Three environments, same architecture, different data and credentials:

- **local** — the agent's dev loop, running on the GCP box itself, ephemeral/resettable data.
- **staging** — mirrors production, used for every release candidate before it ships. Seeded
  with fake data, never real student PII.
- **production** — real data, real payments (live Paystack keys), the only environment with
  wide alerting turned on.

See `docs/ci-cd.md` for how code moves between these.

## What's deliberately *not* in this architecture

- **No third-party AI API** — by design, per the project requirement. The Model Server replaces
  what would otherwise be an OpenAI/Anthropic API call.
- **No in-app implementation of Course Registration, Merch, Tickets, etc.** — these remain
  WhatsApp hand-offs, exactly as in the prototype. This was a deliberate scope decision, not a
  gap; don't "improve" it into an in-app feature without it being a planned phase.
- **No native iOS/Android split codebases** — see `docs/tech-stack.md` for why, and the one
  constraint that makes this decision for you.
