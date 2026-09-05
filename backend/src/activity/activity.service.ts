import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

/**
 * ActivityService — the server-authoritative record of *meaningful* activity.
 *
 * Every event lands in the activity journal as (userId, kind, eventKey,
 * activityDate). The unique (userId, eventKey) constraint makes journaling
 * idempotent: retries, double-taps, replays, app re-syncs and racing clients
 * can never double-credit an action. A day only counts toward streaks when it
 * has at least one journal entry — app launches are never journaled, so they
 * can never build a streak.
 *
 * Event keys are built from the natural id of the underlying record
 * (e.g. the Focus session id), so re-delivering the same event lands on the
 * same key and is a no-op by construction.
 */
export type ActivityKind =
  | "focus_map"
  | "mastery_pass"
  | "note_create"
  | "task_complete"
  | "upload"
  | "library_save"
  | "ai_generation"
  | "deep_read"
  | "referral_verified";

export const ACTIVITY_KINDS: ActivityKind[] = [
  "focus_map",
  "mastery_pass",
  "note_create",
  "task_complete",
  "upload",
  "library_save",
  "ai_generation",
  "deep_read",
  "referral_verified",
];

export const ACTIVITY_KIND_SET = new Set<string>(ACTIVITY_KINDS);

/** Floor of a UTC day: everything a student does today journals to midnight-UTC. */
export function utcDayFloor(d: Date = new Date()): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

@Injectable()
export class ActivityService {
  private readonly logger = new Logger(ActivityService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Journal one meaningful activity. Idempotent: replaying the same
   * naturalId for the same user is a no-op (unique constraint + catch).
   * Returns true when the entry was actually created.
   */
  async journal(
    userId: string,
    kind: ActivityKind,
    naturalId: string,
    date: Date = new Date(),
  ): Promise<boolean> {
    const eventKey = `${kind}:${naturalId}`.slice(0, 220);
    try {
      await this.prisma.activityJournalEntry.create({
        data: {
          userId,
          kind,
          eventKey,
          activityDate: utcDayFloor(date),
        },
      });
      return true;
    } catch (err: unknown) {
      // Unique violation (P2002) = already journaled. Quiet no-op.
      if (
        typeof err === "object" &&
        err !== null &&
        (err as { code?: string }).code === "P2002"
      ) {
        return false;
      }
      this.logger.warn(
        `Activity journal write failed (user=${userId}, kind=${kind}): ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      return false;
    }
  }

  /**
   * Journal a batch of events (used by the client-sync endpoint for
   * on-device notes/tasks). `createdMany` is skipped entirely when nothing
   * is new, so the common case (nothing changed) costs one bulk insert.
   * Returns the number of newly journaled entries.
   */
  async journalMany(
    userId: string,
    events: Array<{ kind: ActivityKind; naturalId: string }>,
  ): Promise<number> {
    const seen = new Set<string>();
    const rows: Array<{
      userId: string;
      kind: ActivityKind;
      eventKey: string;
      activityDate: Date;
    }> = [];
    const now = utcDayFloor();
    for (const e of events) {
      if (!ACTIVITY_KIND_SET.has(e.kind)) continue;
      const naturalId = String(e.naturalId ?? "").trim().slice(0, 180);
      if (!naturalId) continue;
      const key = `${e.kind}:${naturalId}`;
      if (seen.has(key)) continue; // duplicates inside one payload
      seen.add(key);
      rows.push({ userId, kind: e.kind, eventKey: key, activityDate: now });
    }
    if (rows.length === 0) return 0;
    try {
      const res = await this.prisma.activityJournalEntry.createMany({
        data: rows,
        skipDuplicates: true,
      });
      return res.count;
    } catch (err: unknown) {
      this.logger.warn(
        `Activity journal batch write failed (user=${userId}): ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      return 0;
    }
  }

  /** All distinct UTC calendar days with journal entries, ascending. */
  async activityDays(userId: string): Promise<Date[]> {
    const rows = await this.prisma.activityJournalEntry.findMany({
      where: { userId },
      select: { activityDate: true },
      distinct: ["activityDate"],
      orderBy: { activityDate: "asc" },
    });
    return rows.map((r) => r.activityDate);
  }

  /** Current streak (and best streak) in days, computed from journal days. */
  async streakInfo(
    userId: string,
  ): Promise<{ current: number; best: number }> {
    const days = await this.activityDays(userId);
    if (days.length === 0) return { current: 0, best: 0 };

    const daySet = new Set(days.map((d) => utcDayFloor(d).getTime()));
    // Walk backwards from today; if today has no entry yet, a streak that
    // ended yesterday still counts as "current" (the day isn't over).
    const today = utcDayFloor().getTime();
    const ONE_DAY = 86_400_000;
    let cursor = daySet.has(today)
      ? today
      : today - ONE_DAY;
    let current = 0;
    while (daySet.has(cursor)) {
      current += 1;
      cursor -= ONE_DAY;
    }

    let best = 0;
    let run = 0;
    for (const d of days) {
      const t = utcDayFloor(d).getTime();
      run = daySet.has(t - ONE_DAY) ? run + 1 : 1;
      if (run > best) best = run;
    }
    // The ascending `days` array is already a set of distinct dates.
    return { current, best: Math.max(best, current) };
  }

  /** Distinct kinds with at least one entry — cheap "has any activity" check. */
  async kindCounts(userId: string, kinds: ActivityKind[]): Promise<number> {
    if (kinds.length === 0) return 0;
    return this.prisma.activityJournalEntry.count({
      where: { userId, kind: { in: kinds } },
    });
  }

  /** Count of entries of one kind (distinct events, not days). */
  async countByKind(userId: string, kind: ActivityKind): Promise<number> {
    return this.prisma.activityJournalEntry.count({
      where: { userId, kind },
    });
  }
}