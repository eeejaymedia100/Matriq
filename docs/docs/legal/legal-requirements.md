# Legal Requirements — Gap Analysis

This document is different from the other three files in `docs/legal/`: it is not a draft of a
user-facing document. It's a working list of legal questions this project has surfaced that
**require a qualified lawyer, not an engineering decision.** Its job is to make sure those
questions are asked, tracked, and answered before launch — not to answer them.

Per `production-directive.md` Section 15: nothing below should be treated as legal advice, and
nothing in `privacy-policy.md` or `terms-and-conditions.md` should be presented to users as
final until every item here relevant to it is resolved.

## Nigeria Data Protection Act 2023 (NDPA) — items to confirm with counsel

- [ ] Does Matriq, as a "data controller" or "data processor" under the NDPA, meet the threshold
      requiring registration with the Nigeria Data Protection Commission (NDPC)? This likely
      depends on user volume and data sensitivity — confirm the actual threshold and whether
      Matriq crosses it, and at what point in growth it might.
- [ ] Is a Data Protection Officer (DPO) required to be formally appointed, and if so, what are
      the qualifications/responsibilities under NDPA specifically (not GDPR, which has a similar
      but not identical concept)?
- [ ] What are the NDPA's specific breach notification timelines and mechanisms, and is
      `security.md`'s incident response section adequate to meet them?
- [ ] What are NDPA's rules (if any specific to Nigeria, beyond general good practice) on cross-
      border data transfer — relevant since the GCP infrastructure may involve data processing
      outside Nigeria depending on region selection (`docs/infrastructure.md`).
- [ ] Confirm the correct lawful basis language for each processing activity in
      `docs/legal/data-processing.md` under NDPA's specific framework (its lawful-basis
      categories may not map 1:1 onto GDPR's, which is what the draft currently assumes loosely).

## Payments and financial regulation

- [ ] Confirm whether any Central Bank of Nigeria (CBN) regulations apply to Matriq specifically
      (as a facilitator using a licensed payment processor, rather than as a payment service
      provider itself) — the expectation is that using Paystack as a licensed processor keeps
      Matriq outside most direct CBN obligations, but this should be confirmed, not assumed.
- [ ] Confirm financial record-keeping retention periods that apply to `payments` and `receipts`
      data specifically (this determines the real answer to several `[to confirm]` items in
      `data-processing.md`).
- [ ] Confirm whether association dues collected through Matriq have any implications under
      Nigerian tax or financial reporting law that the platform itself needs to account for
      (versus being purely the association's own obligation).

## Minors and age of consent

- [ ] Confirm the applicable age threshold for independent data-processing consent in Nigeria,
      and whether it's realistic that Fresher registrants (newly admitted students) could be
      below it — if so, what additional consent mechanism (parental/guardian) might be required.

## Consumer protection / platform liability

- [ ] Confirm what liability limitation language is actually enforceable under Nigerian contract
      law for a platform in Matriq's position — the placeholder in `terms-and-conditions.md`
      Section 12 was deliberately left blank rather than filled with generic boilerplate, exactly
      because this needs real drafting, not a template.
- [ ] Confirm the appropriate governing law and dispute resolution clause for
      `terms-and-conditions.md` Section 13.

## AI-specific considerations

- [ ] Confirm whether any Nigerian regulation specifically addresses AI-generated content
      provided to users (this is a newer and less settled area globally) — at minimum, ensure
      `terms-and-conditions.md` Section 7's disclaimer language is adequate.
- [ ] Confirm the IP license language in `terms-and-conditions.md` Section 9 for
      user-submitted study materials is appropriately scoped and enforceable.

## Institutional relationships

- [ ] If Matriq ever formally partners with a university (DELSU or others) rather than operating
      as an independent platform students/associations opt into, that likely changes several of
      the above answers (data controller/processor relationships, liability allocation) —
      revisit this whole document if that relationship changes.

## How to use this document

Every `[to confirm]` item elsewhere in `docs/legal/` should trace back to a checkbox here.
When an item is resolved by actual legal review, update it here with the answer and a reference
to where that answer is now reflected in `privacy-policy.md`, `terms-and-conditions.md`, or
`data-processing.md` — check the box, don't just delete the row, so there's a record that it was
actually addressed rather than quietly dropped.
