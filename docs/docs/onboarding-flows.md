# Onboarding Flows — Staylite vs Fresher

## Decision (final — do not re-litigate)

Portal password collection is **removed entirely** for both paths. There is no real API into
the university's portal; holding student portal credentials is a materially worse risk category
than anything else in `security.md`; and scraping the portal on the student's behalf is
permanently out of scope, not deferred.

## Entry point

The first screen after opening the app (no session) presents two choices:

1. **Staylite** — "I'm already a student"
2. **New Student (Fresher)** — "No matric number yet? Register with your JAMB number instead"

## Staylite path

**Input:** full name, email, password (for Matriq account), matric number, faculty, department,
level. **No portal password field — ever.**

**On submit:**
- `registration_type = staylite`
- `matric_number` set to the self-attested value
- `matric_status = provisional` — same as Fresher now; both paths start provisional
- Account is created immediately

**After registration:** the student is prompted to upload a verification document — a photo of
their student ID card, or a screenshot of their own portal profile page. This upload creates a
`verification_requests` row and associates it with the student's declared association (based on
faculty).

## Fresher path

**Input:** full name, email, password (for Matriq account), JAMB registration number, faculty,
department. Never collects a portal password — freshers don't have portal access by design.

**On submit:**
- `registration_type = fresher`
- `matric_number = null`, `jamb_number` set
- `matric_status = provisional`
- `level` defaults to `"100"`

**After registration:** same document upload prompt as Staylite — freshers can upload their
JAMB slip or admission letter as their verification document.

## Verification flow (applies to BOTH paths)

1. Student uploads a verification document (student ID photo or portal profile screenshot).
2. Document enters a review queue visible to that student's association's executives
   (Treasurer, President, or P.R.O. — any can review).
3. Each executive who reviews sees: the student's name, self-attested matric/JAMB number,
   the uploaded document, and Approve / Reject buttons.
4. **Approve** — `matric_status` flips to `confirmed`. Student is notified.
5. **Reject** — student is notified with the executive's rejection reason. Student can
   re-submit (creates a new `verification_requests` row; the old one stays as a record).
6. **Until confirmed**: existing "provisional" restrictions apply to both paths — no
   executive-role actions, not counted in confirmed-member stats, a clear "Verification
   Pending" badge shown on the Dashboard.

## Identity sync animation

Cosmetic — Staylite sees "Setting up your account..." language, Fresher sees "Registering your
details..." language. Keep this distinction; it signals which path the user is on.

## Downstream handling — consistent across paths

- Dashboard: identity line shows matric number (Staylite) or JAMB number (Fresher) with a
  "Provisional" badge until confirmed.
- Fee Details: an additional note that identity verification is pending.
- Digital Receipt / Payment Complete / executive's receipt verification screen: label switches
  dynamically between "Matric No." and "JAMB No." — never show an empty or `null` field.
- WhatsApp service hand-off messages: use JAMB number in the prefilled message when no matric
  number exists yet.
- Once a fresher's matric number is later assigned (via admin/executive action), update
  `matric_number` and flip `matric_status = confirmed`. All prior payment/receipt records
  stay associated with the same `user_id`.

## Security notes

- Both paths now start as `provisional` — the weaker identity claim of Fresher is no longer a
  special case; it's the default until an executive confirms.
- Rate-limit both registration endpoints and the document upload endpoint separately from login.
- Uploaded documents must be stored in a **private** GCP Cloud Storage bucket, accessed only
  via signed URLs — never a public bucket. These documents are personal data (see
  `docs/legal/data-processing.md`).
- Executive review actions are audit-logged: who approved/rejected, when, and which student.
