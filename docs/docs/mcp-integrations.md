# MCP Server Integrations

## What these are for

Skills (`docs/agent-skills.md`) shape *how* the agent works. MCP servers extend *what it can
actually reach* — real tools instead of the agent guessing at file paths, hallucinating library
APIs, or you manually running commands it could run itself. Connect these deliberately, in
roughly this priority order, and apply the same guardrails from `security.md`'s agent-specific
section to every one of them — an MCP that can write to GitHub or your database is exactly as
sensitive as giving the agent shell access, because functionally it is that.

## High priority — connect during Phase 0

### GitHub MCP
Lets the agent create branches, open PRs, check CI status, and read issues directly, instead of
you relaying that information manually over Termux.
```
claude mcp add github
```
**Guardrail:** grant a token scoped to this one repo, not your whole GitHub account. The agent
should open PRs, not merge them to `main` itself — branch protection (`ci-cd.md`) is what
actually enforces this even if the token technically could.

### Context7 (or equivalent up-to-date library docs MCP)
Fetches current documentation for the actual libraries in use (NestJS, Expo/React Native,
Paystack's API, pgvector, Ollama) at the version you're really on, instead of the agent
generating plausible-but-wrong API calls from stale training knowledge. This is one of the
highest-value connections for reducing exactly the kind of subtle bugs that come from a
framework's API having changed since the agent's training cutoff.
```
claude mcp add context7
```

### Postgres MCP
Direct, read-primary access to inspect schema, run queries, and sanity-check migrations against
real data shape — much faster feedback loop than round-tripping through application code to
check "did that migration actually do what I expected."
```
claude mcp add postgres --connection-string "$STAGING_DATABASE_URL"
```
**Guardrail:** connect this to **staging**, not production, by default. If a debugging session
genuinely needs read access to production data, that's a deliberate, temporary, human-approved
connection — not the default configuration this agent runs with day to day.

## Medium priority — connect once the relevant phase starts

### Playwright (or Puppeteer) MCP
Browser automation for testing any web-facing surface (an admin console, if one ends up being
web-based per `mobile-app.md`'s Phase 5 note) and for exercising the backend's HTTP API directly
during development.
```
claude mcp add playwright
```

### Sentry MCP (once error monitoring is set up per `infrastructure.md`)
Lets the agent pull real error reports and stack traces directly when debugging a production
issue, instead of you copy-pasting logs over Termux from a phone screen.

### Slack or Telegram MCP
Gives the agent a way to actually send the "flag blockers early" notifications
`agent-workflow.md` and `ci-cd.md` call for, rather than that only happening when you
happen to check the progress log. A simple webhook-based bot is enough — this doesn't need to be
elaborate.

## Optional / situational

### Figma MCP
Only relevant if design work moves into Figma at some point rather than staying
prototype-and-code-driven. Not needed to start.

### A custom GCP-ops MCP
If routine infrastructure checks (VM status, disk usage, container health) become frequent
enough that manually running `gcloud`/`docker` commands over Termux is a real drag, a small
custom MCP wrapping a **narrow, read-only** set of `gcloud`/`docker` status commands is
reasonable to build. **Do not build this with write/destructive capability** (restart services,
modify firewall rules, resize disks) without the exact same "ask a human first" guardrail
`agent-workflow.md` already applies to destructive actions generally — an MCP doesn't get an
exception from that rule just because it's a tool call instead of a shell command.

## What not to connect

- Anything granting write access to production infrastructure or production data as a default,
  always-on connection. Temporary, explicitly-approved access for a specific task is fine;
  standing write access is not.
- A generic "run arbitrary shell commands" MCP beyond what the agent's own environment already
  provides — this doesn't add capability, it just adds a second, less-visible way to do things
  the direct terminal access already covers, making it harder to audit what actually happened in
  a session.

## Setup note

Run `claude mcp list` at the start of a session to confirm what's actually connected before
assuming a tool is available — connections can be lost across a dropped tmux/SSH session the
same way any other state can, per `docs/infrastructure.md`'s notes on session resilience.
