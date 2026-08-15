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
import { InAppNotificationsService } from "../notifications/in-app.service";

@Injectable()
export class AdminService {
  private readonly logger = new Logger(AdminService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly aiService: AiService,
    private readonly inAppNotificationsService: InAppNotificationsService,
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
   * Create a new association.
   */
  async createAssociation(dto: {
    name: string;
    shortCode: string;
    faculty: string;
    whatsappNumber?: string;
  }) {
    const association = await this.prisma.association.create({
      data: {
        name: dto.name,
        shortCode: dto.shortCode.toUpperCase(),
        faculty: dto.faculty,
        whatsappNumber: dto.whatsappNumber || "",
      },
    });

    this.logger.log(`Admin created association: ${association.name}`);

    return {
      id: association.id,
      name: association.name,
      shortCode: association.shortCode,
      faculty: association.faculty,
      status: association.status,
    };
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
        status === "approved" ? "Vault upload approved" : "Vault upload rejected",
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
      throw new BadRequestException("Broadcast needs both a title and a message");
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
        },
      }),
      this.prisma.user.count({ where }),
    ]);

    return { users, total };
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
