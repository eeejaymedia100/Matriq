---
name: ux-skill
description: Use when building or reshaping UI — landing pages, dashboards, mobile screens, design systems, or when the user asks for "ux", "design system", "make it look good", "anti-AI-slop", or a design review. Wraps the uxskill CLI (deterministic Python design-intelligence engine, no LLM) for design recommendations, token generation, and an anti-generic linter.
---

# ux-skill — design intelligence engine

A deterministic (no-LLM) design engine installed as the `uxskill` Python package.
It ingests a project brief (industry, audience, tone, stack) and returns a complete
recommended design system — style, palette, type pairing, motion presets, components —
then lints generated UI against anti-AI-slop rules.

## Prerequisites

- Engine binary at `~/.local/bin/uxskill` (also `ux`). If `uxskill` is not on PATH:
  `pip3 install --user uxskill` and use `export PATH="$HOME/.local/bin:$PATH"`.
- Check the engine is alive: `uxskill stats` — prints manifest counts (styles,
  palettes, type-pairs, components, anti-patterns…).

## When to use

- New page/screen/app design work (landing page, dashboard, mobile app screens).
- Building or refreshing a design system or token set.
- Reviewing UI the user suspects looks "AI-generated"/generic.
- Any time the user names this skill (`/ux-*` style requests) or asks for it explicitly.

## Workflow

1. **Discover** — capture the brief. Interactive if the user can answer:
   `uxskill discover`
   Non-interactive: skip and hand-pick fields in the recommend step below.
2. **Recommend** — get a deterministic design system for the brief:
   `uxskill recommend --industry=<industry> --tone=<tone> --stack=<stack>`
   (Use `uxskill stats` output + `--help` for valid values. Output is stable:
   same input → same recommendation.)
3. **Generate** — emit tokens + manifest you can implement from:
   `uxskill generate` (consumes the recommendation)
4. **Lint** — after writing UI code, verify it passes the anti-generic rules:
   `uxskill lint .` (run at project root; fix reported anti-patterns before commit)

## Integration rules for this repo (Matriq)

The project has a locked design system — Glass/Pop themes, Plus Jakarta Sans +
Fraunces, deep-purple/lime palette. ux-skill output must be adapted through it:

- Treat ux-skill's recommendation as a structural/typographic/motion reference,
  not a license to introduce new colors or fonts. Matriq's locked palette and
  type system always win.
- Use the linter output as a checklist for genericity (equal-width card rows,
  default 300ms transitions, centered-hero clichés, placeholder copy, etc.).
- For React Native/Expo screens, translate recommended web tokens into the
  existing theme files; never add new font packages or icon fonts.

## Notes

- Everything is offline and deterministic — safe to re-run any time.
- `~/.ux/` (or `--root`) holds per-project state; `.claude-plugin/plugin.json`
  exists at repo root from `uxskill init` for Claude Code compatibility.
- Version installed: uxskill 2.0.0a1 (PyPI). Upstream repo: Laith0003/ux-skill.
