/**
 * Resource Audit Engine — cover generation port (Part 6).
 *
 * A modular interface for a future cover-image generator. V1 ships a no-op
 * provider: the port exists so a real generator (AI or template-based) can
 * be swapped in via DI without touching the pipeline. The engine NEVER calls
 * this for rejected, pending, or unapproved submissions — covers are a
 * publication-time concern only, so no AI spend is wasted upstream.
 */

import { Injectable } from "@nestjs/common";

export interface ResourceCoverInput {
  submissionId: string;
  courseCode: string;
  title: string;
  materialType: string;
  academicSession: string | null;
  universityName: string | null;
}

export interface ResourceCoverResult {
  /** Storage ref of the generated cover image, or null when not produced. */
  coverRef: string | null;
  provider: string;
}

export const RESOURCE_COVER_PORT = Symbol("RESOURCE_COVER");

export interface ResourceCoverProvider {
  readonly provider: string;
  generateCover(input: ResourceCoverInput): Promise<ResourceCoverResult>;
}

@Injectable()
export class NoopCoverProvider implements ResourceCoverProvider {
  readonly provider = "noop";

  async generateCover(_input: ResourceCoverInput): Promise<ResourceCoverResult> {
    // V1: the Vault renders its own poster tiles; no separate cover is
    // generated. Swap this provider via DI to enable generation.
    return { coverRef: null, provider: this.provider };
  }
}
