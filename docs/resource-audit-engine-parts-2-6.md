# Resource Audit Engine — Parts 2–6

Builds on the Part 1 foundation (`resource-audit-engine.md`). The rules are unchanged:
**AI assists, deterministic checks protect, a human approves every document.**

## Pipeline (full)

```
received → validating → duplicate_check → extracting → [ocr_processing]
    → auditing ─┬─→ pending_human_review ── approve ──→ reward_pending
                │       (V1: EVERYTHING goes here)          ├─ eligible   → processing_library → published
                │                                           └─ ineligible → processing_library → published
                ├─ (validation verdict "bad") → rejected
                └─ (exact duplicate of pending/published) → pending_human_review (duplicate_candidate)
```

## Part 2 — Deterministic validation (`resource-audit.validation.ts`)

Runs **before** any AI spend on the preserved original bytes. Pure functions, env-tunable
thresholds (`RESOURCE_AUDIT_THRESHOLD_*`), idempotent on retry:

- Structural: extension gate → magic-byte sniff → PDF parse / image decode → encryption →
  empty/effectively-empty detection. `verdict: "bad"` ends the pipeline (rejected, reviewer can reopen).
- Quality (`QualityMetrics`): page count, blank-page ratio, text density (chars/page),
  repeated-page ratio, unreadable-page ratio → `suspiciouslyPadded`, `screenshotHeavy`, `junkVerdict`.
  **Few pages is never a rejection reason** — a two-page course outline is legitimate; only
  *padding patterns* and density collapse flag junk.
- `sha256` at intake (duplicate key) and `textFingerprint` (word 5-shingles) for near-duplicates.

## Part 2 — Near-duplicates (`resource-audit.duplicates.ts`)

Exact-hash match against pending/published (90-day window) → **duplicate_candidate**
(no AI call, no reward). Otherwise Jaccard similarity over text shingles:
≥ 0.92 auto-flags `duplicateOfId`, 0.75–0.92 recorded for the reviewer. Uncertain cases
are **flagged, never auto-rejected**.

## Part 3 — AI auditor (`resource-audit.ai-auditor.ts`)

`ResourceAiAuditor` port with two adapters:

- `DeepSeekAuditor` — strict JSON-schema structured output (`RESOURCE_AUDIT_AI_KEY` to enable).
- `RuleBasedAuditor` — deterministic fallback, same schema, zero cost; used when no key is
  configured or the provider fails.

Output (`StructuredAudit`): document type, detected metadata, 8 scores (academic relevance,
readability, completeness, metadata match, duplicate probability, copyright/suspicious/abuse risk),
contradictions (e.g. declared CSC 201 but document shows MTH 201), confidence, risk level
(GREEN/YELLOW/RED), reasons, recommendation (`approve | reject | review`) — **advisory forever**.
Provider/model persist to `ai_provider`/`ai_model` on every audit.

## Part 4 — Human review console

Backend: `GET admin/review-queue` (filters: status, risk, AI recommendation, institution,
course, material type), `GET admin/submissions/:id/review` (everything on one screen),
`GET admin/submissions/:id/file` (streams the preserved original; students can never fetch it),
`PATCH …/decide | …/reopen | …/notes`, `POST …/retry`.

UI: `admin/src/app/resource-audit/page.tsx` — queue with risk dots + AI chips, review screen
with document preview, validation chips, quality stats, score bars, contradictions block,
private reviewer notes, and Approve / Needs-info / Reject (reason required to reject).
YELLOW/RED are visually highlighted; nothing auto-publishes.

## Part 5 — Rewards & anti-abuse (`resource-audit.rewards.ts`)

Ledger: `ResourceContribution` (unique per submission — duplicate rewards structurally impossible)
and `ResourceReward` (unique per student+campaign+tier). Only **approved** submissions are
evaluated; duplicates, rejected, junk and abuse-scored ≥ cutoff (default 40) never earn points.
Campaign rules via `RESOURCE_AUDIT_CAMPAIGN_CONFIG` (tiers, points, active flag) — nothing hardcoded.
States: pending → eligible → processing → paid (manual airtime/bank-transfer with required
payout reference) | rejected | disputed. Leaderboard ranks **qualified points**, never raw uploads.

UI: `admin/src/app/resource-rewards/page.tsx` — campaign summary, ledger with payout actions, leaderboard.

## Part 6 — Library processing & observability

Publish reuses the **existing Vault**: clean metadata prefers the auditor's detected
title over the filename; original file stays linked via `storageRef` + `contentHash`.
Without a live association membership the submission waits honestly in its reward state
(never stuck in `processing_library`). Cover generation is a provider port
(`resource-audit.cover.ts`) invoked **only** after approval. `GET admin/metrics` reports
AI-vs-human agreement overall, per risk level, and per provider/model — the labelled
decision corpus for future evaluation; no auto-training in V1.

## E2E guarantee

`resource-audit.e2e.spec.ts` walks intake → validation → duplicates → audit → human approve →
reward → publish, and asserts: rejected never publishes, unapproved never earns rewards,
duplicates never double-reward, retries never duplicate records, strangers can't read private
submissions.

## Telegram

Unchanged and automatic: the bot calls `submit()` and `decide()`; every Part 2–6 behavior
(deep validation, near-duplicates, AI audit, V1 human-only approval, reward ledger) applies
to `source: telegram` submissions with zero channel-specific code.
