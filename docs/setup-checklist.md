# Matriq — Phase 0 Setup Checklist

This is the concrete, checkable list of infrastructure provisioning tasks. Mark each item
with its actual value (IP, region, key IDs) so this isn't re-derived from chat history later.

## GCP VM

- [x] VM provisioned: `matriq-server`
- [x] External IP: `35.204.163.157` (static, reserved)
- [x] Region: `europe-west4` (Netherlands)
- [x] Machine type: `e2-medium` (2 vCPU / 4GB RAM)
- [x] OS: Ubuntu 22.04 LTS
- [x] Boot disk: 50GB

## VM Hardening (security.md + infrastructure.md)

- [x] SSH key-only auth confirmed (password auth disabled)
- [x] Non-root deploy user: `juliusemmanueloghenegare` (passwordless sudo)
- [x] fail2ban installed (v0.11.2) and running (sshd jail active)
- [x] unattended-upgrades enabled (automatic security updates)
- [x] Firewall (UFW): active, ports 22, 80, 443 allowed; default deny incoming
- [ ] GCP console firewall rules audited (UFW covers host-level; GCP-level rules pending)

## Installed Software

- [x] Docker: v29.1.3
- [x] docker compose plugin: v2.40.3
- [x] tmux: v3.2a
- [x] git: v2.34.1
- [x] Node.js (via Docker, not bare-metal — confirmed)

## Docker Compose

- [x] `docker-compose.yml` present on server (`~/matriq/docker-compose.yml`)
- [x] `postgres` (pgvector) container running and healthy (`matriq-postgres`, pgvector/pgvector:pg16)
- [x] `redis` container running and healthy (`matriq-redis`, redis:7-alpine)
- [x] `backend` container built and serving `/health` (NestJS, Node 20, port 3000)
- [x] `caddy` container running (`matriq-caddy`, caddy:2-alpine, ports 80/443)
- [x] `ollama` container running (`matriq-ollama`, ollama/ollama:latest, no model pulled yet)

## tmux Convention

- [x] Session `matriq-build` created: `tmux new -s matriq-build`
- [x] Bootstrap script `scripts/bootstrap.sh` present and executable

## Secrets Management

- [ ] GCP Secret Manager enabled for project (not yet configured)
- [ ] `RESEND_API_KEY` migrated from `.env` to Secret Manager (currently in `~/matriq/.env`, chmod 600)
- [ ] `JWT_SECRET` in Secret Manager (generated, stored in .env for now)
- [ ] `JWT_REFRESH_SECRET` in Secret Manager (generated, stored in .env for now)
- [ ] `POSTGRES_PASSWORD` in Secret Manager (generated, stored in .env for now)
- [ ] `PAYSTACK_SECRET_KEY` in Secret Manager (not yet set)

## Email (Resend)

- [x] Resend account exists
- [x] `RESEND_API_KEY` present in server `.env`
- [x] Resend `sendEmail` function implemented in backend (`EmailService.send()` in `email.service.ts`)
- [x] Test email actually delivered: ID `20eda849-87bb-4cb9-9a7d-5454c12575f0` sent to `juliusemmanueloghenegare@gmail.com`
- [ ] Domain verification (SPF/DKIM): DEFERRED — no domain yet. Using `onboarding@resend.dev`.

## Git

- [x] `.gitignore` covers all secret/env patterns (including `.env.*` with `!.env.example` exception)
- [x] Repo initialized locally (on matriq-server): `~/matriq/`
- [x] Initial commit made: `c3a36b2` — 51 files, branch `main`
- [x] GitHub remote: `git@github.com:eeejaymedia100/Matriq.git`
- [x] Pushed to GitHub — both `main` and `develop` branches live
- [ ] `main` branch protected (GitHub Settings → Branches → Add rule)
- [x] `develop` branch created and pushed

## Claude Skills

- [x] Three skills copied into `.claude/skills/`: `matriq-brand-identity`, `matriq-payment-safety`, `matriq-rbac-patterns`
- [x] Skills committed to git

## CI Skeleton

- [x] GitHub Actions workflow file exists (`.github/workflows/ci.yml`)
- [ ] Lint step runs and passes (not yet triggered — no GitHub push)
- [ ] Type-check step runs and passes (not yet triggered)
- [ ] "Hello world" test passes (not yet triggered)

## Notes

- Domain: not yet registered. Caddy will use HTTP-only until a domain is pointed at this IP.
- Ollama: container running but no model pulled. Pull a model (e.g., `llama3.1:8b`) in Phase 4.
- Machine type: e2-medium is undersized for Ollama. This is intentional per infrastructure.md —
  upgrade to e2-standard-4 or add a GPU VM when AI companion work begins in Phase 4.
