import type { Material } from "../utils/materials";

/**
 * Lightweight on-device retrieval for the offline AI.
 *
 * The student imports their own study files (PDF/DOCX/txt/photo) with the
 * system file picker — explicit permission, no broad storage scan. Each
 * material's extracted text is stored on the device, and when the student
 * asks a question the most relevant chunks are found here (simple keyword
 * scoring — no embeddings, nothing leaves the phone) and injected into the
 * model's context. This is the offline-AI equivalent of the server's
 * pgvector retrieval.
 */

const CHUNK_WORDS = 320; // ~1 paragraph of context per chunk
const MAX_CHUNKS = 6;

/** Split a material's text into overlapping-ish chunks of CHUNK_WORDS. */
export function chunkText(text: string): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const chunks: string[] = [];
  for (let i = 0; i < words.length; i += CHUNK_WORDS) {
    chunks.push(words.slice(i, i + CHUNK_WORDS).join(" "));
  }
  return chunks.length > 0 ? chunks : [];
}

/** Strip common filler words so scoring isn't dominated by them. */
const STOP = new Set([
  "the", "a", "an", "of", "to", "in", "on", "for", "and", "or", "is", "are",
  "was", "were", "be", "been", "it", "this", "that", "with", "as", "at",
  "by", "from", "what", "when", "where", "which", "who", "how", "why",
  "can", "could", "would", "should", "will", "may", "might", "do", "does",
  "did", "have", "has", "had", "please", "explain", "tell", "about",
]);

function keywords(query: string): string[] {
  return query
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP.has(w));
}

function scoreChunk(chunk: string, queryKeywords: string[]): number {
  const lower = chunk.toLowerCase();
  let score = 0;
  for (const kw of queryKeywords) {
    // Weighted: word-boundary hits score more than substring hits.
    if (new RegExp(`\\b${kw}`, "i").test(lower)) score += 2;
    else if (lower.includes(kw)) score += 1;
  }
  return score;
}

export interface RetrievedChunk {
  sourceTitle: string;
  text: string;
}

/**
 * Pick the most relevant chunks across the student's materials for a query.
 * Returns [] when there's nothing usable. Never throws.
 */
export function retrieveChunks(
  materials: Material[],
  query: string,
  limit = MAX_CHUNKS,
): RetrievedChunk[] {
  try {
    const qk = keywords(query);
    if (qk.length === 0) return [];

    const scored: Array<{ score: number; chunk: RetrievedChunk }> = [];
    for (const m of materials) {
      if (m.textStatus !== "ready" || !m.text) continue;
      for (const chunk of chunkText(m.text)) {
        const score = scoreChunk(chunk, qk);
        if (score > 0) {
          scored.push({
            score,
            chunk: { sourceTitle: m.title || "Untitled material", text: chunk },
          });
        }
      }
    }

    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, limit).map((s) => s.chunk);
  } catch {
    return [];
  }
}
