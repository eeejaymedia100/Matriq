/**
 * Shared chat-image types — mirrors the backend's ImageSearchResult
 * (backend/src/ai/image-search.service.ts). One definition so every Premium
 * chat surface (companion chat, reader agent, focus agent) renders images
 * through the same ImageCarousel.
 */

export interface ChatImage {
  /** Direct image URL (https-only, server-sanitized). */
  url: string;
  /** Smaller variant for the carousel thumbnail (falls back to url). */
  thumbUrl?: string | null;
  title?: string | null;
  width?: number | null;
  height?: number | null;
  /** Short license name, e.g. "CC BY-SA 4.0" — shown in the viewer. */
  license?: string | null;
  /** Author / source attribution. */
  credit?: string | null;
  /** Page the image came from (attribution link). */
  sourceUrl?: string | null;
}
