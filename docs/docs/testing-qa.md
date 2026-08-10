# Testing & QA

## Automated testing (backend)

- **Unit tests** for business logic — especially anything touching money (fee amount handling,
  payment status transitions), RBAC checks, and the onboarding fork logic
  (`docs/onboarding-flows.md`).
- **Integration tests** against a real (test) database for every endpoint in
  `docs/backend-api.md` — at minimum: correct role can access, incorrect role is rejected,
  unauthenticated is rejected.
- **Webhook tests** specifically for the Paystack integration — including a test for an invalid
  signature being rejected, and a test for the idempotent-replay case (same event delivered
  twice shouldn't double-process).
- Target meaningful coverage on anything in `security.md`'s [P0] list before Phase 1 is called
  done — coverage percentage as a vanity metric matters less than "every RBAC boundary and every
  payment state transition has a test."

## Automated testing (mobile)

- Component/unit tests for form validation logic (the Fresher vs Staylite forms have real
  validation rules worth testing directly, not just eyeballing).
- At least a smoke-level E2E test (Detox or Maestro) covering: register → view dashboard → view
  fee details, on both iOS and Android simulators, in CI.

## Manual QA — before every release, not just at the end

This stays manual on purpose; CI catches regressions, but "does this actually feel right on a
real phone" doesn't automate well.

**Device matrix (minimum):**
- Your own Android phone (real device, not just an emulator).
- iOS via TestFlight on at least one real device before wider distribution — simulator-only
  iOS testing misses real-world things like keyboard behavior, notification permissions, and
  actual network conditions.

**Checklist per release (mirrors the prototype's screen set):**
- [ ] Fresh install, Staylite registration completes end to end.
- [ ] Fresh install, Fresher registration completes end to end, JAMB number displays correctly
      everywhere a matric number normally would.
- [ ] A real (test-mode) Paystack payment completes, receipt appears, share card renders and
      actually shares via the OS share sheet.
- [ ] Light mode and dark mode both readable on every screen touched by this release — the web
      prototype had a real contrast bug here once already; don't reintroduce it in the native
      port.
- [ ] AI Companion returns a grounded answer for a query matching real ingested content, and a
      reasonable fallback for a query with no relevant retrieved content.
- [ ] Announcements read-receipt count updates correctly on the association side.
- [ ] Offline behavior: airplane mode doesn't crash the app; cached screens show something
      sensible.
- [ ] Push notification for a completed payment arrives (test-mode transaction) while the app is
      backgrounded.

## Security-specific testing

- Automated dependency/container scanning is covered in `docs/ci-cd.md` — but before Phase 8,
  do at least one manual pass specifically trying to break RBAC boundaries by hand (log in as a
  student, try to hit an executive-only endpoint directly with a captured token, confirm it's
  rejected) rather than trusting that tests alone caught every case.
- If budget allows, a lightweight external security review or automated scanning tool (e.g.
  OWASP ZAP against staging) before Phase 9.

## Load/performance testing

- Not a Phase 1 priority, but before Phase 9: a basic load test against the payment-initiation
  and AI-query endpoints specifically — these are the two most resource-sensitive paths (real
  money and a self-hosted model respectively), and the two most likely to behave badly under
  concurrent load if untested.
