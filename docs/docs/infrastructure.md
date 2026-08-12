# Infrastructure

## GCP VM

Single VM to start (see `docs/architecture.md` for why this is enough for v1).

- **OS:** a current Ubuntu LTS.
- **Sizing:** start modest (e.g., 4 vCPU / 16GB RAM) for everything except the model server; if
  a GPU instance is provisioned for the AI model (see `docs/ai-model.md`), that can be a
  separate, smaller VM on the same private network rather than upgrading the whole box — keep
  the cost decision isolated to the component that actually needs it.
- **Firewall:** only 443 (HTTPS) and 22 (SSH) open externally. Everything else (Postgres, Redis,
  Ollama's internal port) reachable only within the VM's private network / Docker network, never
  exposed publicly. See `security.md`.
- **Hardening applied before anything else runs:** SSH key-only auth, password auth disabled,
  fail2ban installed, automatic security updates enabled, a non-root deploy user created (the
  agent should not operate as root day-to-day).

## Subdomain structure — Cloudflare DNS + Vercel (see `docs/cloudflare-vercel.md`)

`matriq.app` is registered and its DNS is managed by **Cloudflare** (nameservers pointed at
Cloudflare, all records proxied). Cloudflare terminates TLS at the edge (Free plan: CDN, WAF,
DDoS protection) and forwards to the origin:

| Subdomain | Service | Hosting | Notes |
|---|---|---|---|
| `api.matriq.app` | NestJS backend | GCP VM (Caddy) | Cloudflare proxies to Caddy, which serves the Cloudflare Origin cert (SSL mode Full strict) and reverse-proxies to `backend:3000` |
| `dashboard.matriq.app` | Association Dashboard (Next.js) | **Vercel** | `dashboard/` root dir; `NEXT_PUBLIC_API_URL=https://api.matriq.app/v1` |
| `admin.matriq.app` | Admin Console (Next.js) | **Vercel** | `admin/` root dir; separate Vercel project |

- Caddy no longer needs Let's Encrypt: Cloudflare is the TLS terminator and Caddy serves the
  origin cert. See `caddy/Caddyfile.cloudflare` (swapped in by `scripts/enable-cloudflare.sh`).
- The two Next.js apps are **deployed on Vercel** (independent projects from this monorepo,
  root directories `admin/` and `dashboard/`) — the GCP VM stays focused on backend +
  database + AI model. Pushing to `main` auto-deploys both.

## Docker Compose services

```
services:
  backend:      # NestJS API
  postgres:     # + pgvector extension
  redis:
  ollama:       # model server, no published external port
  caddy:        # reverse proxy + automatic TLS (Let's Encrypt), the only service with an
                # externally exposed port
```

## Capacity: serving 1,000 concurrent students

The stack is built to absorb ~1,000 concurrent mobile users at typical request
rates. The load-bearing pieces (all configurable via `.env`):

- **Cluster mode (multi-core).** NestJS is single-threaded. In production the
  backend forks one worker per CPU core (`WORKERS=0` → `os.availableParallelism()`,
  or pin with `WORKERS=4`; `WORKERS=1` forces single-process for dev/debug).
  Crashed workers are respawned automatically; SIGTERM/SIGINT drain gracefully.
- **Redis-backed rate limiting.** The throttler stores limits in Redis
  (`nestjs-throttler-storage-redis`), so limits are shared across cluster
  workers and keyed by real client IP (`trust proxy` is already set). If Redis
  is unreachable it degrades to in-memory per-worker limits instead of 500ing
  (`src/throttler/throttler-storage.ts`).
- **Per-user login burst protection.** Login/register/admin-login are limited by
  **IP + email** (`src/throttler/trackers.ts`): 1,000 students behind campus NAT
  each get their own 5/min bucket per account, while a single source still can't
  spray many accounts. (A plain per-IP limit would let one student burn the
  bucket for everyone else.)
- **AI concurrency caps.** Ollama is CPU-bound, so chat generations are capped
  at `OLLAMA_MAX_CONCURRENCY` (default 2) with a FIFO queue; requests that wait
  longer than `AI_QUEUE_TIMEOUT_MS` get a 503 "busy" rather than stalling the
  box. Embeddings use a separate pool (`OLLAMA_EMBED_MAX_CONCURRENCY`) so
  retrieval stays fast during chat. See `src/ai/semaphore.ts`.
- **Bounded DB connections.** Each worker runs its own Postgres pool capped at
  `DATABASE_POOL_MAX` (default 5) → ~20 connections on the 4-core box instead
  of pg's default 20+ per process.

### Honest limits on the current box (4 vCPU / 15 GB — `matriq-server`, e2-standard-4)

- Normal API traffic (JWT + Prisma): fine for 1,000 concurrent users.
- **Login stampede:** argon2 hashing is CPU-heavy (~100–300 ms, 64 MB per
  hash). A mass login moment is the realistic bottleneck. The per-IP+email
  throttle (5/min) plus 2 workers absorbs normal bursts; a real enrollment-day
  stampede wants a bigger box (see below).
- **AI:** ~2 concurrent generations max on CPU (semaphore-capped). More
  students than that queue (then 503) — acceptable for a study companion, not
  for a lecture tool.

### Upgrade path (when the current box is the bottleneck)

1. **Right-size the VM → 4 vCPU / 16 GB — DONE (Aug 2026).** Production moved
   from the 2 vCPU / 4 GB box (`cliptonite-server`, 34.28.210.233, e2-medium)
   to `matriq-server` (35.204.163.157, europe-west4, **e2-standard-4**). The
   old box stays as a warm standby/failover until launch is verified. Cluster
   mode now forks 4 workers; login-stampede capacity doubled. See
   `docs/progress-log.md`.
2. **Open GCP firewall for TCP 443** on `matriq-server` (port 80 is already
   open) and flip the Cloudflare A records (`api`, root) to `35.204.163.157`
   so `https://api.matriq.com.ng` terminates with a Let's Encrypt cert issued
   by Caddy (plain `Caddyfile`, DNS-only records).
3. **Decouple Ollama** to its own instance (ideally GPU, or at least a separate
   CPU box) and point `OLLAMA_HOST` at it. Then `OLLAMA_MAX_CONCURRENCY` can
   grow past 2 without hurting the API box.
4. **Load test before the big day:** `cd backend && npm run loadtest`
   (autocannon; see `backend/scripts/load-test.mjs`). After the migration:
   ~270 rps (JWT+DB) at p95 ≈ 113 ms across the public internet — flat
   latency, no queuing.

- `caddy` (or nginx + certbot if preferred) terminates TLS and routes to `backend`. This is the
  only service that should ever bind to a public interface.
- Each service runs as a non-root user inside its container.
- Named volumes for `postgres` and `ollama`'s model cache, so data survives container
  restarts/redeploys.
- The two Next.js dashboards can either be Dockerized and added as additional Compose services,
  or deployed to Vercel (recommended for simplicity — keep the GCP VM focused on the backend +
  database + AI model). **Decision: the two dashboards are deployed to Vercel** (see
  `docs/cloudflare-vercel.md`).

## Deploying (migrations + stack)

- `scripts/deploy.sh` is the single entry point on the VM: it starts postgres/redis, waits for
  health, applies migrations explicitly via `docker compose run --rm migrate` (a one-shot
  `migrate` service, profile `tools`, reusing the backend image with the schema mounted in),
  builds and starts backend/caddy/ollama, and waits for `/health`. Idempotent — safe to re-run.
- **Migrations are never applied silently** by a generic deploy (per `docs/ci-cd.md`). The
  baseline is `backend/prisma/migrations/0_init/migration.sql`; new schema changes must add a
  new numbered migration, and a no-DB CI gate fails if `schema.prisma` drifts from the baseline.

## Environments on the same VM

Given single-VM constraints, staging and production can run as separate Docker Compose stacks
on the same box (different project names/ports, both behind `caddy` on different subdomains) —
acceptable for this project's scale. Revisit only if staging load starts affecting production
performance.

## The tmux / Termux workflow

This is how the coding agent stays alive across a phone-driven, intermittent-connectivity
workflow:

- **One persistent tmux session, consistently named** — e.g. `tmux new -s matriq-build`. Always
  reattach to this same session (`tmux attach -t matriq-build`) rather than creating a new one
  each time you connect from Termux. A proliferation of abandoned tmux sessions is how work
  silently gets lost.
- **The agent should assume its SSH connection can drop at any moment** (mobile data, backgrounded
  Termux, phone locking) and design its own workflow around that — see
  `docs/agent-workflow.md` for the commit discipline this implies.
- Consider a tmux status bar or a simple `tmux list-windows` habit so reconnecting quickly shows
  what was running (a test suite, a dev server, a long build) rather than a wall of scrollback to
  re-read.
- A dead tmux session (e.g., after a VM reboot) should be recoverable by re-running one
  documented bootstrap command, not by remembering a sequence of steps from memory — write that
  bootstrap script early (Phase 0) and keep it current.

## Backups

- Automated, scheduled PostgreSQL backups (e.g., nightly `pg_dump` to a GCP Cloud Storage
  bucket, encrypted).
- **Test the restore process at least once before Phase 9**, not just the backup job — an
  untested backup is not a backup you can rely on (`security.md`).

## Monitoring

- Basic uptime/health check on the backend's `/health` endpoint, alerting (even a simple
  webhook-to-Telegram/Slack) on failure — before Phase 9, not as an afterthought.
- Log aggregation doesn't need to be fancy for this scale — structured JSON logs from the
  backend, retained locally with rotation, is enough to start. Revisit only if debugging without
  centralized logs becomes a real pain point.
