# Data Processing Record

This document is a factual, technical record of what personal data Matriq processes, why, and
through what systems — the engineering-facing counterpart to `privacy-policy.md`. Unlike the
Privacy Policy and Terms & Conditions, this document is primarily a description of what the
system *actually does* (verifiable against `docs/data-model.md` and `docs/architecture.md`)
rather than a legal statement of rights and obligations — but it should still be reviewed
alongside the legal documents, since it's the source that the Privacy Policy's claims need to
stay accurate against.

**Keep this document synchronized with `docs/data-model.md`.** If a new table or field is added
that holds personal data, add a row here in the same change — this is exactly the kind of drift
`production-directive.md` Section 23 (Documentation Maintenance) warns against.

## Processing activities

| Data category | Fields (see `data-model.md`) | Purpose | Legal basis (draft — confirm in legal review) | Retention |
|---|---|---|---|---|
| Identity — Staylite | `matric_number` | Verify student status, enable account | Contract necessity | Life of account + record-keeping period |
| Identity — Fresher | `jamb_number`, `full_name`, `email` | Provisional identity for pre-screening registration | Contract necessity | Life of account + record-keeping period |
| Identity verification document | Uploaded student ID or portal screenshot (stored in private GCS bucket, accessed only via backend-generated signed URLs) | Executive review to confirm student identity | Consent (user voluntarily uploads) | Until verification is complete + 90 days after account deletion (retained briefly post-deletion for audit/accountability of executive review decisions — confirm period in legal review) |
| Contact | `email` | Account access, notifications | Contract necessity | Life of account |
| Academic | `faculty`, `department`, `level` | Scope association membership, scope AI retrieval | Contract necessity | Life of account |
| Payment records | `payments.*`, `receipts.*` | Process dues, generate verifiable receipts | Contract necessity, legal obligation (financial record-keeping) | Per financial record-keeping requirement — confirm exact period in legal review |
| AI query history | `ai_query_logs.*` | Service quality, abuse monitoring, support | Legitimate interest — confirm this basis is appropriate in legal review | *[to confirm]* — should not default to indefinite |
| AI ingested materials | `ai_documents.*` | Power retrieval for the AI Study Companion | Consent (submitted voluntarily) | Until removed by submitter or moderation rejection |
| Audit logs | `audit_logs.*` | Security, accountability for executive/admin actions | Legitimate interest / legal obligation (security incident response) | *[to confirm — likely longer than typical user data, for accountability purposes]* |
| Referrals | `referrals.*` | Gamification feature (Ambassador status) | Consent (user-initiated action) | Life of account |

## Third parties that process data on Matriq's behalf

| Third party | Data shared | Purpose | Their own privacy commitments |
|---|---|---|---|
| Paystack | Payment amount, reference — **not** raw card/bank credentials | Payment processing | Governed by Paystack's own privacy policy and PCI-DSS obligations |
| GCP (infrastructure) | All data, at rest and in transit through Google's infrastructure | Hosting | Governed by Google Cloud's data processing terms |

**No other third party receives Matriq user data.** Specifically: the AI Study Companion is
self-hosted (`docs/ai-model.md`) and does not transmit any student data to an external AI
provider — this is a deliberate architectural decision, not just a policy statement, and should
stay true as the system evolves. If that ever changes, `privacy-policy.md` Section 5 must be
updated in the same change, not after the fact.

## Data subject rights — technical implementation status

| Right | Implemented? | Where |
|---|---|---|
| Access own data | *[status — update as built]* | `GET /v1/me` and related endpoints, `docs/backend-api.md` |
| Correct own data | *[status]* | `PATCH /v1/me` |
| Delete account/data | *[status]* | Not yet specified — needs a defined deletion flow that accounts for financial record-keeping obligations (can't simply hard-delete payment records that may be legally required to be retained) |
| Export own data | *[status]* | Not yet specified |

## Open items for legal review

See `docs/legal/legal-requirements.md` for the consolidated list of everything in this document
marked `[to confirm]` or `[status]` — those are the concrete questions legal review needs to
answer, not gaps to be filled in by engineering guesswork.
