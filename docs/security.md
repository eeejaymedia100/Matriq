# Matriq — Security Requirements

**Status: binding.** This document is not a "harden it later" checklist. The items marked
**[P0]** must be true before Phase 1 is considered done. Building around this document to move
faster is the single most common way projects like this get breached — don't.

Matriq will hold student PII (names, JAMB numbers, matric numbers, contact details), payment
references, and association financial data across potentially thousands of students. Treat it
accordingly.

## Threat model — who and what you're defending against

- **Opportunistic scanners and bots** — the vast majority of real-world attacks against small
  apps like this, not targeted hackers. Default credentials, exposed `.env` files, unpatched
  dependencies, open admin panels. Defend against this first; it's cheap to and it stops 95% of
  incidents.
- **Students trying to bypass or forge payment status** — the most likely *motivated* attacker
  you'll actually face. Assume someone will try to mark themselves "paid" without paying, replay
  a receipt, or forge a QR code. Every payment-state change must be verified server-side against
  the payment gateway, never trusted from the client.
- **Account takeover of executive/admin accounts** — the highest-impact target, since it grants
  access to funds data, the ability to send announcements to the whole student body, and (for
  admin) control of every association on the platform. This is where MFA and audit logging earn
  their cost.
- **Credential stuffing** — assume some student email/password pairs are reused from breached
  sites elsewhere. Rate limit and monitor login attempts regardless of password strength.
- **Data scraping / bulk PII exfiltration** — a platform holding thousands of students' JAMB
  numbers and contact info is a target for this even if no single record is "valuable." Rate
  limit and paginate every list endpoint; never return more than one student's full record to a
  non-admin caller.
- **You, the operator, via a compromised or over-permissioned build agent** — the coding agent
  running in your tmux session has write access to a production-adjacent machine. Scope its
  permissions deliberately (see the "Agent-specific" section below).

## Authentication — [P0]

- Passwords hashed with **Argon2id** (not bcrypt, not plain SHA). Use a vetted library, don't
  hand-roll.
- JWT access tokens, short-lived (15 minutes), with refresh token rotation. Refresh tokens
  stored server-side (or as httpOnly, secure, sameSite cookies for any web-facing surface) —
  never accessible to JS on either the mobile app or a browser.
- Every login attempt rate-limited per account *and* per IP, with exponential backoff.
- **MFA required for Treasurer, President, P.R.O., and Admin accounts.** Not optional, not
  "recommended in settings" — required at account creation for these roles, given what they can
  access.
- Session invalidation on password change, and a "log out of all devices" action available to
  every user.
- **Identity verification is now document-upload + executive review for both paths** (see
  `docs/onboarding-flows.md`). No portal password is ever collected. Both Staylite and Fresher
  accounts start as `matric_status = provisional` and remain restricted until an executive
  approves their uploaded verification document. Until confirmed: no executive-role actions,
  not counted in confirmed-member stats, flagged distinctly for the association's own review.
  The uploaded documents themselves are stored in a **private** GCS bucket, accessed only via
  backend-generated signed URLs — never a public bucket.

## Authorization / RBAC — [P0]

- Roles: `student`, `treasurer`, `president`, `pro`, `admin`. Enforce at the API layer, on every
  endpoint, not just hidden in the mobile app's navigation. A hidden button is not access
  control.
- The prototype's "click the logo 5 times" admin entry point was a UI easter egg for a demo —
  **do not carry that pattern into the real product.** Admin access is a real login, on a
  separate, non-discoverable subdomain or route, with its own MFA and IP-based alerting on new
  login locations.
- No role can escalate its own privileges. Only `admin` can grant executive roles, and every
  grant is audit-logged with who granted it and when.
- Association-scoped data isolation: a Treasurer of Association A must never be able to query
  Association B's data, even by guessing an ID. Enforce this with a query-level check, not just
  by not exposing a UI path to it.

## Data protection

- **TLS 1.3 everywhere**, no exceptions, including internal service-to-service calls once you
  have more than one box.
- Encryption at rest for the database (GCP-managed disk encryption is a baseline; consider
  column-level encryption for JAMB numbers and matric numbers specifically, since they're
  effectively national identifiers for the student).
- **Never store raw payment card data.** Use the payment gateway's hosted checkout / tokenized
  charge flow so card data never touches your servers. See `docs/payment-integration.md` and
  `docs/compliance-privacy.md` for PCI scope implications.
- Secrets (DB credentials, JWT signing keys, payment gateway keys, model API keys if any) live in
  **GCP Secret Manager**, injected at runtime. Never in `.env` files committed to git, never in
  Docker image layers, never in CI logs.
- `.gitignore` must cover `.env*`, `*.pem`, `*.key`, and any local credential files from the
  very first commit. Verify this is actually working (commit a dummy secret file locally and
  confirm `git status` doesn't see it as trackable) — don't just trust the `.gitignore` exists.

## API security

- Input validation on every endpoint (schema validation library, not ad-hoc checks) — reject
  unexpected fields rather than silently ignoring them.
- Parameterized queries / ORM only. No string-concatenated SQL, anywhere, ever.
- Rate limiting per-endpoint, tuned per sensitivity (login and payment-initiation endpoints get
  the strictest limits).
- CORS locked to your actual mobile app's origin and any web admin surface — not `*`.
- Every payment gateway webhook verified by signature before being trusted. Assume webhook URLs
  will be discovered and hit with forged payloads; the signature check is what saves you.
- Idempotency keys on payment-initiating endpoints, so a retried request (bad network, impatient
  double-tap) can't create a duplicate charge or duplicate "paid" state.

## Mobile app security

- No secrets embedded in the app bundle. The mobile app talks to *your* backend; your backend
  holds the payment gateway secret key and the model server credentials, never the app.
- Sensitive local storage (auth tokens) in the platform secure store (iOS Keychain, Android
  Keystore via `expo-secure-store` or equivalent) — never `AsyncStorage`/plain files.
- Certificate pinning for the app's connection to your backend, if the release timeline allows
  it — this is a "should," not a Phase 0 blocker, but don't let it slip past Phase 6.
- Assume the APK can and will be decompiled. Don't rely on client-side checks for anything that
  matters (payment status, role checks, fee amounts) — the server is the source of truth for all
  of it, always.

## Infrastructure security

- SSH: key-based auth only, password auth disabled at the sshd config level, not just
  "recommended."
- The GCP VM's firewall allows only the ports actually needed (443, and SSH from a known IP
  range if possible — Termux's IP will change on mobile data, so this may need to stay open, but
  pair it with fail2ban or GCP's own brute-force protection).
- The backend and model server run as a **non-root user** inside their containers and on the
  host. The coding agent's tmux session should also not be running as root day-to-day.
- Dependency scanning in CI (Dependabot or equivalent) with a policy of actually merging the
  security patches it opens, not letting them pile up.
- Container image scanning before any image is deployed.
- Regular (automated, scheduled) database backups, stored encrypted, with a tested restore
  process — a backup that's never been restored from is not a backup you can trust.

## The AI model's own attack surface

- The model server is **never exposed directly to the internet.** It sits behind your backend,
  on an internal network / private GCP VPC, reachable only from the backend service.
- Rate-limit AI Companion queries per user — an unlimited free-text endpoint into a self-hosted
  model is a resource-exhaustion target even without malicious intent.
- The ingestion pipeline for "past questions and student materials" (see `docs/ai-model.md`) must
  moderate/sanitize content before it can influence retrieval or any fine-tuning cycle. An
  unmoderated pipeline is a direct data-poisoning vector — a student could upload content
  designed to make the model say something false, offensive, or exploitable to other students.
- Treat model outputs as untrusted content when rendering them in the app (no raw HTML
  rendering of model output that could enable injection into the app's UI layer).

## Audit logging — [P0]

- Every action taken by a Treasurer, President, P.R.O., or Admin is logged: who, what, when,
  from where (IP). This is the feature that lets you answer "who sent this announcement" or "who
  changed this dues amount" after the fact — build it alongside the actions themselves, not
  after an incident makes you wish you had it.
- Logs are append-only from the application's perspective (the app can write, not delete or
  edit existing entries).
- Failed login attempts, MFA failures, and permission-denied events are logged and, past a
  threshold, alerted on.

## Incident response basics

- A monitoring/alerting channel exists (even a simple one — a Slack/Telegram webhook on error
  rate spikes or repeated auth failures counts) before Phase 9. Silent failures are the enemy.
- Have a documented "revoke everything" runbook: rotate JWT signing key, force logout all
  sessions, rotate payment gateway keys — written down before you need it, not improvised during
  an incident.

## Agent-specific rules (read this if you are the coding agent)

- You are operating on a machine that will hold real student data. Treat every shortcut you're
  tempted to take here the same way you'd treat it if this were someone else's money and someone
  else's personal data — because it will be.
- Never generate, commit, or print a real secret value in a commit message, log line, or your
  own chat output. If you need to show a human a value to confirm, redact all but the last 4
  characters.
- Never disable a security control (rate limiting, RBAC check, TLS) "temporarily to test
  something" without immediately re-enabling it in the same session and noting it in
  `docs/progress-log.md`. If you're not confident you'll remember to re-enable it, don't disable
  it — find another way to test.
- If a task in `agenda.md` seems to require violating something in this document, stop and flag
  it to the human rather than resolving the conflict yourself.
