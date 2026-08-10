# Agent Skills

## What this is, and why it matters for "creativity"

A generic coding agent defaults to generic output — safe, boilerplate patterns it's seen a
million times. Skills are how you give it *this project's* taste and hard-won decisions as
reusable instructions it reaches for automatically, instead of re-deriving (or drifting from)
them every session. That's what actually makes output feel less generic: not "be more creative"
as a vibe, but "here is exactly what good looks like for this specific thing, every time."

Three skills below are provided in full, ready to use (`claude-skills/` in this doc set — copy
each folder into `.claude/skills/` in your repo). The rest are specified in enough detail for the
agent to write them itself as Phase 0/1 work.

## How Claude Code discovers skills

Skills live at `.claude/skills/<skill-name>/SKILL.md` in the repo (or `~/.claude/skills/` for
ones that should apply across projects, but for Matriq-specific skills, keep them in-repo so
they're versioned alongside the code they govern). Each `SKILL.md` starts with frontmatter
(`name`, `description`) — the `description` is what determines whether the agent reaches for it,
so write it the way you'd write a trigger condition, not just a label.

## Included, ready to use

### `matriq-brand-identity`
Encodes the visual language (dark/light theme tokens, the `on-accent`/`on-success` contrast
pattern, typography, tone of voice) so every screen — mobile app, any future marketing surface —
stays visually and verbally consistent with what was already designed and tested in the
prototype, instead of the agent inventing new colors or a different voice each time it builds a
new screen. See `claude-skills/matriq-brand-identity/SKILL.md`.

### `matriq-rbac-patterns`
The exact NestJS guard/decorator pattern for enforcing the five roles
(Student/Treasurer/President/P.R.O./Admin) on every endpoint, so RBAC enforcement is
copy-consistent rather than each endpoint reinventing its own auth check — this is precisely the
failure mode `tech-stack.md` flags as the reason NestJS was chosen in the first place. See
`claude-skills/matriq-rbac-patterns/SKILL.md`.

### `matriq-payment-safety`
The Paystack integration rules from `payment-integration.md` turned into an operational
checklist the agent runs through every time it touches payment code — webhook signature
verification, idempotency, never trusting client-reported status. See
`claude-skills/matriq-payment-safety/SKILL.md`.

## Specified, build these next (Phase 0/1)

### `matriq-screen-porting`
**Trigger:** porting any screen from the original HTML prototype into React Native.
**Should contain:** the mapping between the prototype's CSS custom properties and the mobile
theme token names; a reminder to preserve exact copy/microcopy (the humor and tone in the
prototype's text was deliberate, not filler); a reminder that prototype screens used simulated
data and every port must wire to the real endpoint in `backend-api.md` instead of leaving mock
state behind.

### `matriq-security-gate`
**Trigger:** before opening any PR.
**Should contain:** a condensed, checkable version of `security.md`'s [P0] items as a literal
checklist (auth present? RBAC enforced server-side, not just hidden in UI? input validated?
secrets not touched? rate limits present on new endpoints?) — the agent runs this against its own
diff before requesting CI, catching what a human reviewer would catch, before it costs a CI
cycle.

### `matriq-rag-ingestion`
**Trigger:** any work on the AI Study Companion's ingestion pipeline.
**Should contain:** the chunking strategy, moderation-gate requirement, and source-attribution
rules from `ai-model.md`, plus the specific prompt template used to combine retrieved context
with a student's query — keeping this as a skill (rather than scattered inline in code comments)
means prompt-template changes are made deliberately in one place, not drifted across call sites.

### `matriq-progress-log-writer`
**Trigger:** end of every agent session.
**Should contain:** the exact entry format from `progress-log.md`, plus a reminder of what makes
an entry actually useful (skimmable, blockers surfaced early, specific enough to resume from
cold) rather than a vague "made progress" line.

## A note on scope

Skills encode *how* to do something well within decisions already made elsewhere in this doc
set. They are not the place to make new architecture or security decisions — if writing a skill
surfaces a gap those docs didn't cover, update the relevant doc (`security.md`,
`data-model.md`, etc.) first, then reflect it in the skill, not the other way around.
