# Data Model

PostgreSQL. Table names below are conceptual — follow whatever ORM/naming convention the backend
framework settles on (e.g., NestJS + Prisma or TypeORM), but keep the fields and relationships
below intact. Every table with a `deleted_at` column uses soft deletes, not hard deletes, for
anything touching financial or audit-relevant data.

## `users` (students)

| Field | Type | Notes |
|---|---|---|
| id | uuid | PK |
| full_name | text | |
| email | text | unique, indexed |
| password_hash | text | Argon2id — only set for accounts with a real password (see below) |
| registration_type | enum | `staylite` \| `fresher` |
| matric_number | text, nullable | present for `staylite`, or once a fresher is screened |
| jamb_number | text, nullable | present for `fresher` until matric is assigned |
| matric_status | enum | `confirmed` \| `provisional` |
| faculty | text | |
| department | text | |
| level | text | |
| mfa_enabled | boolean | not required for students, available optionally |
| created_at, updated_at, deleted_at | timestamp | |

**Identity verification model (see `docs/onboarding-flows.md`):** both Staylite and Fresher
accounts start as `matric_status = provisional`. A student uploads a verification document
(student ID photo or portal profile screenshot), which enters a review queue for their
association's executives. An executive approves (flips status to `confirmed`) or rejects.
No portal password is ever collected — see `docs/onboarding-flows.md` for the full decision.

The `verification_requests` table (below) tracks every upload and review action.

## `associations`

| Field | Type | Notes |
|---|---|---|
| id | uuid | PK |
| name | text | |
| short_code | text | unique, e.g. `NAAS` |
| faculty | text | |
| whatsapp_number | text | executives' contact, used for Services hand-off links |
| status | enum | `active` \| `suspended` |
| created_at, updated_at | timestamp | |

## `association_executives`

Join table — links an executive to an association and a specific role. Used by both the
Association Dashboard (web app) and the mobile app's JWT payload enrichment.

| Field | Type | Notes |
|---|---|---|
| id | uuid | PK |
| user_id | uuid | FK → users, nullable — same human may hold both a student account and an executive login; keeping them linked via user_id makes RBAC enrichment simple, even though auth for the Association Dashboard is session-based (httpOnly cookie) vs the mobile app's Bearer JWT |
| association_id | uuid | FK → associations |
| role | enum | `president` \| `treasurer` \| `pro` |
| mfa_enabled | boolean | must be `true` before the account is usable — see `security.md` |
| created_at | timestamp | |

**Auth model (final — see `docs/architecture.md`):** the Association Dashboard uses
session-based auth (httpOnly, secure, sameSite cookie) via Next.js + next-auth, not JWT Bearer
tokens like the mobile app. The executive's `user_id` in this table provides the link to their
student identity for audit/logging purposes, but the session itself is managed separately.
MFA is required for every executive account per `security.md`.

## `memberships`

| Field | Type | Notes |
|---|---|---|
| id | uuid | PK |
| user_id | uuid | FK → users |
| association_id | uuid | FK → associations |
| status | enum | `live` \| `pending` — matches the prototype's "coming soon" stub for a second association |
| joined_at | timestamp | |

## `verification_requests`

Tracks every identity document upload and its executive review outcome. One student can have
multiple requests (re-submission after rejection creates a new row; old ones are preserved).

| Field | Type | Notes |
|---|---|---|
| id | uuid | PK |
| user_id | uuid | FK → users |
| association_id | uuid | FK → associations (the association the student is claiming membership in) |
| document_storage_ref | text | GCS object path — the file lives in a **private** GCS bucket, accessed only via backend-generated signed URLs, never a public bucket |
| document_original_name | text | original filename for display |
| document_mime_type | text | for correct content-type when serving via signed URL |
| status | enum | `pending` \| `approved` \| `rejected` |
| reviewed_by | uuid, nullable | FK → association_executives — who reviewed it |
| reviewed_at | timestamp, nullable | |
| rejection_reason | text, nullable | required when status = rejected |
| created_at | timestamp | |

**Rule:** a student's `matric_status` on the `users` table flips to `confirmed` only when a
`verification_requests` row for that user is set to `status = approved` — enforced in the
application layer, not just convention.

## `fees`

An association-defined payable item (dues, but also ticket/merch pricing if those move in-app
later — kept generic on purpose).

| Field | Type | Notes |
|---|---|---|
| id | uuid | PK |
| association_id | uuid | FK |
| name | text | e.g. "NAAS Dues — 2026/2027" |
| amount_kobo | integer | store money as integer minor units, never float |
| currency | text | `NGN` |
| due_date | date | |
| session | text | e.g. "2026/2027" |
| created_at | timestamp | |

## `payments`

| Field | Type | Notes |
|---|---|---|
| id | uuid | PK |
| user_id | uuid | FK |
| fee_id | uuid | FK |
| amount_kobo | integer | snapshot at time of payment, don't just join to `fees` — fee amounts can change later |
| status | enum | `pending` \| `processing` \| `successful` \| `failed` \| `cancelled` \| `refunded` \| `disputed` — full state machine required by `production-directive.md` §17, detailed transition rules in `docs/payment-integration.md` |
| gateway_reference | text | Paystack's reference, unique, indexed |
| internal_reference | text | your own reference, unique |
| method | text | card / bank transfer / USSD, from gateway response |
| paid_at | timestamp, nullable | |
| refunded_at | timestamp, nullable | |
| refund_reason | text, nullable | |
| dispute_reference | text, nullable | Paystack's dispute reference, if `status = disputed` |
| rank_at_payment | integer, nullable | for the gamified "rank #N to pay" feature |
| created_at, updated_at | timestamp | |

**Critical:** `status` only ever transitions to `success` from a verified webhook or a verified
server-side confirmation call to the gateway — never from a client-reported "I paid" call. See
`docs/payment-integration.md`.

## `receipts`

| Field | Type | Notes |
|---|---|---|
| id | uuid | PK |
| payment_id | uuid | FK, unique (one receipt per successful payment) |
| receipt_number | text | unique, human-readable |
| qr_payload | text | signed/verifiable payload, not just a display string — see payment-integration.md |
| issued_at | timestamp | |
| verified_by_executive_id | uuid, nullable | FK → association_executives, set when scanned/verified |
| verified_at | timestamp, nullable | |

## `announcements`

| Field | Type | Notes |
|---|---|---|
| id | uuid | PK |
| association_id | uuid | FK |
| author_executive_id | uuid | FK → association_executives |
| title | text | |
| body | text | |
| pinned | boolean | |
| created_at | timestamp | |

## `announcement_reads`

For the "seen by X/Y students" read-receipt feature — one row per (announcement, student) once
read, not a counter, so it's auditable and can't double-count.

| Field | Type | Notes |
|---|---|---|
| announcement_id | uuid | FK, composite PK with user_id |
| user_id | uuid | FK |
| read_at | timestamp | |

## `events`

| Field | Type | Notes |
|---|---|---|
| id | uuid | PK |
| association_id | uuid | FK |
| title, description, location | text | |
| event_date | timestamp | |
| created_at | timestamp | |

## `event_rsvps`

| Field | Type | Notes |
|---|---|---|
| event_id | uuid | FK, composite PK with user_id |
| user_id | uuid | FK |
| rsvp_at | timestamp | |

## `referrals`

| Field | Type | Notes |
|---|---|---|
| id | uuid | PK |
| referrer_id | uuid | FK → users |
| referred_user_id | uuid, nullable | FK → users, set once the referred person actually registers — don't count a "share" as a referral, count a real signup |
| created_at | timestamp | |

## `admin_accounts`

Deliberately separate from `users` and `association_executives` — the highest-privilege role
gets its own table, not a role flag on a shared table, to make accidental privilege escalation
structurally harder. Used by the Admin Console (separate Next.js web app, `admin.<domain>`).

| Field | Type | Notes |
|---|---|---|
| id | uuid | PK |
| email | text | unique |
| password_hash | text | Argon2id |
| mfa_enabled | boolean | must be true, enforced at the application layer before the account can log in |
| created_at | timestamp | |

## `audit_logs`

Append-only. See `security.md`.

| Field | Type | Notes |
|---|---|---|
| id | uuid | PK |
| actor_type | enum | `executive` \| `admin` |
| actor_id | uuid | |
| action | text | e.g. `announcement.created`, `association.suspended`, `fee.amount_changed` |
| target_type, target_id | text, uuid | what was acted on |
| ip_address | text | |
| metadata | jsonb | before/after values where relevant |
| created_at | timestamp | |

## `ai_documents` (RAG store)

| Field | Type | Notes |
|---|---|---|
| id | uuid | PK |
| source_type | text | e.g. `past_question`, `handout` |
| course_code | text, nullable | for retrieval scoping |
| association_id | uuid, nullable | |
| content_chunk | text | |
| embedding | vector | pgvector column |
| moderation_status | enum | `pending` \| `approved` \| `rejected` — see `docs/ai-model.md` |
| submitted_by_user_id | uuid, nullable | for traceability |
| created_at | timestamp | |

## `ai_query_logs`

| Field | Type | Notes |
|---|---|---|
| id | uuid | PK |
| user_id | uuid | FK |
| query_text | text | |
| response_text | text | |
| retrieved_document_ids | uuid[] | |
| created_at | timestamp | |

Kept for quality review and abuse monitoring — but treat as sensitive data (students may ask
about personal struggles alongside academic questions) and scope access to it accordingly in
`compliance-privacy.md`.

## `legal_acceptances`

Per `production-directive.md` §14: never a bare `termsAccepted = true` boolean. Every acceptance
records exactly which document, which version, by whom, and when.

| Field | Type | Notes |
|---|---|---|
| id | uuid | PK |
| user_id | uuid | FK — links to users; executive accounts link via association_executives.user_id; admin accounts don't share this table (their legal acceptance is implicit in account creation by a human operator) |
| document_type | enum | `privacy_policy` \| `terms_and_conditions` |
| document_version | text | e.g. `"1.0"` — matches the version stated in `docs/legal/privacy-policy.md` / `terms-and-conditions.md` at the time of acceptance |
| accepted_at | timestamp | |
| ip_address | text | |

**Rule:** if either legal document's version changes, existing users must be prompted to accept
the new version before continuing to use features that depend on it (at minimum, payments) — an
acceptance record tied to an old version does not silently carry forward as acceptance of a new
one. See `docs/backend-api.md` for the enforcement endpoint.
