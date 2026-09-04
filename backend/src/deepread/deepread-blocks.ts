/**
 * Deep Read → structured document blocks.
 *
 * The verbatim transcription preserves the page's line structure, so a
 * deterministic parser recovers most document shape with zero cost and zero
 * latency: headings, outline items, list items, diagram placeholders and
 * paragraphs. This output feeds the Reflow reader directly — a handwritten
 * page becomes a scrollable, well-typeset mobile document.
 *
 * An optional AI structuring pass (DEEP_READ_STRUCTURE=ai) can refine messy
 * pages further, but it is OFF by default: the deterministic pass is free,
 * instant, works within the free-tier budget, and never invents content.
 */

export type TextBlockType = "heading" | "paragraph" | "list_item" | "diagram";

export interface TextBlock {
  type: TextBlockType;
  text: string;
  /** Heading outline depth (1-3) when type === "heading". */
  level?: number;
}

/** Outline markers like "1.", "1)", "(a)", "a.", "(i)", "i.", "II)". */
const OUTLINE_RE = /^(?:(\d{1,2})[.)]|[(]?([a-zA-Z]|[ivxIVX]{1,4})[).])\s+/;
const BULLET_RE = /^[•▪●◦*\-–—]\s+/;
// Headings: short, no terminal punctuation, not a list item.
const HEADING_MAX_WORDS = 9;

export function parseBlocksFromText(raw: string): TextBlock[] {
  const lines = raw
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((l) => l.replace(/\s+$/g, ""))
    .filter((l) => l.trim().length > 0);

  const blocks: TextBlock[] = [];
  let paragraph: string[] = [];

  const flushParagraph = () => {
    if (paragraph.length) {
      blocks.push({ type: "paragraph", text: paragraph.join(" ").trim() });
      paragraph = [];
    }
  };

  for (const line of lines) {
    const trimmed = line.trim();

    // Diagram placeholder — own block, never merged.
    const diagram = trimmed.match(/^\[(?:diagram|figure|drawing|sketch)\s*[:\-]?\s*(.*)\]$/i);
    if (diagram) {
      flushParagraph();
      blocks.push({ type: "diagram", text: diagram[1]?.trim() || "diagram" });
      continue;
    }

    // Bulleted list item.
    if (BULLET_RE.test(trimmed)) {
      flushParagraph();
      blocks.push({ type: "list_item", text: trimmed.replace(BULLET_RE, "") });
      continue;
    }

    // Outline item ("2.", "(b)", "(iii)") — keep the marker in the text so
    // numbering the student wrote survives; the reader renders it as a list.
    const outline = trimmed.match(OUTLINE_RE);
    if (outline) {
      flushParagraph();
      blocks.push({ type: "list_item", text: trimmed });
      continue;
    }

    // Heading heuristics: short line, no sentence punctuation, and either
    // ALL-CAPS-ish, underlined-style, or a standalone title case line.
    const words = trimmed.split(/\s+/);
    const terminalPunctuation = /[.!?,;:]$/.test(trimmed);
    const letters = trimmed.replace(/[^A-Za-z]/g, "");
    const capsRatio =
      letters.length > 2
        ? letters.replace(/[^A-Z]/g, "").length / letters.length
        : 0;
    const looksHeading =
      words.length <= HEADING_MAX_WORDS &&
      !terminalPunctuation &&
      (capsRatio >= 0.7 || trimmed === trimmed.toUpperCase());

    if (looksHeading && letters.length > 1) {
      flushParagraph();
      blocks.push({
        type: "heading",
        text: trimmed,
        level: words.length <= 4 && capsRatio >= 0.7 ? 1 : 2,
      });
      continue;
    }

    paragraph.push(trimmed);
  }

  flushParagraph();
  return blocks;
}

/** Deterministic JSON for the page's `blocks` column. */
export function blocksToJson(blocks: TextBlock[]): unknown {
  return blocks.map((b) => (b.level ? { ...b } : { type: b.type, text: b.text }));
}
