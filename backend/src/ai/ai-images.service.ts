import { Injectable, Logger } from "@nestjs/common";
import {
  ImageSearchService,
  type ImageSearchResponse,
} from "./image-search.service";

/**
 * Chat-time image enrichment for Premium AI chats.
 *
 * The decision to attach images is NOT made by the model's free text —
 * that would be trivially gameable and would put images on every answer.
 * Instead a deterministic heuristic decides when visuals genuinely help
 * (diagram-shaped subjects: anatomy, structures, processes, maps,
 * equipment, visual comparisons) and runs one bounded image search.
 *
 * Normal text-only answers stay text-only: if the heuristic doesn't fire,
 * no provider call happens at all — zero latency and zero cost added.
 */
@Injectable()
export class AiImagesService {
  private static readonly MAX_IMAGES = 4;
  /** Hard wall-clock budget: enrichment must never delay the answer path. */
  private static readonly BUDGET_MS = 4_000;

  private readonly logger = new Logger(AiImagesService.name);

  constructor(private readonly imageSearch: ImageSearchService) {}

  /**
   * Decide + fetch. Returns null when the heuristic says "text is enough" —
   * the caller then sends no images field at all.
   */
  async maybeForQuery(query: string): Promise<ImageSearchResponse | null> {
    const subject = this.visualSubject(query);
    if (!subject) return null;
    return this.withBudget(this.imageSearch.search(subject, AiImagesService.MAX_IMAGES));
  }

  /**
   * The deterministic "would a picture genuinely improve this answer?" test.
   * Deliberately conservative: education-first subjects where the web has
   * license-clean, high-quality imagery. Returns the search subject or null.
   */
  private visualSubject(query: string): string | null {
    const q = query.toLowerCase();
    // Too short to infer intent, or conversational/meta — no images.
    if (q.trim().length < 12) return null;
    if (/(what did i|my notes|my upload|remind me|due date|deadline|fee|payment|receipt|hello|hi matriq|thank you)/.test(q)) {
      return null;
    }

    const visualNouns = [
      // anatomy & biology
      "anatomy", "heart", "lung", "kidney", "brain", "neuron", "skeleton",
      "skull", "cell", "mitosis", "meiosis", "dna", "photosynthesis",
      "leaf", "flower", "frog", "fish", "eye", "ear", "muscle", "bone",
      // physics & chemistry
      "circuit", "electric field", "magnetic field", "wave", "lens", "mirror",
      "atom", "molecule", "bond", "orbit", "solar system", "planet",
      "electromagnetic", "spectrum", "pendulum", "lever", "pulley",
      // geography & environment
      "map", "river", "volcano", "mountain", "climate", "water cycle",
      "erosion", "rainfall", "plate tectonics", "desert", "forest",
      // engineering / computing / economics visual culture
      "engine", "turbine", "transformer", "gear", "bridge", "flowchart",
      "network topology", "keyboard", "motherboard", "transistor",
      // visual comparisons students ask for
      "difference between", "compared to", "vs ",
      // structures
      "structure of", "diagram of", "parts of", "layers of", "cycle of",
    ];

    const hit = visualNouns.find((n) => q.includes(n));
    if (!hit) return null;

    // Build a tight 2-6 word subject around the hit for cleaner image recall.
    const words = q.replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter(Boolean);
    const idx = words.findIndex((w) => hit.split(" ")[0].startsWith(w.slice(0, 4)));
    const start = Math.max(0, (idx < 0 ? 0 : idx) - 1);
    const subject = words.slice(start, start + 5).join(" ").trim();
    return subject.length >= 4 ? subject : query.trim().slice(0, 60);
  }

  /** Never let enrichment hang past the budget — text answer ships regardless. */
  private async withBudget(p: Promise<ImageSearchResponse>): Promise<ImageSearchResponse | null> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<null>((resolve) => {
      timer = setTimeout(() => {
        this.logger.warn("Image enrichment exceeded budget — shipping text-only");
        resolve(null);
      }, AiImagesService.BUDGET_MS);
    });
    try {
      return await Promise.race([p, timeout]);
    } catch (err) {
      this.logger.warn(
        `Image enrichment failed: ${err instanceof Error ? err.message : String(err)}`,
      );
      return null;
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
}
