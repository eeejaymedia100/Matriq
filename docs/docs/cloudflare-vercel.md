# Cloudflare + Vercel — Public Launch Runbook

Target architecture (everything behind Cloudflare, dashboards on Vercel):

```
                        ┌──────────────────────────────────────────────┐
                        │            Cloudflare (edge)                 │
                        │   DNS · CDN · WAF · DDoS · edge TLS (Free)   │
                        └───────┬──────────────┬──────────────┬────────┘
                                │              │              │
                     api.matriq.app     admin.matriq.app  dashboard.matriq.app
                                │              │              │
                        ┌───────▼──────┐  ┌───▼────────┐ ┌───▼────────┐
                        │  GCP VM      │  │  Vercel    │ │  Vercel    │
                        │  Caddy →     │  │  admin/    │ │  dashboard/│
                        │  backend:3000│  │  Next.js   │ │  Next.js   │
                        └──────────────┘  └────────────┘ └────────────┘
```

- `api.matriq.app` — NestJS backend on the VM (Caddy serves the Cloudflare Origin
  certificate; Cloudflare proxies + protects it).
- `admin.matriq.app` — Admin Console (`admin/`), deployed on Vercel.
- `dashboard.matriq.app` — Association Dashboard (`dashboard/`), deployed on Vercel.
- Mobile APK already points at `https://api.matriq.app/v1` (`mobile/app.json`).

Estimated cost: domain ~$12–15/yr (`.app` TLD) + Cloudflare Free + Vercel Hobby (both free).

---

## Part A — Register the domain

`matriq.app` is **not registered yet** (verified: no whois/DNS records). You must own it
before Cloudflare can host it.

**Option 1 — Cloudflare Registrar (recommended, fewest steps):**
1. Log in to [dash.cloudflare.com](https://dash.cloudflare.com).
2. Left sidebar → **Domain Registration** → **Register Domain**.
3. Search `matriq.app` → add to cart → complete checkout (needs a card).
4. Because the domain is registered *inside* Cloudflare, the zone is auto-created and
   nameservers already point at Cloudflare — **skip Part B entirely**.

**Option 2 — any other registrar (Namecheap, Porkbun, GoDaddy…):**
1. Register `matriq.app` at your registrar.
2. Follow Part B to add it to Cloudflare and repoint nameservers.

> `.app` is a Google-registry TLD that **requires HTTPS** — which is fine, everything we
> serve is HTTPS anyway.

---

## Part B — Add the domain to Cloudflare (only if registered elsewhere)

1. [dash.cloudflare.com](https://dash.cloudflare.com) → **Add a site** → enter `matriq.app` →
   **Free** plan → Continue.
2. Cloudflare scans existing DNS. Keep whatever it finds, then **Continue**.
3. It shows two nameservers, e.g. `ada.ns.cloudflare.com` / `dilan.ns.cloudflare.com`.
4. Go to your registrar's DNS settings and replace the existing nameservers with those two.
5. Back in Cloudflare, click **Check nameservers**. Activation takes minutes to a few hours.

**Verify:** `dig +short matriq.app NS` returns your Cloudflare nameservers.

---

## Part C — DNS records in Cloudflare

**DNS → Records → Add record** (all **Proxied** = orange cloud ⛅ — this is what enables
Cloudflare protection):

| Type | Name | Content | Proxy |
|---|---|---|---|
| A | `api` | `34.28.210.233` (the VM's static IP) | ⛅ Proxied |
| CNAME | `admin` | `cname.vercel-dns.com` | ⛅ Proxied |
| CNAME | `dashboard` | `cname.vercel-dns.com` | ⛅ Proxied |
| CNAME | `@` (root) | `cname.vercel-dns.com` *(optional — see note)* | ⛅ Proxied |

Notes:
- The root `@` CNAME is optional. If you want `matriq.app` itself to show *something*,
  point it at Vercel and we'll make one of the apps (or a tiny landing page) handle it.
  Otherwise leave it out — the subdomains are what matter.
- The Vercel CNAME target is fixed (`cname.vercel-dns.com`) for all Vercel projects. When
  Vercel asks you to add a CNAME, this is it. (Vercel may also ask for a TXT verification
  record when you add the domain in their dashboard — add that one too, then delete it.)

---

## Part D — Origin certificate (for the API on the VM)

Cloudflare terminates TLS at the edge. The connection *from* Cloudflare *to* your VM must
also be TLS for SSL mode **Full (strict)**. The clean way is a Cloudflare **Origin
Certificate** (free, 15-year validity, generated in 30 seconds):

1. Cloudflare dashboard → `matriq.app` → **SSL/TLS** → **Origin Server** → **Create
   Certificate**.
2. Leave defaults: **Let Cloudflare generate a private key and a CSR**; hostnames
   `api.matriq.app` (add `matriq.app` too if you want, not required); validity 15 years.
3. **Create** → copy the **Certificate (PEM)** and the **Private key (PEM)** into two files
   on the VM (I'll create the paths — tell me when done, or paste the PEM blocks here and
   I'll write them):
   - `/home/akpevwejulius1/matriq/caddy/certs/origin.pem`
   - `/home/akpevwejulius1/matriq/caddy/certs/origin.key`
4. Cloudflare **SSL/TLS → Overview** → set mode to **Full (strict)**.

> `caddy/certs/` is gitignored — the private key never goes in the repo.

---

## Part E — Deploy the dashboards to Vercel

Both apps live in this monorepo (`admin/`, `dashboard/`). Create **two separate Vercel
projects**, each importing the same GitHub repo with a different root directory.

**Project 1 — Association Dashboard:**
1. [vercel.com](https://vercel.com) → **Add New… → Project** → import `eeejaymedia100/Matriq`.
2. **Root Directory:** `dashboard`.
3. Framework preset auto-detects **Next.js**.
4. **Environment Variables:**
   - `NEXT_PUBLIC_API_URL` = `https://api.matriq.app/v1` (apply to Production, Preview, Development)
5. **Deploy** (build uses the existing CI-verified `next build`).
6. **Project → Settings → Domains** → add `dashboard.matriq.app`.
   - If Vercel shows a TXT verification record, add it in Cloudflare DNS first, then the
     CNAME (already in Part C). Vercel auto-provisions a Let's Encrypt cert.

**Project 2 — Admin Console:**
1. Repeat the same steps with **Root Directory:** `admin`.
2. Same env var: `NEXT_PUBLIC_API_URL=https://api.matriq.app/v1`.
3. **Settings → Domains** → add `admin.matriq.app`.

After this, pushing to `main` auto-deploys both apps (Vercel watches the repo).

---

## Part F — Flip the VM's Caddy to the domain (I do this)

Once Parts A–E are done, I run (from the repo root on the VM):

```bash
bash scripts/enable-cloudflare.sh
```

which:
1. Reads `DOMAIN` (defaults to `matriq.app`) and checks the origin cert exists.
2. Swaps `caddy/Caddyfile` for the domain-aware config (`caddy/Caddyfile.cloudflare`) —
   Caddy now listens on `api.matriq.app` with the Origin cert and forwards the real client
   IP (`CF-Connecting-IP`) so rate limiting/audit IPs stay correct behind Cloudflare.
3. Ensures `.env` has `CORS_ORIGIN=https://admin.matriq.app,https://dashboard.matriq.app`
   (the backend whitelists exactly these origins — Vercel browser calls to the API need
   this or they get CORS-blocked).
4. Restarts caddy + backend, then verifies `https://api.matriq.app/health` through
   Cloudflare.
5. Runs the existing `scripts/deploy.sh` flow so nothing else drifts.

The script is idempotent and reversible (`bash scripts/enable-cloudflare.sh --disable`
restores the pre-domain config).

---

## Verify end-to-end

| Check | Expected |
|---|---|
| `curl -I https://api.matriq.app/health` | `200` + `server: cloudflare` header |
| `https://admin.matriq.app` | Admin login page loads (TLS from Vercel) |
| `https://dashboard.matriq.app` | Dashboard login page loads |
| Login on both, then a browser call to `/v1/associations/…` | No CORS errors in DevTools |
| Mobile APK (already `https://api.matriq.app/v1`) | Register/login works from the phone |

---

## Security notes (per `security.md`)

- SSL/TLS mode **Full (strict)** — never Flexible (that would send origin traffic in
  plaintext).
- Origin cert private key stays on the VM (`caddy/certs/`, gitignored, `chmod 600`).
- Cloudflare WAF default managed rules on; don't enable "Under Attack" mode for `api.`
  (it would challenge the APK's non-browser requests).
- CORS stays locked to the two dashboard origins + `http://localhost:8081` (dev).
- Add the Cloudflare nameservers/zone info to `docs/setup-checklist.md` when live.
