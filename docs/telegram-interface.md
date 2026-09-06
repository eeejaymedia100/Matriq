# Matriq Telegram Interface

The Telegram interface is the first submission channel built on the
**Resource Audit Engine** (see `resource-audit-engine.md`). It has two faces:

1. **The bot** (chat) — `/upload`, `/status`, `/link`, admin review callbacks.
2. **The Mini App** (a web app inside Telegram) — visual library browsing,
   file submission, and audit tracking, served from `waitlist/telegram-miniapp/`.

The bot is **fully optional infrastructure**: without `TELEGRAM_BOT_TOKEN` the
module registers inertly and every other Matriq service is untouched.

## Architecture

```
Telegram user
  │
  ├── chat commands ──────────► POST /telegram/webhook/:secret
  │                              (or long-poll fallback in dev)
  │                                   │
  │                            TelegramBotService
  │                              │            │
  │                     TelegramGate     ResourceAuditService.submit({source:"telegram"})
  │                   (community gate)        │
  │                                      audit pipeline → human review → Vault/library
  │
  └── Mini App (web) ─────────► POST /telegram/miniapp/auth  (initData → scoped JWT)
                                 GET  /telegram/miniapp/library   (public Vault browse)
                                 POST /telegram/miniapp/submissions (file upload → audit)
                                 GET  /telegram/miniapp/submissions (status)
```

### Files (backend/src/telegram/)

| File | Role |
|---|---|
| `telegram.config.ts` | Env-driven settings; bot disabled when token absent |
| `telegram.api.ts` | Hand-rolled typed Bot API client (fetch, zero new deps) |
| `telegram-gate.ts` | Community-membership gate, Redis-cached (10 min yes / 60 s no) |
| `telegram-miniapp-auth.ts` | initData HMAC validation (Telegram's exact algorithm) |
| `telegram-miniapp.guard.ts` | Scoped-session guard for Mini App endpoints |
| `telegram-bot.service.ts` | Update router, linking, upload conversation, admin callbacks |
| `telegram.controller.ts` | Webhook receiver, Mini App endpoints, admin webhook mgmt |

Mini App frontend: `waitlist/telegram-miniapp/` (static HTML/CSS/JS, deployed
next to the waitlist site; served at `/telegram-miniapp/`).

## Environment variables (backend/.env — never committed)

```
TELEGRAM_BOT_TOKEN=<from @BotFather>          # set on the VM only
TELEGRAM_BOT_USERNAME=MatriqBot
TELEGRAM_COMMUNITY_ID=<numeric chat id>      # users must join before uploading
TELEGRAM_COMMUNITY_URL=https://t.me/...      # shown on buttons
TELEGRAM_ADMIN_IDS=6911908487                # comma-separated reviewers
TELEGRAM_WEBHOOK_SECRET=<openssl rand -hex 32>
TELEGRAM_WEBHOOK_URL=https://api.matriq.com.ng  # empty = long-poll fallback
TELEGRAM_MINIAPP_ORIGINS=https://matriq.com.ng
CORS_ORIGIN=https://matriq.com.ng,http://localhost:8081
```

## Deployment steps (in order)

1. **Set env vars** on the VM (values above). The bot token and admin IDs
   were provided out-of-band and live only in the VM environment.
2. **Apply the migration**: `npx prisma migrate deploy` (adds
   `users.telegram_id` unique + `telegram_linked_at`).
3. **Deploy the backend** (restart). On boot the bot calls `getMe`; with
   `TELEGRAM_WEBHOOK_URL` set it registers the webhook at
   `https://api.matriq.com.ng/telegram/webhook/<TELEGRAM_WEBHOOK_SECRET>`
   with Telegram's `secret_token` header verification. Without it, a single
   cluster worker acquires a Redis leader lock and long-polls.
4. **Deploy the Mini App**: upload `waitlist/telegram-miniapp/` so it serves
   at `https://matriq.com.ng/telegram-miniapp/`.
5. **In @BotFather**: set the Mini App URL on a menu button
   (`/setmenubutton` → the miniAppUrl) — the "Open Matriq" button.
6. **Verify**: `GET https://api.matriq.com.ng/v1/telegram/public-info`
   should return the bot username; send `/start` to the bot in Telegram.

## Flows

### First-time user
`/start` → welcome + "Open Matriq" (Mini App) button. Uploads require:
1. **A linked Matriq account** — `/link` → email → 6-digit code (emailed,
   15-min TTL, Redis-stored) → `users.telegram_id` claimed atomically
   (`updateMany where telegramId: null` — lost races are safe).
2. **Community membership** — `getChatMember` against
   `TELEGRAM_COMMUNITY_ID`; membership statuses
   creator/administrator/member pass. Redis-cached.

### Upload (chat)
`/upload` → gate → send file (≤20 MB, Telegram's bot cap) → course code →
type (1–5) → session → rights declaration ("yes") → the bot downloads the
bytes and calls `ResourceAuditService.submit({ source: "telegram" })` →
reference returned; admin reviewers get an inline Approve/Reject/Needs-info
card. Rate limit: 5 uploads/hour/user (Redis).

### Upload (Mini App)
Same pipeline via `POST /telegram/miniapp/submissions` with the scoped JWT.
The endpoint re-checks link + membership server-side — the gate is never
client-enforced.

### Admin review in chat
Only `TELEGRAM_ADMIN_IDS` can act on review callbacks. Approve calls
`audit.decide(id, "telegram:<adminId>", "approved")`; reject/needs-info
collect a reason in conversation (the engine enforces non-empty reasons).
Reviewers outside Telegram continue to use `POST /resource-audit/admin/...`.

### Status
`/status` lists the user's last 10 submissions with human-readable audit
states; `/status <uuid>` shows one in detail. The Mini App shows the same
data with state badges.

## Security posture

- **Webhook**: secret path segment + `X-Telegram-Bot-Api-Secret-Token`
  header check (defense in depth), throttled 600/min.
- **initData**: HMAC per Telegram's spec, timing-safe compare, 24 h
  freshness, rejects unconfigured tokens. Sessions are *scoped* — they
  never authenticate Matriq account credentials.
- **Uploads**: gate (link + membership) re-verified server-side on every
  submission path; per-user hourly cap; engine-level validation (magic
  bytes, size, rights declaration) applies unchanged to Telegram files.
- **No secrets in git**: `.env` is gitignored and verified; the codebase
  contains only placeholder keys.
