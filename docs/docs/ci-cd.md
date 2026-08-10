# CI/CD

## Why this matters more than usual here

You're running a build agent over Termux/tmux, not sitting in an IDE watching it work. CI/CD is
what catches mistakes *before* they reach your phone or production — you won't be reviewing every
line in real time, so the pipeline has to be the safety net. Treat "CI is green" as a hard
requirement for merging, not a suggestion.

## Branching strategy

- `main` — production. Protected: no direct pushes, requires CI green + at least one review
  step (even if that review step is the agent re-reading its own diff against `security.md`
  before opening the PR — document that it did).
- `develop` — staging. Every feature branch merges here first.
- `feature/*` — all actual work happens here. Small, frequent commits (see
  `docs/agent-workflow.md` — this is also what makes the agent's work resumable across dropped
  sessions).

## Pipeline stages (GitHub Actions)

### On every PR (`feature/*` → `develop` or `develop` → `main`)
1. Lint (backend + mobile).
2. Type-check (TypeScript, both projects).
3. Unit + integration tests (backend).
4. Dependency vulnerability scan (`npm audit` / Dependabot alerts as a gate, not just a report).
5. Container image build (backend) — build only, not pushed yet, to catch Dockerfile breakage
   early.
6. Secret-scanning (e.g., gitleaks) over the diff — catches an accidentally committed key before
   it ever reaches a shared branch.

**Merge blocked if any of the above fail.** No exceptions, no "merge anyway" override without a
human explicitly approving it outside the normal flow.

### On merge to `develop`
1. All of the above, plus:
2. Backend Docker image built and pushed to Google Artifact Registry, tagged `staging-<sha>`.
3. Deploy to the staging environment on the GCP VM (SSH-triggered `docker compose pull && up`,
   or a lightweight deploy script — doesn't need to be fancy for a single-VM setup).
4. Mobile: EAS Build triggered for an internal/staging build profile (not submitted to app
   stores at this stage) — this is what produces something installable for you to test on your
   phone quickly, before it's anywhere near production.

### On merge to `main` (production release)
1. All PR checks, plus:
2. **Manual approval gate** — a human explicitly approves the production deploy. This is not
   automatic even if staging looks fine.
3. Backend image tagged `production-<sha>`, deployed to production via the same deploy mechanism
   as staging, pointed at production environment variables/secrets.
4. Mobile: EAS Build with production profile, then EAS Submit to TestFlight (iOS) and Play
   Console Internal Testing (Android) — see `docs/release-distribution.md`.
5. Database migrations run as an explicit, reviewed step — never auto-applied silently as part
   of a generic deploy script. A migration that locks a table or drops a column needs eyes on it
   first.

## Rollback

- Backend: redeploying the previous image tag is the rollback mechanism — keep at least the
  last 5 production image tags available in Artifact Registry, don't prune aggressively.
- Database: migrations should be written to be reversible where practical; where they can't be
  (e.g., a destructive column drop), that migration ships in its own PR, reviewed with extra
  care, and only after the data it depends on has been backed up (`security.md`).
- Mobile: you cannot "roll back" an app store release the way you can a backend deploy — a bad
  mobile release means shipping a fixed version forward. This is exactly why staging + your own
  phone testing (Phase 2 onward, not saved for Phase 8) matters so much for mobile changes
  specifically.

## Secrets in CI

- Stored in GitHub Actions' encrypted secrets store, referenced by name in workflows — never
  hardcoded, never echoed to logs (mask them explicitly if a step might otherwise print them).
- Staging and production use **different** secrets entirely (different Paystack keys — test mode
  for staging, live for production; different JWT signing keys; different database).

## What CI does not replace

CI catches what's automatable. It does not replace you actually opening the app on your phone
before a release goes to real students — `docs/testing-qa.md` covers the manual pass that stays
manual on purpose.
