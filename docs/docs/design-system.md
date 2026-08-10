# Design System

This document exists because `production-directive.md` Section 7 requires a coherent design
system established *before* building large numbers of screens — not derived retroactively from
whatever screens happened to get built first. Color and typography values are defined once, in
`claude-skills/matriq-brand-identity/SKILL.md` — this document doesn't repeat them, it defines
everything *around* them: components, states, and the explicit anti-patterns from the directive.

## Explicitly banned (directive Section 3 and 4 — do not reintroduce these)

- AI-slop photography, generic stock photography without a product reason, fake 3D renders,
  random decorative blobs/shapes.
- Excessive gradients, glows, glassmorphism, or shadows used decoratively rather than
  functionally. (The prototype used glassmorphism deliberately and sparingly — as a functional
  layering cue, not a visual flourish on every surface. Keep it that restrained in the native
  app.)
- Cursive fonts without a strong branding justification; generic/default system typography.
- Emoji used as icons. (Emoji in copy/marketing tone, per the launch film script, is a separate,
  intentional choice — the rule here is specifically about using emoji *as interface icons*.)
- A text-only wordmark standing in for a real logo/app icon — see Branding below.
- Animation added because it's possible rather than because it improves feedback, understanding,
  navigation, state transitions, or perceived responsiveness. If you can't name which of those
  five an animation serves, don't add it. The app must feel complete with animations disabled.

## Components — one canonical version of each

Define each of these exactly once, and reuse it everywhere rather than building
screen-specific variants:

- **Buttons:** primary, secondary, ghost, danger — states: default, pressed, disabled, loading.
- **Inputs:** text, select, checkbox/toggle — states: default, focused, error, disabled.
- **Cards:** base card, elevated card — used consistently for the same *kind* of content
  (a fee card looks like a fee card everywhere it appears, not slightly different on Dashboard
  vs. Fee Details).
- **Navigation:** top bar, bottom/tab navigation, back navigation — one pattern per navigation
  type, not ad hoc per screen.
- **Modals and bottom sheets:** one modal pattern, one bottom-sheet pattern.
- **Toasts:** one toast style, one position, one dismiss behavior.
- **Alerts/badges:** success, warning, error, info, muted — five semantic variants, used
  consistently for their semantic meaning (don't use the "error" badge color for something that
  isn't actually an error state).
- **Icons:** one icon set/style throughout (the prototype used a consistent hand-built SVG icon
  set — carry that consistency into the native app rather than mixing icon libraries).
- **Loading indicators:** one spinner/skeleton pattern, used consistently rather than a different
  loading treatment per screen.

## Required states — every feature, no exceptions (directive Section 5)

For every screen or component that fetches or submits data, all of these must be designed and
implemented, not just the happy path:

| State | Requirement |
|---|---|
| Loading | A real loading indicator, not a blank screen or frozen UI |
| Success | Clear confirmation the action worked |
| Empty | A sensible message when there's legitimately no data (e.g., no announcements yet) — not a blank screen indistinguishable from a loading or broken state |
| Error | A specific, useful message — "Something went wrong" is acceptable only when a more specific message genuinely isn't available; it should be the exception, not the default |
| Validation | Inline, immediate feedback on form fields, not just a rejected submission |
| Recovery | A clear path forward from an error (retry action, or clear next step) — not a dead end |

A screen is not "done" until all applicable states above exist for it. This is the same
bar `production-directive.md` Section 25 ("No Pretending") holds implementation claims to —
"the happy path renders" is not "implemented."

## Accessibility baseline

- Minimum touch target size appropriate to the platform (44×44pt iOS / 48×48dp Android).
- Text contrast meeting WCAG AA at minimum — the brand identity skill's light-mode color values
  were specifically chosen to meet this after a real contrast bug was caught and fixed once
  already; don't regress it.
- All interactive elements properly labeled for screen readers, not relying on visual-only cues.
- Never convey state (error, success, required field) through color alone — pair it with an icon
  or text label.

## Branding (directive Section 8)

Required, before this is treated as launch-ready:
- A real Matriq logo mark (the "M" wordmark used in the prototype is a starting point, not
  necessarily the finished brand asset — evaluate whether it needs professional design polish
  before shipping).
- App icon (iOS and Android, all required resolutions).
- Splash screen, consistent with the brand's dark-first identity.
- Favicon (for any web-facing surface — an admin console, marketing site).
- Correct app metadata: app name, bundle identifier/package name, version, description, and
  category as they'll appear in the App Store and Play Store listings.

## Copywriting standard (directive Section 9)

Product copy is clear, direct, human, concise, and useful. Avoid generic AI marketing language,
buzzwords, overclaiming, unnecessary jargon, and repetitive em-dash-heavy sentence construction.
The prototype's copy (and the launch film script) already demonstrate the right tone — direct,
a little warm, occasionally dry — use those as the reference, not a generic "friendly startup"
voice.

## Where this gets enforced

`claude-skills/matriq-brand-identity/SKILL.md` is what the agent actually reaches for while
writing UI code — this document is the fuller reference it's built from. If the two ever drift
apart, update both in the same change.
