import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  Logger,
} from "@nestjs/common";
import * as argon2 from "argon2";
import { PrismaService } from "../prisma/prisma.service";
import { Prisma, VerificationStatus } from "../generated/prisma/client";
import { AuditService } from "../audit/audit.service";
import { AiService } from "../ai/ai.service";
import { VaultService } from "../vault/vault.service";
import { InAppNotificationsService } from "../notifications/in-app.service";
import { InstitutionsService } from "../institutions/institutions.service";

@Injectable()
export class AdminService {
  private readonly logger = new Logger(AdminService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly aiService: AiService,
    private readonly inAppNotificationsService: InAppNotificationsService,
    private readonly institutionsService: InstitutionsService,
    private readonly vaultService: VaultService,
  ) {}

  /**
   * List all associations (including suspended).
   */
  async listAssociations(cursor?: string, take = 20) {
    const [associations, total] = await Promise.all([
      this.prisma.association.findMany({
        take: take + 1,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        orderBy: { createdAt: "desc" },
        include: {
          _count: { select: { memberships: true, fees: true } },
          executives: {
            include: { user: { select: { fullName: true, email: true } } },
          },
        },
      }),
      this.prisma.association.count(),
    ]);

    const hasMore = associations.length > take;
    const items = hasMore ? associations.slice(0, take) : associations;
    const nextCursor = hasMore ? items[items.length - 1].id : null;

    return {
      associations: items.map((a) => ({
        id: a.id,
        name: a.name,
        shortCode: a.shortCode,
        faculty: a.faculty,
        department: a.department ?? null,
        institutionId: a.institutionId,
        hasLogin: Boolean(a.passwordHash),
        loginEmail: a.email ?? null,
        status: a.status,
        memberCount: a._count.memberships,
        feeCount: a._count.fees,
        executives: a.executives.map((e) => ({
          id: e.id,
          role: e.role,
          name: e.user?.fullName || null,
          email: e.user?.email || null,
        })),
        createdAt: a.createdAt,
      })),
      pagination: { cursor: nextCursor, hasMore, total },
    };
  }

  /**
   * Create a new association with optional institution/faculty/department
   * targeting, association login credentials, and auto-membership + notification
   * fan-out to matching students.
   */
  async createAssociation(
    dto: {
      name: string;
      shortCode: string;
      institutionId?: string;
      faculty: string;
      department?: string;
      whatsappNumber?: string;
      email?: string;
      password?: string;
    },
    adminId: string,
    ipAddress: string,
  ) {
    // Hash association login password if provided.
    let passwordHash: string | undefined;
    if (dto.email && dto.password) {
      const existing = await this.prisma.association.findUnique({
        where: { email: dto.email.toLowerCase().trim() },
      });
      if (existing) {
        throw new ConflictException(
          "An association with this login email already exists",
        );
      }
      passwordHash = await argon2.hash(dto.password, {
        type: argon2.argon2id,
        memoryCost: 65536,
        timeCost: 3,
        parallelism: 4,
      });
    }

    const association = await this.prisma.association.create({
      data: {
        name: dto.name,
        shortCode: dto.shortCode.toUpperCase(),
        institutionId: dto.institutionId || null,
        faculty: dto.faculty,
        department: dto.department || null,
        whatsappNumber: dto.whatsappNumber || "",
        email: dto.email?.toLowerCase().trim() || null,
        passwordHash: passwordHash || null,
      },
    });

    await this.auditService.log({
      actorType: "admin",
      actorId: adminId,
      action: "association.created",
      targetType: "association",
      targetId: association.id,
      ipAddress,
      metadata: {
        name: association.name,
        shortCode: association.shortCode,
        institutionId: dto.institutionId || null,
        faculty: dto.faculty,
        department: dto.department || null,
        hasLogin: Boolean(dto.email),
      },
    });

    this.logger.log(
      `Admin ${adminId} created association: ${association.name} (faculty=${association.faculty}, department=${association.department || "faculty-wide"}, institution=${dto.institutionId || "none"})`,
    );

    // ── Auto-membership + notifications for matching students ─────
    // When an association is scoped to a specific institution + faculty
    // (and optionally department), find all registered users matching that
    // scope and auto-add them as live members, then notify them.
    if (dto.institutionId) {
      void this.autoEnrollAndNotify(
        association.id,
        dto.institutionId,
        dto.faculty,
        dto.department,
      );
    }

    return {
      id: association.id,
      name: association.name,
      shortCode: association.shortCode,
      faculty: association.faculty,
      department: association.department,
      institutionId: association.institutionId,
      hasLogin: Boolean(association.passwordHash),
      status: association.status,
    };
  }

  /**
   * Auto-enroll matching students into a newly created association and send
   * them an in-app notification that dues are now available. Fire-and-forget.
   */
  private async autoEnrollAndNotify(
    associationId: string,
    institutionId: string,
    faculty: string,
    department?: string | null,
  ): Promise<void> {
    try {
      const userWhere: Record<string, unknown> = {
        institutionId,
        faculty,
        ...(department ? { department } : {}),
        deletedAt: null,
        emailVerified: true,
      };

      const users = await this.prisma.user.findMany({
        where: userWhere as Prisma.UserWhereInput,
        select: { id: true },
      });

      if (users.length === 0) {
        this.logger.log(
          `No matching users for association ${associationId} auto-enrollment.`,
        );
        return;
      }

      // Batch-upsert memberships as `live`.
      const membershipData = users.map((u) => ({
        userId: u.id,
        associationId,
        status: "live" as const,
      }));

      for (const row of membershipData) {
        await this.prisma.membership.upsert({
          where: {
            userId_associationId: {
              userId: row.userId,
              associationId: row.associationId,
            },
          },
          create: row,
          update: { status: "live" },
        });
      }

      this.logger.log(
        `Auto-enrolled ${users.length} users into association ${associationId}`,
      );

      // Notify them that they can now pay dues.
      void this.inAppNotificationsService.createForUsers(
        users.map((u) => u.id),
        {
          title: "You can now pay your dues!",
          body: `Your faculty association is now on Matriq. Open the app to pay your dues and get your e-receipt instantly.`,
          type: "dues",
          link: "Fees",
        },
      );
    } catch (err) {
      this.logger.warn(
        `Auto-enrollment for association ${associationId} failed (not critical): ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  /**
   * Suspend or reactivate an association.
   */
  async updateAssociationStatus(id: string, status: "active" | "suspended") {
    const association = await this.prisma.association.findUnique({
      where: { id },
    });
    if (!association) throw new NotFoundException("Association not found");

    const updated = await this.prisma.association.update({
      where: { id },
      data: { status },
    });

    this.logger.log(
      `Admin changed association ${association.name} status to ${status}`,
    );

    return {
      id: updated.id,
      name: updated.name,
      previousStatus: association.status,
      newStatus: updated.status,
    };
  }

  /**
   * Cross-association analytics overview (spec §1). Returns a single shape
   * the admin console renders directly: headline counts, per-association
   * breakdown, most-active courses and Vault contribution activity.
   */
  async getAnalytics() {
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const monthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const [
      totalStudents,
      totalAssociations,
      activeAssociations,
      totalPayments,
      successfulPayments,
      totalCollected,
      courses,
      vaultTotal,
      vaultPending,
      vaultThisWeek,
      signupsLast7Days,
      signupsLast30Days,
      signupRows,
      associations,
    ] = await Promise.all([
      this.prisma.user.count({ where: { deletedAt: null } }),
      this.prisma.association.count(),
      this.prisma.association.count({ where: { status: "active" } }),
      this.prisma.payment.count(),
      this.prisma.payment.count({ where: { status: "successful" } }),
      this.prisma.payment.aggregate({
        where: { status: "successful" },
        _sum: { amountKobo: true },
      }),
      // Most-active courses: uploads + downloads per course code.
      this.prisma.vaultItem.groupBy({
        by: ["courseCode"],
        where: { deletedAt: null },
        _count: { _all: true },
        _sum: { downloads: true },
      }),
      this.prisma.vaultItem.count({ where: { deletedAt: null } }),
      this.prisma.vaultItem.count({
        where: { deletedAt: null, moderationStatus: "pending" },
      }),
      this.prisma.vaultItem.count({
        where: { deletedAt: null, createdAt: { gte: weekAgo } },
      }),
      // Active-user trend / growth over time (spec §1): signups in the
      // last 7 and 30 days plus a 6-week series for the trend card.
      this.prisma.user.count({
        where: { deletedAt: null, createdAt: { gte: weekAgo } },
      }),
      this.prisma.user.count({
        where: { deletedAt: null, createdAt: { gte: monthAgo } },
      }),
      this.prisma.user.findMany({
        where: {
          deletedAt: null,
          createdAt: { gte: new Date(Date.now() - 42 * 24 * 60 * 60 * 1000) },
        },
        select: { createdAt: true },
      }),
      this.prisma.association.findMany({
        where: { status: "active" },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          name: true,
          shortCode: true,
          status: true,
          _count: { select: { memberships: true } },
        },
      }),
    ]);

    // Successful payments grouped by fee, then mapped to associations.
    const byFee = await this.prisma.payment.groupBy({
      by: ["feeId"],
      where: { status: "successful" },
      _sum: { amountKobo: true },
    });
    const fees = await this.prisma.fee.findMany({
      where: { id: { in: byFee.map((b) => b.feeId) } },
      select: { id: true, associationId: true },
    });
    const feeAssoc = new Map(fees.map((f) => [f.id, f.associationId]));
    const collectedByAssoc = new Map<string, number>();
    for (const b of byFee) {
      const assocId = feeAssoc.get(b.feeId);
      if (!assocId) continue;
      collectedByAssoc.set(
        assocId,
        (collectedByAssoc.get(assocId) ?? 0) + (b._sum.amountKobo || 0),
      );
    }

    const totalCollectedKobo = totalCollected._sum.amountKobo || 0;

    // 6-week signup series (week buckets starting Monday).
    const series: Array<{ weekStart: string; count: number }> = [];
    const buckets = new Map<string, number>();
    const now = new Date();
    for (let i = 5; i >= 0; i--) {
      const start = new Date(now);
      start.setHours(0, 0, 0, 0);
      start.setDate(start.getDate() - ((start.getDay() + 6) % 7) - i * 7);
      buckets.set(start.toISOString().slice(0, 10), 0);
    }
    for (const u of signupRows) {
      const d = new Date(u.createdAt);
      d.setHours(0, 0, 0, 0);
      const key = d.toISOString().slice(0, 10);
      if (buckets.has(key)) {
        buckets.set(key, (buckets.get(key) ?? 0) + 1);
      } else {
        // Find the containing week bucket.
        const monday = new Date(d);
        monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
        const wk = monday.toISOString().slice(0, 10);
        if (buckets.has(wk)) buckets.set(wk, (buckets.get(wk) ?? 0) + 1);
      }
    }
    for (const [weekStart, count] of buckets) series.push({ weekStart, count });
    const associationBreakdown = associations.map((a) => ({
      id: a.id,
      name: a.name,
      shortCode: a.shortCode,
      status: a.status,
      memberCount: a._count.memberships,
      totalCollected: collectedByAssoc.get(a.id) ?? 0,
    }));

    // Most-active courses, sorted in JS (groupBy count ordering isn't
    // portable across Prisma versions).
    const topCourses = courses
      .sort((a, b) => (b._count._all ?? 0) - (a._count._all ?? 0))
      .slice(0, 8)
      .map((c) => ({
        courseCode: c.courseCode,
        uploads: c._count._all ?? 0,
        downloads: c._sum.downloads ?? 0,
      }));

    return {
      // Headline counts (spec §1 — the admin console renders these).
      totalStudents,
      totalAssociations,
      activeAssociations,
      totalPayments,
      successfulPayments,
      totalCollectedKobo,
      totalRevenueKobo: totalCollectedKobo,
      totalRevenue: totalCollectedKobo,
      // Growth over time (spec §1).
      signupsLast7Days,
      signupsLast30Days,
      signupsSeries: series,
      associations: associationBreakdown,
      associationRevenue: associationBreakdown.map((a) => ({
        associationId: a.id,
        name: a.name,
        totalKobo: a.totalCollected,
      })),
      // Usage analytics (spec §1): what the platform is actually for.
      topCourses,
      vaultActivity: {
        totalUploads: vaultTotal,
        pendingModeration: vaultPending,
        contributionsThisWeek: vaultThisWeek,
      },
    };
  }

  // ── Payments oversight ────────────────────────────────────────

  async listPayments(params: {
    status?: string;
    associationId?: string;
    cursor?: string;
    take?: number;
  }) {
    const take = Math.min(params.take ?? 50, 100);
    const where: Record<string, unknown> = {
      ...(params.status && { status: params.status }),
      ...(params.associationId && {
        fee: { associationId: params.associationId },
      }),
    };

    const [payments, total] = await Promise.all([
      this.prisma.payment.findMany({
        where,
        take: take + 1,
        ...(params.cursor ? { cursor: { id: params.cursor }, skip: 1 } : {}),
        orderBy: { createdAt: "desc" },
        include: {
          user: { select: { id: true, fullName: true, email: true } },
          fee: {
            select: {
              id: true,
              name: true,
              session: true,
              association: { select: { id: true, name: true } },
            },
          },
        },
      }),
      this.prisma.payment.count({ where }),
    ]);

    const hasMore = payments.length > take;
    const items = hasMore ? payments.slice(0, take) : payments;

    return {
      payments: items.map((p) => ({
        id: p.id,
        amountKobo: p.amountKobo,
        status: p.status,
        method: p.method,
        internalReference: p.internalReference,
        paidAt: p.paidAt,
        createdAt: p.createdAt,
        user: p.user,
        fee: p.fee,
      })),
      pagination: {
        cursor: hasMore ? items[items.length - 1].id : null,
        hasMore,
        total,
      },
    };
  }

  // ── Fees oversight ────────────────────────────────────────────

  async listFees(associationId?: string) {
    const where = associationId ? { associationId } : {};
    const [fees, byFee] = await Promise.all([
      this.prisma.fee.findMany({
        where,
        orderBy: { createdAt: "desc" },
        include: {
          association: { select: { id: true, name: true, shortCode: true } },
          _count: { select: { payments: true } },
        },
        take: 100,
      }),
      this.prisma.payment.groupBy({
        by: ["feeId"],
        where: { status: "successful" },
        _count: { _all: true },
        _sum: { amountKobo: true },
      }),
    ]);
    const paidMap = new Map(byFee.map((p) => [p.feeId, p]));

    return {
      fees: fees.map((f) => {
        const paid = paidMap.get(f.id);
        return {
          id: f.id,
          name: f.name,
          amountKobo: f.amountKobo,
          currency: f.currency,
          dueDate: f.dueDate,
          session: f.session,
          association: f.association,
          paymentCount: f._count.payments,
          paidCount: paid?._count._all ?? 0,
          collectedKobo: paid?._sum.amountKobo ?? 0,
        };
      }),
      total: fees.length,
    };
  }

  // ── Global verification queue ──────────────────────────────────

  async listVerificationRequests(params: {
    status?: string;
    associationId?: string;
  }) {
    const where: Prisma.VerificationRequestWhereInput = {
      ...(params.status && {
        status: params.status as VerificationStatus,
      }),
      ...(params.associationId && { associationId: params.associationId }),
    };
    const requests = await this.prisma.verificationRequest.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 100,
      include: {
        user: {
          select: {
            id: true,
            fullName: true,
            email: true,
            matricNumber: true,
            jambNumber: true,
            department: true,
            level: true,
            registrationType: true,
          },
        },
        association: { select: { id: true, name: true, shortCode: true } },
      },
    });

    return { requests, total: requests.length };
  }

  // ── AI document moderation queue ───────────────────────────────

  async listAiDocuments(status?: string) {
    const docs = await this.prisma.aiDocument.findMany({
      where: status ? { moderationStatus: status as never } : {},
      orderBy: { createdAt: "desc" },
      take: 100,
      include: {
        association: { select: { id: true, name: true } },
        submitter: { select: { id: true, fullName: true, email: true } },
      },
    });

    return { documents: docs, total: docs.length };
  }

  async moderateAiDocument(
    docId: string,
    status: "approved" | "rejected",
    adminId: string,
    ipAddress: string,
    reason?: string,
  ) {
    const doc = await this.prisma.aiDocument.findUnique({
      where: { id: docId },
    });
    if (!doc) throw new NotFoundException("Document not found");
    if (doc.moderationStatus === status) {
      throw new BadRequestException(
        `Document is already ${status === "approved" ? "approved" : "rejected"}`,
      );
    }

    const updated = await this.prisma.aiDocument.update({
      where: { id: docId },
      data: { moderationStatus: status },
    });

    await this.auditService.log({
      actorType: "admin",
      actorId: adminId,
      action: `ai_document.${status}`,
      targetType: "ai_document",
      targetId: docId,
      ipAddress,
      metadata: { reason: reason ?? null },
    });

    this.logger.log(`Admin ${adminId} ${status} AI document ${docId}`);

    // Approved docs become retrievable — compute their embedding in the
    // background (fire-and-forget; retrieval falls back to keyword search).
    if (status === "approved") {
      void this.aiService.embedAndStore(docId, updated.contentChunk);
    }

    return {
      id: updated.id,
      moderationStatus: updated.moderationStatus,
      message: `Document ${status}`,
    };
  }

  /**
   * RAG backfill — ingest every approved vault item that has extractable
   * text but hasn't been ingested yet (anything uploaded before the
   * ingestion hooks existed). Idempotent: sourceRef upserts mean already-
   * ingested items update in place; items with no ai_documents rows are
   * detected via a sourceRef prefix check and are the only ones processed.
   * Sequential on purpose: bounded work per request, no thundering herd on
   * the embed server. Runs in the background — the admin gets a receipt.
   */
  async backfillRagIngestion(
    adminId: string,
    ipAddress: string,
  ): Promise<{ message: string; started: true }> {
    // Approved vault items with no ingested chunks at all.
    const candidates = await this.prisma.vaultItem.findMany({
      where: {
        moderationStatus: "approved",
        deletedAt: null,
      },
      select: { id: true },
      take: 2000,
      orderBy: { createdAt: "asc" },
    });
    const alreadyIngested = await this.prisma.aiDocument.findMany({
      where: { sourceRef: { startsWith: "vault:" } },
      select: { sourceRef: true },
      distinct: ["sourceRef"],
    });
    const ingestedItemIds = new Set(
      alreadyIngested.map((d) => (d.sourceRef ?? "").split(":")[1] ?? ""),
    );
    const items = candidates.filter((c) => !ingestedItemIds.has(c.id));

    void (async () => {
      let ingested = 0;
      let skipped = 0;
      for (const candidate of items) {
        try {
          const full = await this.prisma.vaultItem.findUnique({
            where: { id: candidate.id },
            select: {
              id: true,
              userId: true,
              associationId: true,
              courseCode: true,
            },
          });
          if (!full) {
            skipped += 1;
            continue;
          }
          await this.vaultIngestForBackfill(full);
          ingested += 1;
        } catch (err) {
          skipped += 1;
          this.logger.warn(
            `Backfill ingest failed for ${candidate.id}: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      }
      this.logger.log(
        `RAG backfill by admin ${adminId}: ${ingested} ingested, ${skipped} skipped/unreadable`,
      );
    })().catch((err: unknown) =>
      this.logger.warn(
        `RAG backfill crashed: ${err instanceof Error ? err.message : String(err)}`,
      ),
    );

    await this.auditService.log({
      actorType: "admin",
      actorId: adminId,
      action: "ai.backfill_ingestion",
      targetType: "ai_document",
      ipAddress,
      metadata: { candidates: items.length },
    });

    return {
      message: `Backfill started for ${items.length} approved vault item(s) without AI ingestion. It runs in the background — check the logs for the completion summary.`,
      started: true,
    };
  }

  /**
   * Vault-item ingestion for the backfill path. Extraction reuses the
   * VaultService admin text preview (same PDF/OCR pipeline as the reader;
   * admin context needs no student-scope check).
   */
  private async vaultIngestForBackfill(item: {
    id: string;
    userId: string;
    associationId: string;
    courseCode: string;
  }): Promise<void> {
    const preview = await this.vaultService.getTextForAdmin(item.id);
    if (!preview.text || preview.text.trim().length < 10) return;
    await this.aiService.ingestSource({
      sourceRef: `vault:${item.id}`,
      text: preview.text,
      sourceType: "vault",
      courseCode: item.courseCode,
      associationId: item.associationId,
      ownerId: item.userId,
      approved: true,
    });
  }

  // ── Vault moderation queue (spec §15) ──────────────────────────

  async listVaultItems(status?: string) {
    const where = status ? { moderationStatus: status as never } : {};
    const items = await this.prisma.vaultItem.findMany({
      where: { ...where, deletedAt: null },
      orderBy: { createdAt: "desc" },
      take: 100,
      include: {
        user: {
          select: {
            id: true,
            fullName: true,
            email: true,
            matricNumber: true,
            level: true,
          },
        },
        association: { select: { id: true, name: true, shortCode: true } },
      },
    });

    return {
      items: items.map((i) => ({
        id: i.id,
        courseCode: i.courseCode,
        title: i.title,
        type: i.type,
        visibility: i.visibility,
        originalName: i.originalName,
        mimeType: i.mimeType,
        sizeBytes: i.sizeBytes,
        hasCompanion: i.companionSizeBytes !== null,
        moderationStatus: i.moderationStatus,
        rejectionReason: i.rejectionReason,
        downloads: i.downloads,
        createdAt: i.createdAt,
        user: i.user,
        association: i.association,
      })),
      total: items.length,
    };
  }

  async moderateVaultItem(
    itemId: string,
    status: "approved" | "rejected",
    adminId: string,
    ipAddress: string,
    reason?: string,
  ) {
    const item = await this.prisma.vaultItem.findUnique({
      where: { id: itemId },
    });
    if (!item || item.deletedAt)
      throw new NotFoundException("Vault item not found");
    if (item.moderationStatus === status) {
      throw new BadRequestException(
        `Item is already ${status === "approved" ? "approved" : "rejected"}`,
      );
    }

    const updated = await this.prisma.vaultItem.update({
      where: { id: itemId },
      data: {
        moderationStatus: status,
        reviewedByAdmin: adminId,
        reviewedAt: new Date(),
        rejectionReason:
          status === "rejected"
            ? (reason ?? "Not approved").slice(0, 500)
            : null,
      },
    });

    await this.auditService.log({
      actorType: "admin",
      actorId: adminId,
      action: `vault.${status}`,
      targetType: "vault_item",
      targetId: itemId,
      ipAddress,
      metadata: {
        userId: item.userId,
        associationId: item.associationId,
        courseCode: item.courseCode,
        reason: reason ?? null,
      },
    });

    this.logger.log(`Admin ${adminId} ${status} vault item ${itemId}`);

    // In-app feed: tell the uploader what happened to their contribution
    // (round-2 QA §9). Fire-and-forget — moderation is already committed.
    void this.inAppNotificationsService.createForUser(item.userId, {
      title:
        status === "approved"
          ? "Vault upload approved"
          : "Vault upload rejected",
      body:
        status === "approved"
          ? `"${item.title}" (${item.courseCode}) is now live for your school.`
          : `"${item.title}" (${item.courseCode}) wasn't approved${reason ? ` — ${reason}` : ""}.`,
      type: "vault",
      link: "Vault",
    });

    return {
      id: updated.id,
      moderationStatus: updated.moderationStatus,
      message:
        status === "approved"
          ? "Item approved — visible to students."
          : "Item rejected.",
    };
  }

  // ── Platform-wide broadcasts (round-2 QA §1) ──────────────────

  /**
   * Send a platform announcement to every student's in-app notification
   * feed (app-wide outages, new features). Fire-and-forget fan-out; the
   * audit entry is written first so the action is always accountable.
   */
  async createBroadcast(
    dto: { title: string; body: string },
    adminId: string,
    ipAddress: string,
  ) {
    const title = dto.title.trim().slice(0, 140);
    const body = dto.body.trim().slice(0, 500);
    if (!title || !body) {
      throw new BadRequestException(
        "Broadcast needs both a title and a message",
      );
    }

    await this.auditService.log({
      actorType: "admin",
      actorId: adminId,
      action: "broadcast.created",
      targetType: "broadcast",
      targetId: adminId, // broadcasts aren't rows yet — target the actor
      ipAddress,
      metadata: { title },
    });

    this.logger.log(`Admin ${adminId} broadcast: ${title}`);

    void this.inAppNotificationsService.createForAllUsers({
      title,
      body,
      type: "broadcast",
      link: "Home",
    });

    return { message: "Broadcast sent to all students", title };
  }

  // ── User search ────────────────────────────────────────────────

  async searchUsers(q?: string) {
    const where = q?.trim()
      ? {
          OR: [
            { fullName: { contains: q.trim(), mode: "insensitive" as const } },
            { email: { contains: q.trim(), mode: "insensitive" as const } },
            ...(q.trim().length >= 3
              ? [
                  { matricNumber: { contains: q.trim() } },
                  { jambNumber: { contains: q.trim() } },
                ]
              : []),
          ],
        }
      : {};

    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: 50,
        select: {
          id: true,
          fullName: true,
          email: true,
          registrationType: true,
          matricNumber: true,
          jambNumber: true,
          matricStatus: true,
          faculty: true,
          department: true,
          level: true,
          emailVerified: true,
          mfaEnabled: true,
          createdAt: true,
          // Spec §10: admins act on deletion requests per the 6-month policy.
          deletionScheduledAt: true,
          deletedAt: true,
        },
      }),
      this.prisma.user.count({ where }),
    ]);

    return { users, total };
  }

  /**
   * Admin cancels a student's scheduled deletion (spec §10: the 6-month
   * window is reversible — logging in cancels it; an admin can do the same
   * on the student's behalf). Same effect as a login: the account is
   * restored exactly as it was.
   */
  async cancelUserDeletion(userId: string, adminId: string, ipAddress: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException("User not found");
    if (!user.deletionScheduledAt) {
      throw new BadRequestException(
        "This account has no scheduled deletion to cancel.",
      );
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: { deletionScheduledAt: null },
    });

    await this.auditService.log({
      actorType: "admin",
      actorId: adminId,
      action: "user.deletion_cancelled",
      targetType: "user",
      targetId: userId,
      ipAddress,
      metadata: { email: user.email },
    });

    this.logger.log(`Admin ${adminId} cancelled deletion for user ${userId}`);
    return { message: "Deletion cancelled — the account is restored." };
  }

  // ── Executive role management ──────────────────────────────────

  async listExecutives(associationId?: string) {
    const executives = await this.prisma.associationExecutive.findMany({
      where: associationId ? { associationId } : {},
      orderBy: { createdAt: "desc" },
      take: 200,
      include: {
        user: { select: { id: true, fullName: true, email: true } },
        association: { select: { id: true, name: true, shortCode: true } },
      },
    });

    return {
      executives: executives.map((e) => ({
        id: e.id,
        role: e.role,
        mfaEnabled: e.mfaEnabled,
        createdAt: e.createdAt,
        user: e.user,
        association: e.association,
      })),
      total: executives.length,
    };
  }

  /** Grant an executive role to a user (per security.md — admin only). */
  async grantExecutiveRole(
    dto: { userId: string; associationId: string; role: string },
    adminId: string,
    ipAddress: string,
  ) {
    if (!["president", "treasurer", "pro"].includes(dto.role)) {
      throw new BadRequestException("Invalid executive role");
    }

    const [user, association] = await Promise.all([
      this.prisma.user.findUnique({ where: { id: dto.userId } }),
      this.prisma.association.findUnique({
        where: { id: dto.associationId },
      }),
    ]);
    if (!user) throw new NotFoundException("User not found");
    if (!association) throw new NotFoundException("Association not found");

    const existing = await this.prisma.associationExecutive.findUnique({
      where: {
        userId_associationId: {
          userId: dto.userId,
          associationId: dto.associationId,
        },
      },
    });
    if (existing) {
      throw new ConflictException(
        "User already has an executive role in this association",
      );
    }

    const exec = await this.prisma.associationExecutive.create({
      data: {
        userId: dto.userId,
        associationId: dto.associationId,
        role: dto.role as "president" | "treasurer" | "pro",
      },
    });

    await this.auditService.log({
      actorType: "admin",
      actorId: adminId,
      action: "executive.role_granted",
      targetType: "association_executive",
      targetId: exec.id,
      ipAddress,
      metadata: {
        userId: dto.userId,
        associationId: dto.associationId,
        role: dto.role,
      },
    });

    this.logger.log(
      `Admin ${adminId} granted ${dto.role} to user ${dto.userId} in association ${dto.associationId}`,
    );

    return {
      id: exec.id,
      role: exec.role,
      userId: exec.userId,
      associationId: exec.associationId,
    };
  }

  // ── Admin account management ───────────────────────────────────

  async listAdmins() {
    const admins = await this.prisma.adminAccount.findMany({
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        email: true,
        mfaEnabled: true,
        createdAt: true,
      },
    });
    return { admins, total: admins.length };
  }

  /** Create an additional admin account (privileged — admin only). */
  async createAdmin(
    dto: { email: string; password: string },
    actorAdminId: string,
    ipAddress: string,
  ) {
    const email = dto.email.toLowerCase().trim();
    const existing = await this.prisma.adminAccount.findUnique({
      where: { email },
    });
    if (existing) {
      throw new ConflictException("An admin with this email already exists");
    }

    const passwordHash = await argon2.hash(dto.password, {
      type: argon2.argon2id,
      memoryCost: 65536,
      timeCost: 3,
      parallelism: 4,
    });

    const admin = await this.prisma.adminAccount.create({
      data: { email, passwordHash },
    });

    await this.auditService.log({
      actorType: "admin",
      actorId: actorAdminId,
      action: "admin.created",
      targetType: "admin_account",
      targetId: admin.id,
      ipAddress,
      metadata: { email },
    });

    this.logger.log(`Admin ${actorAdminId} created admin account ${email}`);

    return {
      message: "Admin account created",
      id: admin.id,
      email: admin.email,
    };
  }
}
