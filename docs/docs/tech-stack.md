# Tech Stack — and the constraint that decides most of it

## Read this first: the iOS build problem

You're running your build agent on a **GCP Linux VM**, accessed via **Termux on Android**.

Compiling an iOS app into an installable `.ipa` file requires Apple's toolchain (Xcode), which
only runs on macOS. **This is true no matter what mobile framework you choose.** A Linux box —
your GCP VM — cannot build an iOS app locally. This isn't a limitation of any particular
framework; it's an Apple platform restriction.

There are exactly three ways around this:
1. **A cloud macOS build service** — you push code, a macOS machine somewhere else compiles it,
   you get back an `.ipa`. This is by far the standard solution and requires no Mac ownership.
2. **Renting/owning a physical or cloud Mac** and building manually or via self-hosted CI runners
   on it. More control, much more operational overhead — not recommended for a one-person,
   phone-driven workflow.
3. **Don't ship iOS.** Not chosen here since you explicitly want both platforms.

**Decision: use option 1.** This is the reason the mobile framework choice below is Expo/React
Native specifically, and not "any React Native setup" or Flutter with a generic CI script —
Expo's **EAS Build** is a managed cloud build service purpose-built for exactly this situation,
and it's what makes "build iOS from a Linux box over Termux" actually work.

## Mobile: React Native + Expo (EAS Build / EAS Submit)

**Why React Native + Expo over Flutter:**
- EAS Build solves the iOS-without-a-Mac problem directly, with first-class support and wide
  real-world usage — this isn't a workaround, it's a mainstream path.
- JavaScript/TypeScript on the frontend matches TypeScript on the backend (see below), which
  matters more than usual here because a single coding agent is working across the whole stack —
  fewer languages to context-switch between means fewer mistakes.
- The existing HTML/CSS/JS prototype's component logic (state shape, screen flow, validation
  rules) translates conceptually much more directly into React Native than into Flutter's widget
  model — less re-derivation of business logic, less risk of behavior drift from the prototype.
- Expo's managed workflow reduces native-code surface area, which matters for an agent working
  without a human doing native Xcode/Android Studio debugging alongside it.

**Flutter is a legitimate alternative** (Codemagic offers a similar cloud-build solution for
iOS) if there's a strong reason to prefer Dart or Flutter's rendering performance later — but
it's not the default here, and switching mid-project is expensive. Don't switch without a
concrete reason.

**Key libraries:**
- `expo-secure-store` — secure token storage (Keychain/Keystore), not `AsyncStorage`.
- `react-navigation` — screen navigation, matching the prototype's journey/screen model.
- `react-query` (`@tanstack/react-query`) — server state, caching, retry logic against the
  backend API.
- `react-native-svg` — for QR rendering and icons, matching the prototype's SVG-based icon set.

## Backend: NestJS (Node.js + TypeScript)

**Why NestJS over a lighter framework (Express/Fastify):**
- Its structure (modules, guards, decorators) maps directly onto the RBAC model this project
  needs (Student/Treasurer/President/P.R.O./Admin) — `@Roles()` guards are a natural fit and
  hard to accidentally bypass, which matters a lot given `security.md`.
- Built-in dependency injection and testing conventions give a coding agent a consistent pattern
  to follow across every new endpoint, reducing the chance of one endpoint quietly skipping
  validation or auth that every other endpoint has.
- TypeScript end-to-end (mobile app and backend) — shared types for API contracts are realistic
  to maintain without a second language's tooling.

## Database: PostgreSQL + pgvector

- PostgreSQL for all relational data — proven, well-understood backup/restore story, strong
  constraint/transaction support (important for payment correctness).
- `pgvector` extension for the AI retrieval store, rather than a separate vector database
  service — one fewer moving part to operate on a single VM. Revisit only if retrieval volume
  genuinely outgrows it.

## Cache/Queue: Redis

Rate-limit counters, session data, and background job queue (via `BullMQ`) for async work like
payment reconciliation and AI content ingestion.

## AI Model Serving: Ollama

Self-hosted, serves quantized open-weight models (e.g., Llama 3.1 8B, Mistral 7B, or Phi-3,
depending on your VM's available RAM/GPU) over a simple local REST API. See `docs/ai-model.md`
for the full design, including why "learns as it goes" is implemented as retrieval + periodic
fine-tuning rather than continuous online learning.

## Payment Gateway: Paystack

Nigerian-market-appropriate (cards, bank transfer, USSD), hosted checkout keeps card data off
your servers entirely (PCI scope stays minimal — see `docs/compliance-privacy.md`). Flutterwave
is a reasonable alternative; Paystack is the default recommendation for DELSU/Nigerian student
associations specifically due to market fit and documentation quality.

## CI/CD: GitHub Actions + EAS Build/Submit

See `docs/ci-cd.md` in full. Summary: GitHub Actions runs backend tests/builds and triggers EAS
Build for mobile; EAS handles the actual iOS/Android compilation in the cloud.

## Infrastructure: Docker Compose on a single GCP VM

See `docs/infrastructure.md`. Kubernetes, multi-region, or managed container services are all
premature for this project's current scale — a single well-secured VM running Docker Compose is
the right amount of infrastructure for v1.

## Web dashboards: Next.js (TypeScript)

Two separate Next.js apps (not routes in one app) for the Association Dashboard and Admin
Console. Why Next.js:
- Same TypeScript language as the backend and mobile app — one agent, one language family
  across the entire stack.
- Server-side rendering isn't the draw here; the draw is Next.js's API routes layer, which
  lets each dashboard hold its own lightweight proxy/aggregation logic without adding a second
  backend framework.
- Vercel deployment is the default (simplest ops), but both apps can also be Dockerized and
  served alongside the existing backend on the GCP VM if preferred.

**Key libraries (shared across both dashboards):**
- `next-auth` — session management with httpOnly cookies (not JWT in localStorage — see
  `security.md`).
- `@tanstack/react-query` — server state, same pattern as the mobile app.
- The Matriq design system tokens from `docs/design-system.md` — ported from the mobile
  app's `theme/colors.ts` (React Native StyleSheet tokens → CSS custom properties for web).

## Summary table

| Layer | Choice | Key reason |
|---|---|---|
| Mobile (Student) | React Native + Expo (EAS Build) | Only realistic way to build iOS from your Linux box |
| Web (Association Dashboard) | Next.js (TypeScript) | Shared language, session-based auth, separate deployable |
| Web (Admin Console) | Next.js (TypeScript) | Separate codebase + subdomain, smallest attack surface |
| Backend | NestJS (TypeScript) | RBAC-friendly structure, shared language across all clients |
| Database | PostgreSQL + pgvector | One database for relational + vector data |
| Cache/Queue | Redis + BullMQ | Rate limiting, background jobs |
| AI serving | Ollama (self-hosted) | No third-party AI API, full control |
| Payments | Paystack | Nigerian market fit, hosted checkout minimizes PCI scope |
| CI/CD | GitHub Actions + EAS + Vercel | Cloud-built iOS without a Mac; Vercel for web deploys |
| Infra | Docker Compose, single GCP VM | Right-sized for current scale |
