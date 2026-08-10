# Payment Integration

## Gateway: Paystack (recommended)

Supports Nigerian cards, bank transfer, and USSD — matching the payment methods the prototype
already simulated. Flutterwave is a valid alternative with similar integration shape; the rules
below apply to either.

## The one rule that matters most

**The client never tells the server a payment succeeded. The server only trusts:**
1. A verified webhook from Paystack, with signature checked, or
2. A server-initiated verification call to Paystack's API using the transaction reference,
   matching what the client returned.

The prototype's simulated flow ("processing... success!") was a UI simulation for a demo. A real
integration must never flip `payments.status` to `success` based on what the mobile app reports
after the checkout screen closes — that's trivially forgeable by anyone who decompiles the app or
intercepts the traffic. See `security.md`.

## Flow

1. Mobile app calls `POST /v1/payments/initiate` with `fee_id`.
2. Backend creates a `payments` row with `status = pending`, calls Paystack to create a
   transaction, returns Paystack's `authorization_url` (or uses Paystack's mobile SDK flow —
   decide based on Expo compatibility in Phase 3) to the app.
3. Student completes checkout in Paystack's hosted UI (card/transfer/USSD) — **card and bank
   details never pass through your backend or app code.**
4. Paystack sends a webhook to `POST /v1/payments/webhook/paystack`.
5. Backend verifies the webhook signature (Paystack provides an HMAC signature header — check it
   against your webhook secret before trusting the payload at all).
6. Backend independently calls Paystack's "verify transaction" API using the reference from the
   webhook, as a second confirmation — don't trust the webhook payload's amount/status fields
   alone, verify.
7. Only after both checks pass: update `payments.status = successful`, generate the `receipts` row,
   update gamification fields (`rank_at_payment`), trigger the "notify association" and
   "WhatsApp copy to treasury" flows.
8. Mobile app polls or receives a push notification for the updated payment status — it does not
   independently decide the payment succeeded from anything client-side.

## Idempotency

- `POST /v1/payments/initiate` accepts an idempotency key from the client, so a retried tap
  (bad network) doesn't create two `pending` payments for the same fee.
- The webhook handler is itself idempotent — Paystack may retry webhook delivery; processing the
  same event twice must not double-count revenue or issue two receipts.

## Payment state machine

Per `production-directive.md` §17, transaction states are explicit, not implicit:

```
pending ──► processing ──► successful
   │                          │
   └──► failed                ├──► refunded
                               └──► disputed
   │
   └──► cancelled  (student abandons checkout before completion)
```

- `pending` — created on `POST /v1/payments/initiate`, before the student reaches Paystack's
  checkout.
- `processing` — Paystack has acknowledged the transaction attempt; set on receiving Paystack's
  own "processing"-equivalent event, if their API distinguishes this from a terminal state.
- `successful` — set only per the webhook + independent verification flow above. Never set
  directly from a client call.
- `failed` — the gateway reports the transaction did not complete (declined, insufficient funds,
  etc.), via webhook.
- `cancelled` — the student closed/abandoned the checkout flow before completion. Distinguish
  this from `failed` in the UI (`design-system.md`'s error-state requirement applies — "you
  cancelled" and "your card was declined" call for different messaging and different recovery
  actions).
- `refunded` — set via an explicit refund action (association or admin initiated, or in response
  to a Paystack-side refund event), never automatically inferred. Requires `refunded_at` and
  `refund_reason` to be set in the same transaction.
- `disputed` — set when Paystack reports a chargeback/dispute event via webhook. This state
  should trigger an alert (`docs/infrastructure.md`'s monitoring) — a dispute is both a financial
  and a trust event worth a human noticing promptly, not just a silent status change.

Only `successful` payments generate a `receipts` row and count toward gamification stats
(rank, leaderboard). A `refunded` payment that already generated a receipt should mark that
receipt invalidated (add a `receipts.invalidated_at` field when this is implemented) rather than
deleting the record — the historical fact that a receipt was once issued matters for audit
purposes even after a refund.

## Reconciliation job

A scheduled background job (via the Redis/BullMQ queue) that periodically checks any `payments`
row stuck in `pending`/`processing` for too long against Paystack's API directly — catches the
case where a webhook was missed entirely (network issues, Paystack outage) so payments don't
silently get lost from the student's perspective.

## QR receipt payload

The prototype generated a visually QR-like pattern seeded from the receipt text — fine for a
demo, not fine for production, since anyone could recreate a fake-but-plausible-looking QR. For
real use:
- The QR payload should be a **signed token** (e.g., the receipt ID + payment ID + a server-side
  HMAC signature), not just a display string.
- The Association Dashboard's "verify receipt" scan calls the backend to validate the signature
  and check the payment's real status — it does not just parse and trust whatever's encoded in
  the QR visually.

## Money handling rules

- Store all amounts as integers in minor units (kobo), never floats — see `data-model.md`.
- Never compute a fee amount client-side and send it to the server; the server looks up the fee
  by `fee_id` and uses its own stored amount.
- Currency is explicit on every amount field, even though it's `NGN` everywhere today — don't
  hardcode the assumption in a way that's painful to change later.

## What stays out of scope for v1 (matching the prototype's deliberate exclusions)

Course Registration Assistance, Merchandise, Event Tickets, and Past Questions/Handouts requests
remain **WhatsApp hand-offs**, not in-app checkout — exactly as designed in the prototype. Only
association dues move through the real payment gateway in v1. Expanding other services into
in-app payment is a deliberate future phase, not an accidental scope creep.
