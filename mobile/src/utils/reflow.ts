/**
 * Reflow — turn extracted document text into well-fitted mobile reading
 * blocks (the "mobile view" students already know from their browsers).
 *
 * Input reality: vault PDF extraction collapses whitespace, so text can be
 * one giant line; DOCX/PPTX/OCR keep line structure. The parser handles both:
 *
 *   1. explicit line breaks → paragraphs preserved as written
 *   2. wall-of-text → split into sentence groups sized for comfortable
 *      mobile reading (never a 3000-word slab)
 *
 * The output feeds the ReflowReader: one block per screen-card, vertical
 * swipe between blocks, font size controlled by the reader. Deterministic,
 * offline, zero cost.
 */

export interface ReflowBlock {
  type: "heading" | "paragraph" | "list_item" | "slide_break";
  text: string;
  /** Slide/deck position marker when type === "slide_break". */
  index?: number;
  /** Heading depth (1 = big title, 2 = slide/section title). */
  level?: number;
}

const HEADING_MAX_WORDS = 9;
const SENTENCES_PER_PARAGRAPH = 3;

/** Outline markers like "1.", "1)", "(a)", "a.", "(i)", "i.", "II)". */
const OUTLINE_RE = /^(?:(\d{1,2})[.)]|[(]?([a-zA-Z]|[ivxIVX]{1,4})[).])\s+/;
const BULLET_RE = /^[•▪●◦*\-–—]\s+/;

/** Split a wall of text into sentence groups (no regex lookbehind needed). */
function splitSentences(text: string): string[] {
  // Sentence enders: . ! ? followed by whitespace + capital/quote/digit.
  const parts: string[] = [];
  let start = 0;
  for (let i = 1; i < text.length - 1; i += 1) {
    const ch = text[i];
    if (ch === "." || ch === "!" || ch === "?") {
      const next = text[i + 1];
      // Avoid splitting decimals (3.14), acronyms mid-token (U.S.A handled
      // by requiring whitespace after), and single-letter initials.
      if (next === " " || next === "\n") {
        const prev = text[i - 1];
        const nextChar = text[i + 2] ?? "";
        const isDecimal = /[0-9]/.test(prev) && /[0-9]/.test(text[i + 2] ?? "");
        const isInitial = /[A-Z]/.test(prev) && text[i - 2] === " ";
        if (!isDecimal && !isInitial && nextChar) {
          parts.push(text.slice(start, i + 1).trim());
          start = i + 1;
        }
      }
    }
  }
  parts.push(text.slice(start).trim());
  return parts.filter((p) => p.length > 0);
}

function looksLikeHeading(line: string): boolean {
  const trimmed = line.trim();
  const words = trimmed.split(/\s+/);
  if (words.length > HEADING_MAX_WORDS || words.length < 1) return false;
  if (/[.!?,;:]$/.test(trimmed)) return false;
  // Markdown headings extracted from DOCX-aware pipelines.
  if (/^#{1,3}\s+/.test(trimmed)) return true;
  const letters = trimmed.replace(/[^A-Za-z]/g, "");
  if (letters.length < 2) return false;
  const capsRatio = letters.replace(/[^A-Z]/g, "").length / letters.length;
  return capsRatio >= 0.7 || trimmed === trimmed.toUpperCase();
}

function classifyLine(line: string): ReflowBlock | null {
  const trimmed = line.trim();
  if (!trimmed) return null;
  if (BULLET_RE.test(trimmed)) {
    return { type: "list_item", text: trimmed.replace(BULLET_RE, "") };
  }
  if (OUTLINE_RE.test(trimmed)) {
    return { type: "list_item", text: trimmed };
  }
  if (looksLikeHeading(trimmed)) {
    return { type: "heading", text: trimmed.replace(/^#{1,3}\s+/, "") };
  }
  return null;
}

/** Slide-break markers: "Slide 3", "---", "───", or a lone "· · ·". */
function slideBreakMarker(line: string): number | null {
  const trimmed = line.trim();
  const m = trimmed.match(/^(?:slide|deck)\s+(\d{1,3})$/i);
  if (m) return Number(m[1]);
  if (/^(-{3,}|_{3,}|={3,}|·\s*·\s*·)$/.test(trimmed)) return -1;
  return null;
}

export function parseReflowBlocks(
  raw: string,
  opts: { firstLineIsTitle?: boolean } = {},
): ReflowBlock[] {
  const hasLineBreaks = /\n/.test(raw.trim());
  const blocks: ReflowBlock[] = [];
  let slideIndex = 0;
  // A deck's first line IS the title-slide title (no --- precedes it).
  let awaitingFirstTitle = !!opts.firstLineIsTitle;

  const pushSlideBreak = (explicit: number | null) => {
    if (explicit && explicit > 0) {
      slideIndex = explicit;
      blocks.push({ type: "slide_break", text: `Slide ${explicit}`, index: explicit });
    } else {
      // A generic break sits between slide N and slide N+1 — it announces
      // the slide that is ABOUT to come.
      slideIndex += 1;
      blocks.push({ type: "slide_break", text: `Slide ${slideIndex + 1}`, index: slideIndex + 1 });
    }
  };

  if (!hasLineBreaks) {
    // Wall of text (vault PDF extraction) — sentence-group paragraphs.
    const sentences = splitSentences(raw);
    for (let i = 0; i < sentences.length; i += SENTENCES_PER_PARAGRAPH) {
      const group = sentences.slice(i, i + SENTENCES_PER_PARAGRAPH).join(" ");
      blocks.push({ type: "paragraph", text: group });
    }
    return blocks;
  }

  // Structured input — line-preserving sources (DOCX, PPTX, OCR, txt).
  let paragraph: string[] = [];
  let afterSlideBreak = false;
  const flushParagraph = () => {
    if (paragraph.length) {
      blocks.push({ type: "paragraph", text: paragraph.join(" ").trim() });
      paragraph = [];
    }
  };

  for (const line of raw.replace(/\r\n?/g, "\n").split("\n")) {
    const slideBreak = slideBreakMarker(line);
    if (slideBreak !== null) {
      flushParagraph();
      pushSlideBreak(slideBreak);
      afterSlideBreak = true;
      continue;
    }

    // Blank lines never cancel a pending title — a slide marker is often
    // followed by an empty line before the title text.
    if ((afterSlideBreak || awaitingFirstTitle) && !line.trim()) {
      continue;
    }

    // The first content line after a slide break (or a deck's first line)
    // is the slide title — that is what a title IS, no heuristic guessing.
    if ((afterSlideBreak || awaitingFirstTitle) && line.trim()) {
      flushParagraph();
      if (BULLET_RE.test(line.trim())) {
        blocks.push({ type: "list_item", text: line.trim().replace(BULLET_RE, "") });
      } else {
        blocks.push({ type: "heading", text: line.trim(), level: 2 });
      }
      afterSlideBreak = false;
      awaitingFirstTitle = false;
      continue;
    }

    const classified = classifyLine(line);
    if (classified) {
      flushParagraph();
      blocks.push(classified);
      continue;
    }

    paragraph.push(line.trim());
  }
  flushParagraph();

  return blocks;
}
