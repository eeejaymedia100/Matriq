import { useEffect, useState } from "react";
import { api } from "../api/client";
import { getItem, setItem } from "./storage";
import { SEED_FACTS, type Fact } from "./facts";

/**
 * Dynamic "did you know" facts (round-2 QA §8).
 *
 * Rules from the spec:
 *  - facts are generated in a batch (server-side via Gemini, /ai/facts) and
 *    rotated client-side — never called live on a timer;
 *  - refresh happens on a daily cadence (or effectively "on new material",
 *    since the batch is course-agnostic until we wire course context);
 *  - seed facts keep the card alive offline / before the first fetch.
 */
const FACTS_CACHE_KEY = "daily_facts_cache_v1";
const REFRESH_MS = 24 * 60 * 60 * 1000;

interface FactsCache {
  facts: Fact[];
  fetchedAt: number;
}

export function useDailyFacts(): Fact[] {
  const [facts, setFacts] = useState<Fact[]>(SEED_FACTS);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      let cached: FactsCache | null = null;
      try {
        const raw = await getItem(FACTS_CACHE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw) as FactsCache;
          if (Array.isArray(parsed.facts) && parsed.facts.length > 0) {
            cached = parsed;
            if (!cancelled) setFacts(parsed.facts);
          }
        }
      } catch {
        // Corrupt cache — ignore and refresh below.
      }

      const stale =
        !cached || Date.now() - cached.fetchedAt > REFRESH_MS;
      if (!stale) return;

      try {
        const data = await api.post<{ facts: Fact[]; source: string }>(
          "/ai/facts",
          { count: 8 },
        );
        if (data?.facts?.length && !cancelled) {
          setFacts(data.facts);
          await setItem(
            FACTS_CACHE_KEY,
            JSON.stringify({ facts: data.facts, fetchedAt: Date.now() }),
          ).catch(() => {});
        }
      } catch {
        // Offline / server error — keep whatever we have.
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  return facts;
}
