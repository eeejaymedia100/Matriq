/**
 * Rotating fact/term card content (spec §6 Home hero, §9 Study #1 — implement
 * once, reuse, don't build it twice).
 *
 * Spec: generate/extract a batch once (from the student's own materials via
 * simple text extraction, or the offline AI in one pass) and cycle it
 * client-side roughly once a minute. Until a student has materials or an
 * installed model, these seed facts keep the card alive without any network.
 * A later stage replaces this with the material-derived batch.
 */
export interface Fact {
  title: string;
  body: string;
  tag: string;
}

export const SEED_FACTS: Fact[] = [
  {
    title: "The Pomodoro effect",
    body: "25 minutes of focus + 5 minutes of rest trains your brain to start quickly and stay on task.",
    tag: "Study",
  },
  {
    title: "Active recall",
    body: "Testing yourself beats re-reading: retrieving a fact strengthens the memory more than seeing it again.",
    tag: "Method",
  },
  {
    title: "Spaced repetition",
    body: "Reviewing just before you'd forget something moves it into long-term memory — 1 day, 3 days, 7 days, 21 days.",
    tag: "Method",
  },
  {
    title: "The Feynman technique",
    body: "Explain a concept as if teaching a 12-year-old. Wherever you stumble, that's what you don't know yet.",
    tag: "Study",
  },
  {
    title: "Hydrate to think",
    body: "Even mild dehydration (2%) measurably slows reaction time and working memory. Keep water at your desk.",
    tag: "Health",
  },
  {
    title: "Sleep consolidates",
    body: "Memory moves to long-term storage while you sleep — an all-nighter before an exam can undo the week's work.",
    tag: "Health",
  },
  {
    title: "Mnemonic pegs",
    body: "Anchor new facts to a vivid image or a route you know well; the weirder the image, the stronger the recall.",
    tag: "Method",
  },
  {
    title: "Interleaving",
    body: "Mix topics in one session instead of blocking one subject. It feels harder — and that's why it works.",
    tag: "Study",
  },
];

/** Pick the next fact for a rotating card (client-side, ~1/minute). */
export function factForTick(tick: number, facts: Fact[] = SEED_FACTS): Fact {
  return facts[tick % facts.length];
}
