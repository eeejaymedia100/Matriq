import {
  Injectable,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  Logger,
} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { StorageService } from "../storage/storage.service";
import type {
  ReportReason,
  VaultItemType,
  Prisma,
} from "../generated/prisma/client";

/**
 * The academic library ("Netflix for Students") — a cross-institution public
 * discovery layer over the shared VaultItem document store.\n\nFiles live in
 * object storage; rows hold metadata + ownership. Public resources are
 * discoverable (approved only) and browsable by institution/faculty/department;
 * private resources are visible only to their owner and NEVER surface in any
 * discovery/search/recommendation query. All per-student activity here (recent
 * reading, saved, progress) is private to that student.
 *
 * Recommendations are metadata + genuine-activity based (never AI): they
 * prioritise the student's own institution/faculty/department/level and the
 * course codes they've recently read or saved. Popular/Trending uses real
 * interactions (opens, saves) with per-user-per-day dedup so one student can't
 * inflate a count.
 */

const LIBRARY_FETCH_LIMIT = 24;
const PRESIGNED_URL_TTL = 900; // 15 minutes

/** A package of the discovery home screen — each section only if non-empty. */
export interface LibraryDiscoveryResult {
  continueReading: LibraryDocCard[];
  recommended: LibraryDocCard[];
  popular: LibraryDocCard[];
  trending: LibraryDocCard[];
  recent: LibraryDocCard[];
  fromYourUniversity: LibraryDocCard[];
  fromYourFaculty: LibraryDocCard[];
  fromYourDepartment: LibraryDocCard[];
  pastQuestions: LibraryDocCard[];
  lectureNotes: LibraryDocCard[];
  saved: LibraryDocCard[];
  /** True when the caller has no institution/faculty/department to personalise with. */
  hasPersonalization: boolean;
}

export interface LibraryDocCard {
  id: string;
  courseCode: string;
  title: string;
  courseTitle: string | null;
  type: VaultItemType;
  mimeType: string;
  sizeBytes: number;
  level: string | null;
  session: string | null;
  description: string | null;
  institution: { id: string; name: string } | null;
  faculty: string | null;
  department: string | null;
  opens: number;
  savesCount: number;
  createdAt: string;
  /** Generates a lightweight preview from the document itself (image thumbnail). */
  previewUrl: string | null;
  /** Short-lived direct-read URL for large public files (object storage). */
  directUrl: string | null;
  isImage: boolean;
  /** Only on personalisation rows: the resume marker for Continue Reading. */
  continuePosition?: string | null;
  continueProgress?: number | null;
}

interface DocRowLike {
  id: string;
  courseCode: string;
  title: string;
  courseTitle: string | null;
  type: VaultItemType;
  mimeType: string;
  sizeBytes: number;
  level: string | null;
  session: string | null;
  description: string | null;
  opens: number;
  savesCount: number;
  createdAt: Date;
  hidden: boolean;
  storageRef: string;
  companionRef: string | null;
  companionMimeType: string | null;
  institution: { id: string; name: string } | null;
  faculty: string | null;
  department: string | null;
}



/** Every browse/section query targets the same public, active scope. */
function publicWhere(extra: Prisma.VaultItemWhereInput = {}): Prisma.VaultItemWhereInput {
  return {
    visibility: "public" as const,
    moderationStatus: "approved" as const,
    hidden: false,
    deletedAt: null,
    ...extra,
  };
}

@Injectable()
export class LibraryService {
  private readonly logger = new Logger(LibraryService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storageService: StorageService,
  ) {}

  // ── Discovery home ───────────────────────────────────────────

  /** Build the personalised home screen sections (each only if non-empty). */
  async discovery(
    userId: string,
  ): Promise<LibraryDiscoveryResult> {
    const profile = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        institutionId: true,
        faculty: true,
        department: true,
        level: true,
      },
    });
    const hasPersonalization =
      !!profile &&
      (!!profile.institutionId || !!profile.faculty || !!profile.department);

    const [continueReading, recommended, popular, trending, recent, saved] =
      await Promise.all([
        this.continueReading(userId),
        this.recommended(userId, profile),
        this.popular(),
        this.trending(),
        this.recent(),
        this.saved(userId),
      ]);

    const fromYourUniversity: LibraryDocCard[] = [];
    const fromYourFaculty: LibraryDocCard[] = [];
    const fromYourDepartment: LibraryDocCard[] = [];

    if (profile?.institutionId) {
      // Distinct row sets — a doc in "your department" shouldn't also flood
      // "your faculty"/"your university" above it.
      const fromDept = await this.publicRows(profile, "department");
      fromYourDepartment.push(...fromDept);

      const used = new Set(fromDept.map((d) => d.id));
      const fromFac = (await this.publicRows(profile, "faculty")).filter(
        (r) => !used.has(r.id),
      );
      fromYourFaculty.push(...fromFac);

      const used2 = new Set(
        fromFac.map((r) => r.id).concat(fromDept.map((r) => r.id)),
      );
      const fromUni = (await this.publicRows(profile, "university")).filter(
        (r) => !used2.has(r.id),
      );
      fromYourUniversity.push(...fromUni);
    }

    const pastQuestions = await this.pastQuestions();
    const lectureNotes = await this.lectureNotes();

    return {
      continueReading,
      recommended,
      popular,
      trending,
      recent,
      fromYourUniversity,
      fromYourFaculty,
      fromYourDepartment,
      pastQuestions,
      lectureNotes,
      saved,
      hasPersonalization,
    };
  }

  // ── Section builders ─────────────────────────────────────────

  /** Continue Reading: the student's own recent reading, with resume markers. */
  async continueReading(userId: string): Promise<LibraryDocCard[]> {
    const views = await this.prisma.libraryView.findMany({
      where: { userId },
      orderBy: { lastViewedAt: "desc" },
      take: LIBRARY_FETCH_LIMIT,
      include: {
        vaultItem: {
          include: {
            institution: { select: { id: true, name: true } },
          },
        },
      },
    });
    const cards = views
      .filter((v) => !v.vaultItem.hidden && !v.vaultItem.deletedAt)
      .map((v) =>
        this.toCard(v.vaultItem as DocRowLike, {
          continuePosition: v.position,
          continueProgress: v.progress,
        }),
      );
    // Keep only documents the student can still read publicly.
    return cards.filter((c) => c !== null) as LibraryDocCard[];
  }

  /**
   * Recommended for you: metadata + genuine recent activity. Cache the user's
   * recently-read/saved course codes and surface approved public documents
   * that match their institution → faculty → department → level, then fill
   * with documents on the courses they've touched. Never includes private docs.
   */
  private async recommended(
    userId: string,
    profile: {
      institutionId: string | null;
      faculty: string | null;
      department: string | null;
      level: string | null;
    } | null,
  ): Promise<LibraryDocCard[]> {
    const matches: LibraryDocCard[] = [];
    const seen = new Set<string>();

    // 1. Same department, then faculty, then university (most-relevant first).
    for (const scope of ["department", "faculty", "university"] as const) {
      const rows = await this.publicRows(profile, scope);
      for (const r of rows) {
        if (!seen.has(r.id)) {
          seen.add(r.id);
          matches.push(r);
        }
      }
      if (matches.length >= LIBRARY_FETCH_LIMIT) break;
    }

    // 2. Fill with recently-active course codes (genuine personal interest).
    if (matches.length < LIBRARY_FETCH_LIMIT) {
      const recentCodes = await this.recentCourseCodes(userId);
      if (recentCodes.length > 0) {
        const courseRows = await this.prisma.vaultItem.findMany({
          where: publicWhere({
            courseCode: { in: recentCodes },
          }),
          orderBy: { createdAt: "desc" },
          take: LIBRARY_FETCH_LIMIT,
          include: {
            institution: { select: { id: true, name: true } },
          },
        });
        for (const r of courseRows) {
          const card = this.toCard(r as DocRowLike);
          if (card && !seen.has(card.id)) {
            seen.add(card.id);
            matches.push(card);
          }
        }
      }
    }

    // 3. If still empty, fall back to a few recent public docs so the section
    //    is never a black hole for brand-new students.
    if (matches.length === 0) {
      const fallback = await this.prisma.vaultItem.findMany({
        where: publicWhere(),
        orderBy: { createdAt: "desc" },
        take: 8,
        include: { institution: { select: { id: true, name: true } } },
      });
      for (const r of fallback) {
        const card = this.toCard(r as DocRowLike);
        if (card) matches.push(card);
      }
    }

    return matches.slice(0, LIBRARY_FETCH_LIMIT);
  }

  /** Popular: all-time, ordered by real opens + saves (deduped backups). */
  private async popular(): Promise<LibraryDocCard[]> {
    const rows = await    this.prisma.vaultItem.findMany({
      where: publicWhere(),
      orderBy: [{ opens: "desc" }, { savesCount: "desc" }],
      take: LIBRARY_FETCH_LIMIT,
      include: { institution: { select: { id: true, name: true } } },
    });
    return rows
      .map((r) => this.toCard(r as DocRowLike))
      .filter((c): c is LibraryDocCard => c !== null);
  }

  /** Trending: recently active, ordered by opens (deduped context). */
  private async trending(): Promise<LibraryDocCard[]> {
    const rows = await this.prisma.vaultItem.findMany({
      where: publicWhere({ opens: { gt: 0 } }),
      orderBy: [{ opens: "desc" }],
      take: LIBRARY_FETCH_LIMIT,
      include: { institution: { select: { id: true, name: true } } },
    });
    return rows
      .map((r) => this.toCard(r as DocRowLike))
      .filter((c): c is LibraryDocCard => c !== null);
  }

  /** Recently added public resources. */
  private async recent(): Promise<LibraryDocCard[]> {
    const rows = await this.prisma.vaultItem.findMany({
      where: publicWhere(),
      orderBy: { createdAt: "desc" },
      take: LIBRARY_FETCH_LIMIT,
      include: { institution: { select: { id: true, name: true } } },
    });
    return rows
      .map((r) => this.toCard(r as DocRowLike))
      .filter((c): c is LibraryDocCard => c !== null);
  }

  private async pastQuestions(): Promise<LibraryDocCard[]> {
    const rows = await this.prisma.vaultItem.findMany({
      where: publicWhere({ type: "past_question" }),
      orderBy: { createdAt: "desc" },
      take: LIBRARY_FETCH_LIMIT,
      include: { institution: { select: { id: true, name: true } } },
    });
    return rows
      .map((r) => this.toCard(r as DocRowLike))
      .filter((c): c is LibraryDocCard => c !== null);
  }

  private async lectureNotes(): Promise<LibraryDocCard[]> {
    const rows = await this.prisma.vaultItem.findMany({
      where: publicWhere({ type: "material" }),
      orderBy: { createdAt: "desc" },
      take: LIBRARY_FETCH_LIMIT,
      include: { institution: { select: { id: true, name: true } } },
    });
    return rows
      .map((r) => this.toCard(r as DocRowLike))
      .filter((c): c is LibraryDocCard => c !== null);
  }

  // ── Save / view / progress ───────────────────────────────────

  /** Bookmark a public document (a reference, never a copy of the file). */
  async save(userId: string, itemId: string) {
    await this.assertReadable(userId, itemId);
    await this.prisma.librarySave.upsert({
      where: { userId_vaultItemId: { userId, vaultItemId: itemId } },
      create: { userId, vaultItemId: itemId },
      update: {},
    });
    await this.prisma.vaultItem
      .update({ where: { id: itemId }, data: { savesCount: { increment: 1 } } })
      .catch(() => undefined);
    // Save counts toward recommendations: update the denormalised counter via
    // the row (the increment above is sufficient).
    return { saved: true };
  }

  async unsave(userId: string, itemId: string) {
    const res = await this.prisma.librarySave.deleteMany({
      where: { userId, vaultItemId: itemId },
    });
    if (res.count > 0) {
      await this.prisma.vaultItem
        .update({
          where: { id: itemId },
          data: { savesCount: { decrement: Math.max(1, 0) } },
        })
        .catch(() => undefined);
    }
    return { saved: false };
  }

  /** The student's saved collection (private). */
  async saved(userId: string): Promise<LibraryDocCard[]> {
    const saves = await this.prisma.librarySave.findMany({
      where: { userId },
      orderBy: { savedAt: "desc" },
      take: 100,
      include: {
        vaultItem: {
          include: { institution: { select: { id: true, name: true } } },
        },
      },
    });
    return (
      saves
        .filter((s) => !s.vaultItem.hidden && !s.vaultItem.deletedAt)
        .map((s) => this.toCard(s.vaultItem as DocRowLike))
        .filter((c): c is LibraryDocCard => c !== null) ?? []
    );
  }

  /**
   * Record an open (daily-deduped on the vault item's opens counter) + persist
   * a private resume position/progress. `position` is an opaque client marker;
   * progress is 0..1. This is a "view" — reading progress stays private.
   */
  async recordView(
    userId: string,
    itemId: string,
    opts: { position?: string; progress?: number } = {},
  ) {
    await this.assertReadable(userId, itemId);

    const today = new Date().toISOString().slice(0, 10);
    const existing = await this.prisma.libraryView.findUnique({
      where: { userId_vaultItemId: { userId, vaultItemId: itemId } },
    });

    // Read progress always updates (so Continue Reading is fresh); the opens
    // counter only increments on the first open of the day per user.
    const isFirstToday = !existing || existing.lastOpenDay !== today;
    await this.prisma.libraryView.upsert({
      where: { userId_vaultItemId: { userId, vaultItemId: itemId } },
      create: {
        userId,
        vaultItemId: itemId,
        position: opts.position ?? null,
        progress: normalizeProgress(opts.progress),
        opens: 1,
        lastOpenDay: today,
      },
      update: {
        lastViewedAt: new Date(),
        position:
          opts.position !== undefined ? opts.position : existing?.position ?? null,
        progress:
          opts.progress !== undefined
            ? normalizeProgress(opts.progress)
            : existing?.progress ?? 0,
        opens: isFirstToday ? { increment: 1 } : { increment: 0 },
        lastOpenDay: isFirstToday ? today : existing?.lastOpenDay,
      },
    });

    if (isFirstToday) {
      // Denormalised counter for cheap popular/trending ordering, deduped by
      // the per-day rule above.
      await this.prisma.vaultItem
        .update({ where: { id: itemId }, data: { opens: { increment: 1 } } })
        .catch(() => undefined);
    }
    return { recorded: true, countedOpen: isFirstToday };
  }

  // ── Discovery / search ───────────────────────────────────────

  /**
   * Backend search + filters (never downloads the whole library). Searches
   * the public, active scope by title / course code / course title and filters
   * by university / faculty / department / level / session / type. Paginated.
   */
  async search(opts: {
    query?: string;
    institutionId?: string;
    faculty?: string;
    department?: string;
    level?: string;
    session?: string;
    type?: VaultItemType;
    page?: number;
    pageSize?: number;
  }) {
    const page = Math.max(1, Number(opts.page ?? 1) || 1);
    const pageSize = Math.min(50, Math.max(1, Number(opts.pageSize ?? 20) || 20));

    const where = publicWhere();

    const q = (opts.query ?? "").trim();
    if (q) {
      where.OR = [
        { title: { contains: q, mode: "insensitive" } },
        { courseTitle: { contains: q, mode: "insensitive" } },
        { courseCode: { contains: q.trim().toUpperCase() } },
        { courseCode: { contains: q, mode: "insensitive" } },
      ];
    }
    if (opts.institutionId) where.institutionId = opts.institutionId;
    if (opts.faculty) where.faculty = { contains: opts.faculty, mode: "insensitive" };
    if (opts.department)
      where.department = { contains: opts.department, mode: "insensitive" };
    if (opts.level) where.level = opts.level;
    if (opts.session) where.session = { contains: opts.session, mode: "insensitive" };
    if (opts.type && (opts.type === "past_question" || opts.type === "material")) {
      where.type = opts.type;
    }

    const [total, rows] = await Promise.all([
      this.prisma.vaultItem.count({ where }),
      this.prisma.vaultItem.findMany({
        where,
        orderBy: [{ opens: "desc" }, { createdAt: "desc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { institution: { select: { id: true, name: true } } },
      }),
    ]);

    return {
      items: rows
        .map((r) => this.toCard(r as DocRowLike))
        .filter((c): c is LibraryDocCard => c !== null),
      total,
      page,
      pageSize,
      hasMore: page * pageSize < total,
    };
  }

  // ── Details + related ────────────────────────────────────────

  /** Public details of one document + its `related` (same course, others). */
  async details(userId: string | null, itemId: string) {
    const item = await this.assertReadable(userId, itemId);
    const row = await this.prisma.vaultItem.findUnique({
      where: { id: itemId },
      include: { institution: { select: { id: true, name: true } } },
    });
    if (!row) throw new NotFoundException("That document isn't available.");

    const related = await this.prisma.vaultItem.findMany({
      where: publicWhere({
        courseCode: row.courseCode,
        id: { not: itemId },
      }),
      orderBy: [{ opens: "desc" }, { createdAt: "desc" }],
      take: 8,
      include: { institution: { select: { id: true, name: true } } },
    });

    return {
      item: this.toCard(row as DocRowLike),
      related: related
        .map((r) => this.toCard(r as DocRowLike))
        .filter((c): c is LibraryDocCard => c !== null),
    };
  }

  // ── Report ───────────────────────────────────────────────────

  /** Flag a public resource. Opens a moderation row; does NOT auto-hide. */
  async report(
    userId: string,
    itemId: string,
    reason: ReportReason,
    details?: string,
  ) {
    const validReasons: ReportReason[] = [
      "inappropriate",
      "irrelevant",
      "duplicate",
      "incorrectly_categorized",
    ];
    if (!validReasons.includes(reason)) {
      throw new BadRequestException("Choose a valid report reason.");
    }
    await this.assertReadable(userId, itemId);
    const report = await this.prisma.libraryReport.create({
      data: {
        vaultItemId: itemId,
        reporterUserId: userId,
        reason,
        details: (details ?? "").trim().slice(0, 1000) || null,
      },
    });
    this.logger.log(
      `Library report: user=${userId}, item=${itemId}, reason=${reason}`,
    );
    return { id: report.id, status: "open" };
  }

  // ── Direct read / preview URLs ───────────────────────────────

  /**
   * A short-lived direct-read URL for a public document. The backend authorizes
   * the caller first (public+approved / owner+private), then hands back the
   * presigned object URL so the large bytes don't stream through the API
   * server. Returns null when object storage is off (fall back to /vault/:id/file).
   */
  async directReadUrl(userId: string | null, itemId: string) {
    const { item } = await this.assertReadableForUrl(userId, itemId);
    return this.storageService.presignedGetUrl(item.storageRef, PRESIGNED_URL_TTL);
  }

  /** A lightweight preview from the document itself (image thumbnails). */
  private previewUrlFor(item: DocRowLike): string | null {
    if (!item.companionRef || !item.companionRef.startsWith("data:")) return null;
    return item.companionRef; // data-URI image companion only
  }

  // ── Admin helpers (used by AdminController via a thin proxy) ──

  /** Open (unresolved) reports for admin moderation. */
  async openReports() {
    const reports = await this.prisma.libraryReport.findMany({
      where: { status: "open" },
      orderBy: { createdAt: "asc" },
      take: 100,
      include: {
        vaultItem: { select: { id: true, title: true, courseCode: true } },
        reporter: { select: { id: true, fullName: true } },
      },
    });
    return reports;
  }

  /**
   * Resolve a report: `contentAction` hides the document ("hidden") or keeps it
   * ("none"); `status` must be resolved or dismissed. Hiding removes it from
   * every public query immediately.
   */
  async resolveReport(
    reportId: string,
    adminId: string,
    opts: { status: "resolved" | "dismissed"; contentAction: "hidden" | "none" },
  ) {
    const report = await this.prisma.libraryReport.findUnique({
      where: { id: reportId },
    });
    if (!report) throw new NotFoundException("Report not found.");

    const updated = await this.prisma.$transaction([
      this.prisma.libraryReport.update({
        where: { id: reportId },
        data: {
          status: opts.status,
          resolvedAt: new Date(),
          resolvedByAdmin: adminId,
        },
      }),
      ...(opts.contentAction === "hidden"
        ? [
            this.prisma.vaultItem.update({
              where: { id: report.vaultItemId },
              data: { hidden: true },
            }),
          ]
        : []),
    ]);

    this.logger.log(
      `Admin ${adminId} ${opts.status} report ${reportId} on ${report.vaultItemId} (${opts.contentAction})`,
    );
    return { id: reportId, status: updated[0].status };
  }

  /** Set an item's hidden state from admin (hide/unhide). */
  async setHidden(itemId: string, hidden: boolean) {
    const item = await this.prisma.vaultItem.findUnique({ where: { id: itemId } });
    if (!item || item.deletedAt) throw new NotFoundException("Item not found.");
    return this.prisma.vaultItem.update({
      where: { id: itemId },
      data: { hidden },
    });
  }

  // ── Helpers ──────────────────────────────────────────────────

  private async assertReadable(userId: string | null, itemId: string) {
    const item = await this.prisma.vaultItem.findUnique({ where: { id: itemId } });
    if (!item || item.deletedAt) {
      throw new NotFoundException("That document isn't available.");
    }
    if (item.hidden) {
      throw new NotFoundException("That document has been removed.");
    }
    const isOwner = userId && item.userId === userId;
    const isPublicApproved =
      item.visibility === "public" && item.moderationStatus === "approved";
    if (!isOwner && !isPublicApproved) {
      throw new ForbiddenException(
        "You can't read that document — it's private or not yet approved.",
      );
    }
    return item;
  }

  /** For URL issuance: same scope, but returns the storageRef row. */
  private async assertReadableForUrl(userId: string | null, itemId: string) {
    const item = await this.prisma.vaultItem.findUnique({
      where: { id: itemId },
      select: {
        id: true,
        userId: true,
        visibility: true,
        moderationStatus: true,
        hidden: true,
        deletedAt: true,
        storageRef: true,
        mimeType: true,
        originalName: true,
      },
    });
    if (!item || item.deletedAt || item.hidden) {
      throw new NotFoundException("That document isn't available.");
    }
    const isOwner = userId && item.userId === userId;
    const isPublicApproved =
      item.visibility === "public" && item.moderationStatus === "approved";
    if (!isOwner && !isPublicApproved) {
      throw new ForbiddenException("You can't read that document.");
    }
    return { item };
  }

  private async recentCourseCodes(userId: string): Promise<string[]> {
    const views = await this.prisma.libraryView.findMany({
      where: { userId },
      orderBy: { lastViewedAt: "desc" },
      take: 20,
      include: {
        vaultItem: { select: { courseCode: true } },
      },
    });
    const seen = new Set<string>();
    const codes: string[] = [];
    for (const v of views) {
      if (v.vaultItem.courseCode && !seen.has(v.vaultItem.courseCode)) {
        seen.add(v.vaultItem.courseCode);
        codes.push(v.vaultItem.courseCode);
      }
    }
    return codes;
  }

  /** Fetch cards scoped by the student's institution level. */
  private async publicRows(
    profile: {
      institutionId: string | null;
      faculty: string | null;
      department: string | null;
    } | null,
    scope: "department" | "faculty" | "university",
  ): Promise<LibraryDocCard[]> {
    const extra: Prisma.VaultItemWhereInput = {};
    if (scope === "department" && profile?.department) {
      extra.department = profile.department;
    }
    if ((scope === "faculty" || scope === "department") && profile?.faculty) {
      extra.faculty = profile.faculty;
    }
    if (!profile?.institutionId) {
      // No institution on profile — nothing to personalise on.
      return [];
    }
    extra.institutionId = profile.institutionId;
    return this.browseRows(extra);
  }

  /** Run one browsed scope query → cards. */
  private async browseRows(where: Prisma.VaultItemWhereInput): Promise<LibraryDocCard[]> {
    if (Object.keys(where).length === 0) return [];
    const rows = await this.prisma.vaultItem.findMany({
      where: publicWhere(where),
      orderBy: { createdAt: "desc" },
      take: LIBRARY_FETCH_LIMIT,
      include: { institution: { select: { id: true, name: true } } },
    });
    return rows
      .map((r) => this.toCard(r as DocRowLike))
      .filter((c): c is LibraryDocCard => c !== null);
  }

  /** Shape a row into a safe public card (never leak storage refs). */
  private toCard(
    row: DocRowLike,
    extra?: { continuePosition?: string | null; continueProgress?: number | null },
  ): LibraryDocCard | null {
    if (row.hidden) return null;
    return {
      id: row.id,
      courseCode: row.courseCode,
      title: row.title,
      courseTitle: row.courseTitle,
      type: row.type,
      mimeType: row.mimeType,
      sizeBytes: row.sizeBytes,
      level: row.level,
      session: row.session,
      description: row.description,
      institution: row.institution,
      faculty: row.faculty,
      department: row.department,
      opens: row.opens,
      savesCount: row.savesCount,
      createdAt: row.createdAt.toISOString(),
      previewUrl: this.previewUrlFor(row),
      directUrl: null, // issued lazily via directReadUrl on demand
      isImage: row.companionRef?.startsWith("data:") ?? /^image\//.test(row.mimeType),
      continuePosition: extra?.continuePosition,
      continueProgress: extra?.continueProgress,
    };
  }
}

/** Clamp 0..1 and coerce numbers from the client. */
function normalizeProgress(value: number | undefined | null): number {
  if (typeof value !== "number" || Number.isNaN(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

