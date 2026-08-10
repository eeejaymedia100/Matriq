---
name: matriq-payment-safety
description: Use whenever writing or modifying any code that touches payment initiation, the Paystack webhook, payment status, or receipt generation. This is the highest-consequence code path in the app — money and trust both depend on it being correct every time, not just on the happy path.
---

# Matriq Payment Safety

## The rule that overrides convenience every time

**The client never sets `payments.status = 'success'`. Only two things can:**
1. A signature-verified Paystack webhook, cross-checked against
2. A server-initiated call to Paystack's own "verify transaction" endpoint, confirming the
   webhook's claim independently.

If you're writing code where the mobile app reports a payment outcome and the backend trusts it
directly, stop — that's not a shortcut, it's a forgeable payment bypass. Rewrite it through the
webhook + verify pattern even if it's slower to build.

## Checklist for any payment-adjacent change

- [ ] Money amounts are integers in minor units (kobo) everywhere in this change — no floats.
- [ ] The fee amount is looked up server-side by `fee_id`, never accepted from the client.
- [ ] Webhook handler verifies Paystack's HMAC signature before parsing the payload as trusted.
- [ ] Webhook handler is idempotent — processing the same event twice (Paystack retries
      delivery) does not double-issue a receipt or double-count revenue. Check for an existing
      `payments` row in the target state before applying the transition.
- [ ] `POST /v1/payments/initiate` accepts and respects an idempotency key from the client.
- [ ] Receipt QR payloads are signed (HMAC or equivalent), not just a display string that looks
      like a QR — verification must check the signature server-side, never just decode-and-trust
      whatever the QR visually encodes.
- [ ] A new or modified endpoint here has both a "happy path succeeds" test and a "forged/invalid
      signature is rejected" test — the second one is the one that's easy to skip and matters
      more.
- [ ] If this change touches the reconciliation job (`payment-integration.md`), confirm it still
      correctly finds stuck `pending`/`processing` payments without falsely flagging legitimately
      in-flight ones.

## What "done" looks like for a payment feature

Not "the happy path works in manual testing." It's: webhook signature rejection is tested,
duplicate webhook delivery is tested, and a human has confirmed the flow against
`payment-integration.md` before it merges to `main`. Payments are the one area of this project
where "looks like it works" and "is actually safe" are the furthest apart — treat every shortcut
here as a real risk, not a minor one.

## Escalate, don't improvise

Per `security.md` and `agent-workflow.md`: switching Paystack from test keys to live keys is a
human decision, not something to do as part of routine feature work. If a task seems to require
it, stop and ask.
