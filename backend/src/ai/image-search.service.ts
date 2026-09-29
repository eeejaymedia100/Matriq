import { Injectable, Logger } from "@nestjs/common";

/**
 * Image search for Premium AI chats — the "hands" behind the agent's
 * search_images tool and the chat-time images event.
 *
 * Providers (first configured wins):
 *  1. Serper (Google Images) — when SERPER_API_KEY is set.
 *  2. Wikimedia Commons — the default. Keyless, license-clean academic
 *     imagery (diagrams, anatomy, maps, equipment). Every result carries
 *     its license and artist credit, which the carousel renders.
 *
 * Security posture (security-review checklist):
 *  - Every URL is validated http(s) + hostname allowlist before it ever
 *    reaches a student's phone. The model can never inject a URL: results
 *    come only from the configured provider's API response, and anything
 *    that fails sanitization is dropped, not fixed.
 *  - Timeouts + bounded result counts on every outbound call.
 *  - 1h in-memory TTL cache keyed by (provider, normalized query) so a
 *    popular diagram doesn't refetch on every message.
 */

export interface ImageSearchResult {
  /** Full-resolution image URL (sanitized). */
  url: string;
  /** Smaller preview the carousel loads first. */
  thumbUrl: string;
  /** Alt text / image title — rendered for accessibility. */
  title: string;
  /** Width in px when the provider reports it (else null). */
  width: number | null;
  /** Height in px when the provider reports it (else null). */
  height: number | null;
  /** License short name, e.g. "CC BY-SA 4.0" (Wikimedia). */
  license: string | null;
  /** Artist / source page credit. */
  credit: string | null;
  /** The page this image lives on (for "view source"). */
  sourceUrl: string | null;
}

export interface ImageSearchResponse {
  provider: "wikimedia" | "serper";
  results: ImageSearchResult[];
}

/** Hostnames a result URL may point at — provider domains only. */
const ALLOWED_IMAGE_HOSTS = [
  "upload.wikimedia.org",
  "commons.wikimedia.org",
  "i.ytimg.com", // serper thumbnails (unused by default, kept tight anyway)
];

/** Serper image-result hosts are unbounded (the open web), so serper results
 *  get a separate, looser but still-strict check: https + IP-literal ban +
 *  credential ban. Private-network SSRF is a backend-fetch concern; the app
 *  only ever <img/>s these, but a hostile URL pointing at an intranet
 *  resource would still leak existence/timing through load behavior. */
const PRIVATE_HOST_RE =
  /^(localhost$|127\.|10\.|0\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|\[?::1\]?$)/i;

const MAX_RESULTS = 6;
const FETCH_TIMEOUT_MS = 6_000;
const CACHE_TTL_MS = 60 * 60 * 1_000;

interface CacheEntry {
  at: number;
  response: ImageSearchResponse;
}

@Injectable()
export class ImageSearchService {
  private readonly logger = new Logger(ImageSearchService.name);
  private readonly cache = new Map<string, CacheEntry>();

  async search(rawQuery: string, max = MAX_RESULTS): Promise<ImageSearchResponse> {
    const query = rawQuery?.trim().slice(0, 200);
    if (!query) return { provider: "wikimedia", results: [] };

    const cacheKey = `${this.provider}:${query.toLowerCase()}`;
    const hit = this.cache.get(cacheKey);
    if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.response;

    let response: ImageSearchResponse;
    try {
      response =
        this.provider === "serper"
          ? await this.searchSerper(query, max)
          : await this.searchWikimedia(query, max);
    } catch (err) {
      this.logger.warn(
        `Image search failed (${this.provider}): ${err instanceof Error ? err.message : String(err)}`,
      );
      // Honest empty — the chat renders "no images found" rather than erroring.
      return { provider: this.provider, results: [] };
    }

    this.cache.set(cacheKey, { at: Date.now(), response });
    if (this.cache.size > 500) {
      // Simple sweep: drop the oldest quarter.
      const keys = [...this.cache.entries()]
        .sort((a, b) => a[1].at - b[1].at)
        .slice(0, 125)
        .map(([k]) => k);
      for (const k of keys) this.cache.delete(k);
    }
    return response;
  }

  private get provider(): "wikimedia" | "serper" {
    return process.env.SERPER_API_KEY?.trim() ? "serper" : "wikimedia";
  }

  /** Wikimedia Commons — keyless, license metadata included. */
  private async searchWikimedia(
    query: string,
    max: number,
  ): Promise<ImageSearchResponse> {
    const params = new URLSearchParams({
      action: "query",
      format: "json",
      generator: "search",
      gsrsearch: `filetype:bitmap ${query}`,
      gsrnamespace: "6", // File:
      gsrlimit: String(Math.min(max * 2, 12)),
      prop: "imageinfo",
      iiprop: "url|size|extmetadata",
      iiurlwidth: "640",
      origin: "*",
    });
    const raw = await this.fetchJson<{
      query?: {
        pages?: Record<
          string,
          {
            title?: string;
            imageinfo?: {
              url?: string;
              thumburl?: string;
              thumbwidth?: number;
              descriptionurl?: string;
              width?: number;
              height?: number;
              extmetadata?: {
                LicenseShortName?: { value?: string };
                Artist?: { value?: string };
              };
            }[];
          }
        >;
      };
    }>(`https://commons.wikimedia.org/w/api.php?${params.toString()}`);

    const pages = Object.values(raw.query?.pages ?? {});
    const results: ImageSearchResult[] = [];
    for (const page of pages) {
      const info = page.imageinfo?.[0];
      if (!info?.url) continue;
      const sanitized = this.sanitize(info.url, true);
      const thumb = info.thumburl ? this.sanitize(info.thumburl, true) : null;
      if (!sanitized) continue;
      results.push({
        url: sanitized,
        thumbUrl: thumb ?? sanitized,
        title: (page.title ?? "").replace(/^File:/, "").replace(/\.[a-z]+$/i, ""),
        width: typeof info.width === "number" ? info.width : null,
        height: typeof info.height === "number" ? info.height : null,
        license: info.extmetadata?.LicenseShortName?.value?.slice(0, 60) ?? null,
        // Artist is HTML — strip tags for a plain-text credit line.
        credit: stripHtml(info.extmetadata?.Artist?.value ?? "").slice(0, 80) || null,
        sourceUrl: info.descriptionurl
          ? this.sanitize(info.descriptionurl, false) // page URL, not an image
          : null,
      });
      if (results.length >= max) break;
    }
    return { provider: "wikimedia", results };
  }

  /** Serper (Google Images) — when SERPER_API_KEY is configured. */
  private async searchSerper(
    query: string,
    max: number,
  ): Promise<ImageSearchResponse> {
    const raw = await this.fetchJson<{
      images?: {
        imageUrl?: string;
        thumbnailUrl?: string;
        title?: string;
        width?: number;
        height?: number;
        link?: string;
        source?: string;
      }[];
    }>("https://google.serper.dev/images", {
      method: "POST",
      headers: {
        "X-API-KEY": process.env.SERPER_API_KEY ?? "",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ q: query, num: Math.min(max * 2, 12) }),
    });

    const results: ImageSearchResult[] = [];
    for (const img of raw.images ?? []) {
      const url = this.sanitize(img.imageUrl ?? "", false);
      if (!url) continue;
      const thumb = img.thumbnailUrl ? this.sanitize(img.thumbnailUrl, false) : null;
      results.push({
        url,
        thumbUrl: thumb ?? url,
        title: img.title?.slice(0, 140) ?? "",
        width: typeof img.width === "number" ? img.width : null,
        height: typeof img.height === "number" ? img.height : null,
        license: null,
        credit: img.source?.slice(0, 80) ?? null,
        sourceUrl: img.link ? this.sanitize(img.link, false) : null,
      });
      if (results.length >= max) break;
    }
    return { provider: "serper", results };
  }

  /**
   * The one gate every URL passes before leaving this service. `strictHost`
   * (Wikimedia) requires the hostname allowlist; the loose mode (Serper,
   * open web) still bans non-https, credentials-in-URL, IP literals and
   * private-network hosts. Returns null for anything questionable.
   */
  private sanitize(rawUrl: string, strictHost: boolean): string | null {
    try {
      const u = new URL(rawUrl);
      if (u.protocol !== "https:") return null;
      if (u.username || u.password) return null;
      const host = u.hostname.toLowerCase();
      if (PRIVATE_HOST_RE.test(host)) return null;
      // A hostname made of pure digits + dots is an IPv4 literal even if the
      // regex above missed an odd form.
      if (/^[\d.]+$/.test(host)) return null;
      if (strictHost && !ALLOWED_IMAGE_HOSTS.includes(host)) return null;
      return u.toString();
    } catch {
      return null;
    }
  }

  private async fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      const res = await fetch(url, {
        ...init,
        signal: controller.signal,
        headers: {
          "User-Agent": "MatriqStudyApp/1.0 (educational; contact: tg matriq_waitlist)",
          ...(init?.headers ?? {}),
        },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return (await res.json()) as T;
    } finally {
      clearTimeout(timer);
    }
  }
}

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .trim();
}
