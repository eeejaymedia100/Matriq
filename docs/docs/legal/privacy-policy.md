# Matriq Privacy Policy

> **⚠️ DRAFT — NOT LEGAL ADVICE, NOT YET LEGALLY REVIEWED**
> This document was drafted by an AI engineering assistant, per `production-directive.md`
> Section 15, to give the product a structurally complete starting point covering the areas a
> real privacy policy needs to address. **It must not be shown to real users, and must not be
> described anywhere as Matriq's actual privacy policy, until a qualified lawyer familiar with
> the Nigeria Data Protection Act 2023 (and any other applicable regulation) has reviewed and
> approved it.** See `docs/legal/legal-requirements.md` for the open questions that need that
> review specifically.

**Version:** 0.1-draft
**Effective Date:** *[to be set upon legal review and publication]*
**Last Updated:** *[to be set upon legal review and publication]*

---

## 1. Who we are

Matriq ("we," "us," "the platform") is a mobile application that helps students manage
university association membership, dues payment, and academic support, and helps association
executives communicate with and collect dues from their members.

## 2. What information we collect

**Account and identity information**
- Full name, email address.
- For returning students ("Staylite" registration): matric number.
- For new/incoming students ("Fresher" registration): JAMB registration number (or equivalent
  identity document reference), used because a matric number does not yet exist at that stage.
- Faculty, department, and academic level.

**Transaction information**
- Association dues payment records: amount, date, status, and a reference to the payment
  gateway's own transaction.
- Digital receipt data, including QR verification payloads.
- We do **not** collect or store raw payment card numbers or bank account credentials — these
  are handled directly by our payment processor (see Section 5).

**Academic/course-related information**
- Past questions and course materials submitted to or accessed through the AI Study Companion
  feature.
- Records of questions asked to the AI Study Companion and the responses given, retained for
  service quality and support purposes.

**Usage information**
- Basic application usage and error/crash data, used to keep the service reliable.

**What we deliberately do not collect**
- Precise real-time location.
- Any information beyond what's listed above unless a future feature requires it — if that
  happens, this policy will be updated first, not after.

## 3. Why we collect this information

- To create and secure your account, and to verify your status as a student or association
  executive.
- To process association dues payments and generate verifiable digital receipts.
- To let association executives communicate with their members (announcements, event
  information) and manage their association's finances transparently.
- To power the AI Study Companion feature with relevant course material.
- To maintain the security, integrity, and reliability of the platform (see `security.md`).

## 4. How we store and protect information

- Data is encrypted in transit (TLS) and at rest.
- Access to student and financial data is restricted by role — association executives can only
  see data for their own association's members; platform administrators' access is logged.
- Full technical detail: `security.md`.

## 5. Who information may be shared with

- **Payment provider (Paystack):** processes dues payments directly. Card and bank details are
  handled entirely by Paystack under their own security and privacy practices — Matriq never
  receives or stores this information.
- **Your association's executives:** payment status (paid/not paid, but not full payment
  history detail beyond what's necessary), your name as relevant to association membership
  functions (e.g., the payment leaderboard, receipt verification), and any content you submit
  through Services requests.
- **We do not sell personal information to third parties.** We do not share your information
  with advertisers.
- The AI Study Companion is powered by a model we host ourselves (see `docs/ai-model.md`) — your
  questions are **not** sent to any third-party AI company.

## 6. Data retention

- Account and payment records are retained for as long as your account is active, and for a
  period after account closure as required for financial record-keeping and dispute resolution.
- *[Specific retention periods to be finalized during legal review — see
  `docs/legal/legal-requirements.md`.]*

## 7. Your rights

Subject to applicable law, you have the right to:
- Access the personal information we hold about you.
- Request correction of inaccurate information.
- Request deletion of your information, subject to legal/financial record-keeping requirements
  that may require us to retain certain records for a defined period.
- Withdraw consent for optional processing (e.g., AI feature usage) where applicable.

To exercise these rights, contact us at *[contact email to be added]*.

## 8. Nigerian data protection law

Matriq is built for use by students in Nigeria and intends to comply with the Nigeria Data
Protection Act 2023 and applicable NDPC regulations. **The specific compliance steps required
(including whether a Data Protection Officer must be appointed, and what registration or filing
obligations apply) have not yet been legally verified** — see
`docs/legal/legal-requirements.md`.

## 9. Children's privacy

Matriq is intended for university-level students. It is not directed at children under the age
required for independent legal consent in Nigeria. *[Age threshold to be confirmed during legal
review.]*

## 10. Changes to this policy

When this policy changes in a material way, we will update the "Last Updated" date and,
where appropriate, notify users in-app before the changes take effect.

## 11. Contact

*[Contact information to be added once finalized.]*
