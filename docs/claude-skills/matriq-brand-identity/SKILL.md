---
name: matriq-brand-identity
description: Use whenever creating or editing any user-facing screen, component, or piece of copy in the Matriq app (mobile screens, emails, notifications, marketing pages). Ensures visual and verbal consistency with the tested prototype instead of inventing new colors, spacing, or tone per-screen.
---

# Matriq Brand Identity

## Visual identity

Matriq is dark-first, premium, calm — not a loud "startup neon" aesthetic despite the accent
color being a bright lime. The brand reads as *confident and trustworthy*, aimed at university
students handling money and identity, not a consumer social app.

### Color tokens (dark theme — default)

| Token | Value | Use |
|---|---|---|
| `bg` | `#0D0620` | app background |
| `bg2` | `#140A2D` | elevated surface / gradient stop |
| `text` | `#F0E6FF` | primary text |
| `text-secondary` | `#B6A7D8` | secondary text |
| `text-muted` | `#8B7AAE` | tertiary/hint text |
| `accent` | `#C8FF00` | primary actions, highlights |
| `success` | `#00FF88` | |
| `warning` | `#FFB547` | |
| `error` | `#FF5C7A` | |
| `info` | `#64D2FF` | |

### Color tokens (light theme)

**Do not simply lighten the dark palette.** The raw neon `accent` fails contrast on a white
background — this was a real bug caught and fixed once already. Use the corrected values:

| Token | Value | Why |
|---|---|---|
| `accent` | `#2E6B00` | deep green, 6.03:1 contrast on light bg (WCAG AA) |
| `success` | `#0B7A4B` | darkened from dark-theme value for contrast at badge sizes |
| `warning` | `#9A6100` | |
| `error` | `#C4294B` | |
| `info` | `#0A6AA0` | |
| `text-muted` | `#5C4D82` | darkened for contrast, not the dark theme's `#8B7AAE` |

### The on-accent / on-success pattern — don't skip this

Any text or icon sitting *on top of* a solid `accent` or `success` background (buttons, active
tabs, avatars, chat bubbles, checkmarks) needs a color that flips between themes, because dark
text works on bright lime but fails on the deeper light-mode green:

- `on-accent`: `#0D0620` (dark theme) / `#FFFFFF` (light theme)
- `on-success`: `#0D0620` (dark theme) / `#FFFFFF` (light theme)

Never hardcode a literal color for text-on-accent — always reference the theme token. This exact
mistake shipped once in the prototype and required a dedicated fix pass; don't reintroduce it in
the native app.

### Typography

- Headings: Plus Jakarta Sans, weight 700–800.
- Body: Inter, weight 400–600.
- Numbers/amounts get the heading font at larger weight — money and stats should feel confident,
  not squeezed into body text styling.

### Shape and spacing

- Generous rounded corners: cards `20px`, buttons `16px`, bottom sheets `28px`.
- Glassmorphism: translucent surfaces with a border, not flat fills — in dark mode this is a
  white-tinted translucent overlay; in light mode it stays a *white* translucent overlay (higher
  opacity, ~0.7–0.92), not inverted to a dark tint. Getting this backwards is a common mistake —
  light mode should still look like frosted glass, just frosted glass on a light backdrop.

## Verbal identity / tone

- Confident, warm, occasionally dryly funny — never corporate-flat, never try-hard meme energy.
- Nigerian-student-specific phrasing where it fits naturally (e.g., "no wahala," "oga come back
  tomorrow") is on-brand for marketing copy; keep in-app functional copy (error messages, form
  labels) clear and universally understood first, with personality layered on top, not instead
  of clarity.
- Never invent copy that promises functionality that isn't real — if a feature is a WhatsApp
  hand-off, the copy says so plainly ("message the executives directly"), it doesn't pretend to
  be a native in-app action.

## When porting a prototype screen

Preserve the original microcopy unless there's a real reason to change it — it was already
written deliberately (see the launch film script and the prototype's own copy for tone
reference). Don't "clean up" personality out of it while porting to native code.
