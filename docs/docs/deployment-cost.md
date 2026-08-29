# Matriq — Deployment Cost Analysis (production, keep-it-free-for-students)

**Date:** 2026-08-26 · **Status:** analysis + migration prep done; flip is a DNS change away.

## The question

The advisor said: *"Vercel will become a huge problem later on — use a VPS + Postgres
backend and Better Auth."* Should we switch?

## Verdict: we're already on that stack — the only Vercel piece is two low-traffic dashboards

| Piece of the advice | Current state | Verdict |
|---|---|---|
| **VPS** | Backend + Postgres + Redis + Ollama + MinIO + ntfy all run in Docker on a single GCP VM (`e2-standard-4`, europe-west4) | ✅ Already done |
| **Postgres** | Self-hosted `pgvector/pgvector:pg16`, migrations via Prisma, nightly backups | ✅ Already done |
| **Better Auth** | Custom NestJS auth: **Argon2id** password hashing, short-lived access tokens + **rotating refresh-token families** with replay detection, **TOTP MFA**, per-IP **and** per-email rate limiting, structured errors | ✅ Already at (and beyond) the baseline. Better Auth is a web-oriented library — swapping a working, tested NestJS auth for it would be a rewrite with zero security gain for a React Native + API app. **Recommendation: keep the custom auth.** |
| **Vercel** | Hosts only `admin.matriq.com.ng` and `dashboard.matriq.com.ng` (Next.js) | ⚠️ The only real Vercel exposure — and both are low-traffic admin surfaces that proxy API calls to the VM. The mobile app (the heavy consumer) talks straight to the VM. |

So the advisor's core instinct — *"don't let your whole app sit on a platform with a cost
cliff"* — is right, but the fix isn't a rewrite; it's **removing Vercel from the critical
path** by self-hosting the two dashboards on the VM we already pay for.

## What Vercel actually costs at scale

- **Hobby (current):** free, but capped at **100 GB bandwidth/mo + 1M function
  invocations**, and it's "personal, non-commercial use" only.
- **Pro:** $20/dev/month; bandwidth above 1 TB billed at ~$40/TB. Serverless function
  overage bills are where Next.js apps on Vercel "become a huge problem" — a popular
  student app with thousands of dashboard logins and page loads is exactly the traffic
  that starts overage-billing.
- The dashboards are server-rendered pages + API routes proxying to the backend; every
  page load counts against invocations and bandwidth.

**Risk today: low. Risk at scale: real, and unpredictable.** Self-hosting removes it
entirely at $0 extra, using capacity the VM already has (both dashboards together are
far lighter than one Ollama generation).

## Recommended architecture (post-migration)

```
                     Cloudflare (Free: CDN · WAF · DDoS · edge TLS)
        ┌───────────────────┬──────────────────┬──────────────────┐
        │                   │                  │                  │
matriq.com.ng      api.matriq.com.ng   admin.matriq.com.ng  dashboard.matriq.com.ng
   waitlist             backend           dashboard          admin
   (Caddy static)    (Caddy → :3000)   (Caddy → next:3001)  (Caddy → next:3002)
        └───────────────────┴──────────────────┴──────────────────┘
                          ONE GCP VM (already provisioned)
   Docker: caddy · backend · postgres · redis · ollama · minio · ntfy · dashboard · admin
```

- **Cost:** unchanged VM (~$75–80/mo GCP) + domain + Cloudflare Free + Resend free
  tier. **Zero dollars from Vercel, forever.** Dashboards keep their own subdomains and
  TLS (Caddy auto-issues Let's Encrypt certs, exactly like the API).
- **Availability tradeoff:** Vercel gave the dashboards a separate failure domain; on a
  single VM, everything shares one box. Acceptable at this scale (the VM already hosts
  the API + DB + AI; the dashboards add negligible load). The VM is backed by the
  documented backup/restore + rollback runbooks in `security.md`.
- **Security tradeoff:** the dashboards stop being externally hosted and sit behind the
  same hardened Caddy + Cloudflare WAF + CORS lockdown as the API. Their
  `NEXT_PUBLIC_API_URL` still points at `https://api.matriq.com.ng/v1`.

## What I prepared in this change

- `dashboard/Dockerfile` + `admin/Dockerfile` — Next.js **standalone** output images
  (non-root user, matching the backend image's hardening), plus `.dockerignore`s.
- `docker-compose.yml` — `dashboard` (:3001) and `admin` (:3002) services behind the
  internal network; `next.config.ts` gains `output: "standalone"`.
- `caddy/Caddyfile.dashboards` — site blocks for `admin.matriq.com.ng` /
  `dashboard.matriq.com.ng` proxying to the containers (drop-in; enable by switching
  the active Caddyfile). `scripts/enable-dashboards.sh` automates the switch.
- This document.

## The flip (10 minutes, when you decide it's worth it)

1. On the VM: `git pull`, set `DASHBOARD_URL`/`ADMIN_URL` in `.env` (optional),
   `bash scripts/enable-dashboards.sh` (builds the images, starts the services, swaps
   the Caddyfile, reloads Caddy, verifies `https://admin.matriq.com.ng/healthz`).
2. In Cloudflare: repoint the `admin` / `dashboard` CNAME records from
   `cname.vercel-dns.com` to A records → VM IP (DNS-only, like `api`), so Let's Encrypt
   can issue certs via HTTP-01.
3. Remove the Vercel projects (or leave them pointed at the same repo — harmless).
4. Update `CORS_ORIGIN` in the backend `.env` if the origins change (they don't).

**Recommendation:** keep Vercel until one of these triggers fires — a Vercel bill of any
size, an overage warning, or the Hobby bandwidth/function caps being hit. When it does,
the flip above is the entire migration.

## Cheaper VPS options (later, optional)

The VM is the only real recurring cost (~$75–80/mo on GCP for `e2-standard-4`). If the
app stays free-for-students and money is tight, the same stack runs cheaper elsewhere:

| Provider | Spec | ~Cost/mo | Notes |
|---|---|---|---|
| GCP `e2-standard-4` (current) | 4 vCPU / 16 GB | ~$75–80 | Already provisioned, hardened, known-good |
| Hetzner `CPX41` | 8 vCPU / 16 GB | ~€32 | Easy migration, same Docker compose |
| Oracle Cloud Free Tier (ARM) | 4 OCPU / 24 GB | $0 | Real free tier, but availability + account-verification friction; not for production-critical without testing |

The migration is a `docker compose pull`-style re-deploy on a fresh box (Postgres
dump/restore, `.env`, Caddy). Documented in `docs/infrastructure.md`. **Do not** move to
a GPU instance for the AI model — the offline-AI architecture means phones run their own
small models; the server's CPU Ollama is enough (and optional).

## What stays free for students

- App install, all features, offline AI model downloads (they pay only their own data),
  Vault, tools, AI companion — all free. The only paid surfaces are optional
  association dues, processed through Paystack at the association's own fee rate.
- Infrastructure cost is fixed regardless of student count until real capacity work is
  needed (see `docs/infrastructure.md` — the box is sized for ~1,000 concurrent users).
