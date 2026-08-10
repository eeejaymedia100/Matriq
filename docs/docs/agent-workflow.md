# Agent Workflow — Rules of Engagement

**This document is subordinate to `production-directive.md`.** That document sets the overall
standard (no fake functionality, precise language about what's actually done, the
build→test→inspect→fix→commit→continue loop); this document is the tmux/Termux-specific detail
underneath it — how to survive a dropped session, when to stop and ask a human, how to keep
`docs/progress-log.md` useful. Read the directive first if you haven't already.

You are operating semi-autonomously, over a long-running tmux session, on a machine that will
eventually hold real students' personal and financial data. This document is how you stay useful
across sessions that will inevitably get interrupted, and how you avoid the mistakes an agent in
this situation is most likely to make.

## At the start of every session

1. Read `docs/progress-log.md` first. Don't re-derive where the project is from scratch — the
   log exists precisely so you don't have to.
2. Check `git status` and `git log --oneline -10` on whatever branch was last active. If there's
   uncommitted work, understand *why* before continuing it or discarding it.
3. Check CI status on the last-pushed branch before assuming the last session's work was good.
4. Re-skim `agenda.md` for the current phase and `security.md` for anything relevant to what
   you're about to build.

## During a session

- **Commit small, commit often.** A commit every meaningfully-complete change (a passing test, a
  working endpoint, a fixed bug) — not one giant commit at the end of a session. If your SSH
  connection drops mid-task, the work since your last commit is at risk; act accordingly.
- **Work on a feature branch, always.** Never commit directly to `develop` or `main`.
- **Write the test alongside the code, not after.** This is both a quality practice and a
  resumability one — a half-finished feature with a failing test is much easier for a future
  session (you or a human) to pick back up correctly than a half-finished feature with no test
  signaling what "done" looks like.
- **Update `docs/progress-log.md` as you go**, not just at session end — if the session is
  interrupted mid-task, the log should still reflect real state, not a stale "everything's fine"
  entry from an hour ago.
- **Never commit secrets.** Before every commit touching config/env-related files, double check
  nothing sensitive is staged. If you're ever unsure whether a value is sensitive, treat it as
  sensitive.

## When to stop and ask a human, rather than deciding yourself

- Anything that costs real money (provisioning a GPU VM, upgrading a paid tier, purchasing
  Apple/Google developer accounts).
- Anything destructive against data that isn't trivially recoverable (dropping a column,
  deleting rows outside a dev/staging environment, rotating a secret that active sessions depend
  on).
- Any point where a task in `agenda.md` seems to require doing something `security.md`
  disallows. Don't resolve this tension yourself — flag it.
- A real payment gateway going live (switching from Paystack test keys to live keys) — this is a
  one-way door for a specific reason: real money starts moving.
- Any decision explicitly marked "decide in Phase X" across these docs that you're about to make
  unilaterally — those markers exist because the decision needs a human's input, not because
  research is incomplete.

## When something breaks

- Don't paper over a failing test by weakening the assertion — fix the underlying issue, or if
  the test itself was wrong, say so explicitly in the commit message and in
  `docs/progress-log.md`, don't just quietly loosen it.
- If CI is red on `main` or `develop`, that's the top priority over any new feature work until
  it's green again.
- If you disable a security control to isolate a bug, re-enable it before ending the session,
  full stop — see `security.md`'s agent-specific section.

## Communicating progress to the human (who's checking in via Termux, often briefly)

- Keep `docs/progress-log.md` skimmable — a human glancing at it from a phone screen should be
  able to tell "what happened since I last looked" in under a minute, not have to read a wall of
  text.
- Flag blockers clearly and early, not buried at the end of a long log entry.
- If you're about to spend a long time on something (a large refactor, a slow build), note that
  at the start of the log entry, not just at the end — so a human checking in mid-task
  understands what's happening rather than assuming something's stuck.

## Resuming after a long gap

If it's been a while since the last session (days, not hours):
1. Re-read `agenda.md` in full, not just the current phase — priorities may have shifted based
   on human feedback given outside this doc set.
2. Check whether dependencies have new versions with security advisories before continuing
   feature work — a stale session picking back up is exactly when a dependency vulnerability is
   most likely to have gone unnoticed.
3. Confirm the staging environment still deploys cleanly before adding new work on top of it.
