# Matriq — Build Documentation Set

This is the source of truth for turning the Matriq HTML prototype into a real, production-grade
mobile application (iOS + Android) with a self-hosted AI study companion, backed by a secure
backend and a real CI/CD pipeline.

**This documentation is written to be read by an autonomous coding agent as well as by humans.**
If you are the agent: read `production-directive.md` first, then `agenda.md` and
`docs/agent-workflow.md`, before writing any code. Re-read `docs/progress-log.md` at the start
of every session to know exactly where the last session left off.

## Reading order

1. **`production-directive.md`** — the highest-authority document in this project. Standards,
   anti-patterns, and non-negotiables that govern everything else. If anything else in this doc
   set conflicts with it, it wins.
2. `agenda.md` — the roadmap, phases, and definition of done.
3. `security.md` — non-negotiable security requirements. Not a "do it later" checklist —
   several of these decisions (password hashing, secrets management, RBAC model) have to be made
   correctly from Phase 0 or they are expensive to retrofit.
4. `docs/agent-workflow.md` — the rules the agent operates under (git discipline, when to stop
   and ask a human, how to survive a dropped tmux/SSH session).
5. Everything else in `docs/`, as needed per phase.

## Full index

| File | Purpose |
|---|---|
| `production-directive.md` | **Governing standard** — anti-vibe-code rules, functionality/UX/testing bar, legal requirements, agent behavior |
| `agenda.md` | Roadmap, phases, priorities, definition of done |
| `security.md` | Security requirements — prioritized, not optional |
| `docs/architecture.md` | System architecture, how the pieces fit together |
| `docs/tech-stack.md` | Technology choices and *why*, including a hard constraint you must read |
| `docs/design-system.md` | Component/state/accessibility standard required before building screens |
| `docs/ai-model.md` | The self-hosted AI study companion — realistic scope for "learns as it goes" |
| `docs/data-model.md` | Database schema |
| `docs/backend-api.md` | API surface, auth model, endpoint list |
| `docs/payment-integration.md` | Real payment gateway integration, full transaction state machine |
| `docs/mobile-app.md` | Mobile app requirements, screen-by-screen |
| `docs/onboarding-flows.md` | The Staylite vs Fresher registration flows, exactly |
| `docs/infrastructure.md` | GCP server layout, Docker services, the tmux/Termux workflow |
| `docs/ci-cd.md` | Pipelines, environments, release process |
| `docs/release-distribution.md` | How you actually get this onto your phone |
| `docs/testing-qa.md` | Test strategy and device matrix |
| `docs/compliance-privacy.md` | NDPR, PCI scope — engineering-facing privacy overview |
| `docs/legal/` | Privacy Policy, Terms & Conditions, data processing record, legal gap-analysis — **all drafts, unreviewed, see the folder's own warnings** |
| `docs/agent-skills.md` | Skills to build so the agent's output matches this project's decisions, not generic defaults |
| `docs/mcp-integrations.md` | MCP servers to connect, and the guardrails that apply to each |
| `docs/agent-workflow.md` | Operating rules for the coding agent |
| `docs/progress-log.md` | Living log — the agent updates this every session |

## `docs/legal/` — read the warning before touching these

`privacy-policy.md`, `terms-and-conditions.md`, `data-processing.md`, and
`legal-requirements.md` are **drafts**, written to give the product a structurally complete
starting point. Per `production-directive.md` §15, they must not be presented to real users or
described as final until reviewed by a qualified lawyer familiar with Nigerian data protection
law. `legal-requirements.md` specifically tracks what still needs that review — it's a checklist
of open questions, not a policy document.

## Ready-to-use Skills

`claude-skills/` contains three complete `SKILL.md` files, ready to copy into `.claude/skills/`
in your repo: `matriq-brand-identity`, `matriq-rbac-patterns`, and `matriq-payment-safety`. See
`docs/agent-skills.md` for what these do and what to build next.

## One thing to know before you read further

Three of your stated requirements have real technical constraints that change *how* they get
built. They're all solvable — but only if solved the right way from the start:

- **"iOS app, no Mac"** — your GCP box is Linux. Linux cannot compile an iOS `.ipa`. This is not
  a limitation you work around later; it determines the mobile framework choice on day one.
  See `docs/tech-stack.md`.
- **"Local model that learns as it goes"** — true continuous on-device learning is not something
  anyone runs in production, for good reasons. There's a version of this that's genuinely
  buildable and still meets your goal (no third-party AI API, full control, improves from your
  students' materials). See `docs/ai-model.md` for the honest version.
- **"Maximum security"** — this has to be a Phase 0 decision (auth model, secrets, RBAC), not a
  Phase 8 hardening pass. See `security.md`.

Nothing below assumes you'll compromise on what you actually want. It's written so the agent
building this doesn't quietly build something that can't ship.
