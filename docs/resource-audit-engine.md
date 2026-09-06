# Resource Audit Engine — Architecture (Part 1)

The engine turns a raw student upload into an audited, human-approved,
published library resource — through a strict, observable state machine.

**Design rule:** modular and channel-agnostic. Telegram does not exist yet in
the codebase, and nothing here depends on it. The engine exposes service
methods + REST endpoints that *any* channel calls: the Matriq app today, the
website, admin tools, and the future Telegram bot.

```
                    ┌──────────────┐   ┌────────────┐   ┌──────────────┐
 Matriq app ───────▶│              │   │            │   │              │
 Website ──────────▶│  Resource    │──▶│  Pipeline  │──▶│  Human       │
 Admin tools ──────▶│  Audit API   │   │  (stages)  │   │  review      │
 Telegram (future)─▶│              │   │            │   │  (admins)    │
                    └──────┬───────┘   └─────┬──────┘   └──────┬───────┘
                           │                 │                 │
                           ▼                 ▼                 ▼
                    ┌──────────────────────────────────────────────────┐
                    │ Existing infrastructure (reused, not replaced):   │
                    │  Prisma (Postgres) · StorageService (MinIO/S3)   │
                    │  ToolsService OCR (Tesseract) · Vault/library    │
                    │  JwtAuthGuard + AdminGuard · Throttler + helmet  │
                    └──────────────────────────────────────────────────┘
```

## Module map (`backend/src/resource-audit/`)

| File | Responsibility |
|---|---|
| `resource-audit.state-machine.ts` | Pure transition table. The single authority on lifecycle legality. No I/O, fully unit-testable. |
| `resource-audit.config.ts` | Env-driven limits (file size, MIME allow-list, rate window, retry budget, rights version) + magic-byte sniffing. |
| `resource-audit.storage.ts` | Storage seam. Preserves the ORIGINAL bytes immutably under `resource-audit/{submissionId}/original-{name}`; every stage re-reads the original — that's what makes retries idempotent. Falls back to data-URIs only when object storage is disabled (dev). |
| `resource-audit.scorer.ts` | Advisory scorer behind the `AUDIT_SCORER` port. Part 1 ships `RuleBasedScorer` (deterministic, explainable). Swap in a model-backed provider later by registering a different provider for the token — nothing else changes. |
| `resource-audit.service.ts` | Submit / status / review / retry APIs, authorization, per-student rate limiting, structured logging, the pipeline loop, and publication into the existing Vault. |
| `resource-audit.controller.ts` | REST surface (below). |
| `dto/submit-resource.dto.ts` | class-validator contracts. `source` is never client-supplied. |

## State machine

```
received ─▶ validating ─▶ duplicate_check ─▶ extracting ─┬─▶ ocr_processing ─┐
                                                         └─▶ auditing ───────┤
                                                                               │
        auditing ─▶ pending_human_review ─┬─▶ approved ─▶ reward_pending ─▶ reward_eligible ─┐
                                          │                └─▶ reward_ineligible ────────────┤
                                          ├─▶ needs_information ─ (resubmits) ─▶ pending_human_review
                                          └─▶ rejected (terminal)
                                                                             reward_* ─▶ processing_library ─▶ published (terminal)
        any processing stage ─▶ failed (terminal; admin reopen only)
```

Invalid transitions are impossible to persist: every automated write goes
through `stageTransition()` (asserts legality + guards on the current status
in the SQL `WHERE`), and every human decision is only accepted from
`pending_human_review` with the same guarded write. Two concurrent workers
cannot double-advance a row — the second write matches zero rows.

## API surface

Student (JWT required, Throttled 10/min transport + 10/hour per student):

| Method | Path | Purpose |
|---|---|---|
| POST | `/resource-audit/submissions` | multipart submit (`file` + `SubmitResourceDto`) |
| GET | `/resource-audit/submissions/:id` | poll audit status (owner or admin) |
| GET | `/resource-audit/me/submissions` | the student's own submissions |

Admin (JWT + AdminGuard):

| Method | Path | Purpose |
|---|---|---|
| GET | `/resource-audit/admin/review-queue?status=` | review queue (default: pending_human_review) |
| PATCH | `/resource-audit/admin/submissions/:id/decide` | approved / rejected / needs_information (+reason) |
| POST | `/resource-audit/admin/submissions/:id/retry` | reopen a failed submission |

Every response is a public projection: `extractedText`, `storageRef`,
`fileHash` and reviewer internals never leave the server.

## Pipeline properties

- **Idempotent:** every stage re-derives its result from the preserved
  original. Re-running extracting/auditing/publishing produces the same
  outcome; publication is guarded by `publishedVaultItemId` + status checks.
- **Retryable:** failures increment `attemptCount` (budget: 3 by default,
  `RESOURCE_AUDIT_MAX_STAGE_ATTEMPTS`) with exponential backoff; exhaustion
  marks the row `failed` with `failureReason` = the failing stage. Admin
  retry reopens from `received` and the pipeline re-enters mid-way.
- **Observable:** every log line is a single JSON object carrying `stage`,
  `submissionId`, `studentId`, `msg` — trace the whole journey with
  `grep "<submissionId>"`.
- **Safe by default:** magic-byte sniffing (extension never trusted),
  filename sanitization in storage keys, size/MIME limits, rights
  declaration versioning, duplicate detection (exact hash + cross-submission
  clash → auto-reject), advisory-only AI (a human is the only authority).

## Configuration (env)

| Variable | Default | Meaning |
|---|---|---|
| `RESOURCE_AUDIT_MAX_FILE_BYTES` | 20971520 (20 MB) | upload cap |
| `RESOURCE_AUDIT_MIME_TYPES` | pdf, jpeg, png, webp | comma-separated allow-list |
| `RESOURCE_AUDIT_RATE_LIMIT` | 10 | submissions per student per window |
| `RESOURCE_AUDIT_RATE_WINDOW_SECONDS` | 3600 | window length |
| `RESOURCE_AUDIT_MAX_STAGE_ATTEMPTS` | 3 | retries before `failed` |
| `RESOURCE_AUDIT_MIN_EXTRACTED_CHARS` | 200 | scanned-doc threshold |
| `RESOURCE_AUDIT_RIGHTS_VERSION` | 1.0 | rights declaration version recorded |

## Where the future Telegram bot connects

The bot is **only a submission interface**. It must NOT reimplement any
pipeline logic. Three integration points, in order of preference:

1. **Same REST API (recommended).** The bot authenticates as the student
   (Telegram account linking → JWT via the existing auth service), then:
   - `POST /resource-audit/submissions` with the document bytes it received
     from Telegram, mapped to `SubmitResourceDto` (`source` is set
     server-side to `telegram` by the bot's auth context — add a
     `SubmissionSource.telegram`-issuing path in the controller, e.g. a
     bot-specific guard/decorator, **not** a client-sent field).
   - `GET /resource-audit/submissions/:id` to report status back into the
     chat. No new endpoints, no new states.
2. **Direct service call (in-process alternative).** If the bot runs inside
   the Nest app, import `ResourceAuditModule` (it's exported) and call
   `ResourceAuditService.submit({ ..., source: "telegram" })` directly from
   a bot command handler. The service signature is the stable contract.
3. **What must NOT change for Telegram:** the state machine, the storage
   seam, the scorer port, and the admin review flow are channel-agnostic —
   the bot adds zero branches to any of them. If a Telegram feature seems
   to require a new state or a pipeline branch, it belongs in the bot
   adapter, not the engine.

## What's deliberately out of scope (Part 2+)

- Reward ledger & payout mechanics (Part 1 marks approved submissions
  `reward_eligible`; `rewardStatus` is tracked independently of the pipeline
  state so Part 2 can decide rewards without re-moving states).
- Model-backed scoring via the `AUDIT_SCORER` port (register a provider that
  calls the existing AI services — `src/ai/` — through the same interface).
- Heavy OCR post-processing at the `ocr_processing` stage.
- Telegram adapter (above).
