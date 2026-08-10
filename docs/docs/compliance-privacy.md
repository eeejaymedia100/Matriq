# Compliance & Privacy

## Nigeria Data Protection Act (NDPA 2023) / NDPR

Matriq will hold personal data (names, contact details, JAMB numbers, matric numbers) for
potentially thousands of Nigerian students. Baseline obligations to build in, not bolt on:

- **Lawful basis and consent** — registration flow must include clear consent to data
  collection/processing, not buried in a wall of text nobody reads. A short, real privacy notice
  at the point of registration (before Fresher/Staylite forms are submitted).
- **Data minimization** — only collect what's actually used. The data model already reflects
  this reasonably well (`docs/data-model.md`) — don't casually add "nice to have" personal
  fields later without asking why they're needed.
- **Verification documents** — uploaded student ID photos or portal screenshots are a new
  category of personal data (see `docs/legal/data-processing.md`). They are stored in a private
  GCS bucket with signed-URL access only, never publicly accessible. Retention: until
  verification is complete + 90 days after account deletion (confirm in legal review).
- **Right to access / erasure** — a student should be able to request their data and request
  deletion. Build a documented (even if initially manual, executed-by-you) process for this
  before real users are onboarded — don't wait for the first request to figure out how.
- **Data breach notification duty** — under NDPA, there are notification obligations if a breach
  occurs. Having `docs/infrastructure.md`'s monitoring/alerting and `security.md`'s incident
  response runbook in place is what makes this actually achievable if it's ever needed, rather
  than aspirational.
- **In-app privacy policy** — required, linked from the registration flow and settings, plain
  language, actually describing what Matriq does with student data (including that AI queries
  are logged, per `docs/ai-model.md` and `data-model.md`'s `ai_query_logs` table — be upfront
  about this specifically, since students may not expect their study questions to be retained).

## PCI-DSS scope

Because payments route through Paystack's **hosted checkout**, card data never touches your
servers or app code — this keeps you in the lowest PCI scope tier (broadly, SAQ-A territory),
rather than the much heavier obligations that apply if you ever handled raw card data directly.
**Do not build a custom card-entry form** that posts card details to your own backend, even if
it seems more "native app" polished — that single decision is what keeps PCI scope manageable.
See `docs/payment-integration.md`.

## AI query data — a specific privacy consideration

`ai_query_logs` (see `docs/data-model.md`) retains what students actually ask the AI Study
Companion. Students may ask about personal academic struggles, not just factual course
questions. Treat this table with the same access discipline as the most sensitive data in the
system:
- Access restricted to what's operationally necessary (debugging, quality review) — not broadly
  queryable by every admin by default.
- Retention period should be a deliberate decision, not "forever by default" — document whatever
  period is chosen and why.
- Disclosed plainly in the privacy policy, not just implied.

## Association financial transparency vs. individual privacy

The "where dues go" transparency feature and the "top payers" leaderboard both surface data
that's semi-public *within* an association by design (that's the point — visible trust and light
gamification). Be deliberate about the boundary:
- Individual payment amounts and personal payment history are never exposed to anyone other than
  the student themselves and their association's executives — the leaderboard shows names and
  "paid," not amounts, timestamps, or any other personal payment detail beyond what the
  prototype already scoped it to.
- A student should be able to understand, ideally from the privacy policy directly, that their
  name and "paid" status are visible to fellow members via the leaderboard — this is a real
  disclosure point, not just an internal implementation detail.

## Terms of Service

A short, real Terms of Service covering: what Matriq is (a facilitation platform, not the
association itself), that WhatsApp hand-off services are external and not warranted by Matriq,
and dispute handling for payment issues (point to Paystack's own dispute process for
gateway-level issues, and to the association directly for dues-usage questions).
