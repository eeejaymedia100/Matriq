# Backend API

Base convention: REST, JSON, versioned from day one (`/v1/...`) so a breaking change later
doesn't force every mobile client to update simultaneously.

## Auth model recap

- Bearer JWT access token (15 min expiry) on every authenticated request.
- Refresh token rotation on `/v1/auth/refresh`.
- Every endpoint below states its minimum required role. `self` means "any authenticated user,
  scoped to their own data only" — enforced server-side, not just by not exposing a UI path.

## Auth

| Method | Path | Role | Notes |
|---|---|---|---|
| POST | `/v1/auth/register/staylite` | none | full name, email, password (Matriq account), matric number, faculty, department, level — **no portal password** |
| POST | `/v1/auth/register/fresher` | none | full name, email, password (Matriq account), JAMB number, faculty, department — **no portal password ever** |
| POST | `/v1/auth/login` | none | rate-limited aggressively, see `security.md`. If the account has MFA enabled, returns `{ mfaRequired: true, challengeToken }` (5-minute, single-purpose) and **no tokens** — the client must complete step 2 first |
| POST | `/v1/auth/mfa/challenge` | none (valid challenge token) | step 2 of login for MFA-enabled accounts — body `{ challengeToken, code }` (6-digit TOTP), returns the real token pair on success |
| POST | `/v1/auth/refresh` | none (valid refresh token) | rotates the refresh token |
| POST | `/v1/auth/logout` | self | invalidates current session |
| POST | `/v1/auth/logout-all` | self | invalidates every session for this account |
| POST | `/v1/auth/mfa/enroll` | self (executive/admin) | required before an executive/admin account is usable |
| POST | `/v1/auth/mfa/verify` | self | verify an enrollment TOTP and enable MFA (enrollment flow, not login — login uses `/v1/auth/mfa/challenge`) |

## Legal documents & consent

| Method | Path | Role | Notes |
|---|---|---|---|
| GET | `/v1/legal/privacy-policy` | none | returns the current published version + text, sourced from `docs/legal/privacy-policy.md`'s reviewed/published content, not the draft directly |
| GET | `/v1/legal/terms-and-conditions` | none | same pattern |
| POST | `/v1/legal/accept` | self | body: `{ document_type, document_version }` — writes a `legal_acceptances` row, see `docs/data-model.md`. Registration endpoints should require this call (or an equivalent inline acceptance) before completing account creation. |
| GET | `/v1/me/legal-status` | self | whether the current user has accepted the currently-published version of each document — used to prompt re-acceptance after a version change, per `data-model.md`'s rule |

## Identity Verification (document upload + executive review)

| Method | Path | Role | Notes |
|---|---|---|---|
| POST | `/v1/me/verification/upload` | self | upload verification document (student ID or portal screenshot) — multipart form, stored in private GCS bucket |
| GET | `/v1/me/verification` | self | view own verification request status + any rejection reason |
| GET | `/v1/associations/:id/verification-requests` | executive (that association) | list pending/reviewed requests for this association |
| GET | `/v1/verification-requests/:id/document` | executive (that association) | signed URL to view the uploaded document (expires quickly, single-use ideally) |
| POST | `/v1/verification-requests/:id/approve` | executive (that association) | flips request to `approved`, flips student's `matric_status` to `confirmed` |
| POST | `/v1/verification-requests/:id/reject` | executive (that association) | body: `{ reason }` — flips request to `rejected`, student notified with reason |

## Students

| Method | Path | Role | Notes |
|---|---|---|---|
| GET | `/v1/me` | self | profile, matches Dashboard needs. Includes `executive: [{ id, associationId, role, associationName, shortCode }]` for every association this user is an executive of — powers the dashboard's association detection |
| PATCH | `/v1/me` | self | name/department/level edits, matches the prototype's profile quick-edit |
| GET | `/v1/me/badges` | self | gamification badges |
| GET | `/v1/me/payment-history` | self | |

## Fees & Payments

| Method | Path | Role | Notes |
|---|---|---|---|
| GET | `/v1/associations/:id/fees` | self (must be a member) | |
| POST | `/v1/payments/initiate` | self | creates a `pending` payment, returns a Paystack checkout reference — never marks success here |
| POST | `/v1/payments/webhook/paystack` | none (signature-verified) | the only path that can set a payment to `success`, see `docs/payment-integration.md` |
| GET | `/v1/payments/:id` | self, or executive of the owning association | |
| GET | `/v1/payments/:id/receipt` | self, or executive | |
| POST | `/v1/payments/:id/share-card` | self | returns a rendered image (server-side render, or the client renders from returned data — decide in Phase 3) |

## Announcements

| Method | Path | Role | Notes |
|---|---|---|---|
| GET | `/v1/associations/:id/announcements` | self (member) | pinned first |
| POST | `/v1/associations/:id/announcements` | treasurer, president, pro | audit-logged |
| POST | `/v1/announcements/:id/read` | self | powers the read-receipt count, one row per user per `data-model.md` |
| GET | `/v1/associations/:id/announcements/:id/reads` | executive | "seen by X/Y" |

## Events

| Method | Path | Role | Notes |
|---|---|---|---|
| GET | `/v1/associations/:id/events` | self (member) | |
| POST | `/v1/associations/:id/events` | treasurer, president, pro | |
| POST | `/v1/events/:id/rsvp` | self | idempotent toggle |

## Association Dashboard

| Method | Path | Role | Notes |
|---|---|---|---|
| GET | `/v1/associations/:id/dashboard` | executive of that association only | stats, top payers, fund allocation |
| GET | `/v1/associations/:id/activity` | executive | live payment feed |
| POST | `/v1/associations/:id/verify-receipt` | executive | QR scan verification path |
| PATCH | `/v1/associations/:id/transparency` | president | the "where dues go" breakdown, president-only to edit |

## Referrals

| Method | Path | Role | Notes |
|---|---|---|---|
| POST | `/v1/me/referrals` | self | records the invite share event |
| GET | `/v1/me/referrals` | self | count, Ambassador status |

## AI Study Companion

| Method | Path | Role | Notes |
|---|---|---|---|
| POST | `/v1/ai/query` | self | rate-limited, see `security.md` and `docs/ai-model.md` |
| GET | `/v1/ai/conversations` | self | query history for this user |
| POST | `/v1/ai/materials` | executive or verified student | ingestion entry point, goes to `moderation_status = pending` |

## Admin (separate, more restrictive surface)

| Method | Path | Role | Notes |
|---|---|---|---|
| POST | `/v1/admin/auth/login` | none | separate login path from student/executive auth entirely. If the admin account has MFA enabled, returns `{ mfaRequired: true, challengeToken }` (5-minute, single-purpose) and **no token** — complete via `/v1/admin/auth/mfa/challenge` |
| POST | `/v1/admin/auth/mfa/challenge` | none (valid challenge token) | step 2 of admin login for MFA-enabled accounts — body `{ challengeToken, code }` (6-digit TOTP), returns the access token on success |
| POST | `/v1/admin/auth/mfa/enroll` | admin | generate TOTP secret + QR (does not enable yet) |
| POST | `/v1/admin/auth/mfa/verify` | admin | verify enrollment code and enable MFA |
| POST | `/v1/admin/auth/mfa/disable` | admin | disable MFA (clears secret) |
| GET | `/v1/admin/auth/mfa-status` | admin | whether MFA is enabled / secret set |
| GET | `/v1/admin/auth/me` | admin | current admin identity — used by the admin console session layer to validate cookies |
| GET | `/v1/admin/associations` | admin | |
| POST | `/v1/admin/associations` | admin | onboarding a new association |
| PATCH | `/v1/admin/associations/:id/status` | admin | suspend/reactivate |
| GET | `/v1/admin/analytics` | admin | cross-association overview |
| GET | `/v1/admin/audit-logs` | admin | |
| POST | `/v1/ai/materials/:id/moderate` | admin | approve/reject queued AI ingestion content |

## Error handling convention

- Consistent error shape (`{ error: { code, message } }`), no raw stack traces or SQL errors
  ever returned to the client, in any environment including staging.
- Every 401/403 response is intentionally vague about *why* (don't leak "user exists but wrong
  password" vs "user doesn't exist" — that's an enumeration vector).

## Pagination

Every list endpoint is paginated (cursor-based preferred) from day one — never a plain "return
all rows" endpoint, even ones that feel small today (`security.md`'s note on bulk PII
exfiltration applies here directly).
