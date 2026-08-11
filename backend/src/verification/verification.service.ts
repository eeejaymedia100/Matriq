import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  Logger,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { EmailService } from "../email/email.service";
import { StorageService } from "../storage/storage.service";
import { NotificationsService } from "../notifications/notifications.service";

@Injectable()
export class VerificationService {
  private readonly logger = new Logger(VerificationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly configService: ConfigService,
    private readonly emailService: EmailService,
    private readonly storageService: StorageService,
    private readonly notificationsService: NotificationsService,
  ) {}

  // ── Student: upload verification document ────────────────────

  async uploadDocument(
    userId: string,
    associationId: string,
    file: Express.Multer.File,
  ): Promise<{ id: string; status: string }> {
    // Verify user exists and belongs to this association
    const membership = await this.prisma.membership.findUnique({
      where: {
        userId_associationId: { userId, associationId },
      },
    });

    if (!membership) {
      throw new ForbiddenException("You are not a member of this association");
    }

    // Storage strategy (per security.md — documents must live in a private
    // bucket, never inline in the DB):
    // 1. If object storage is configured, upload the buffer and store the
    //    object key (files are private; access is mediated by the API).
    // 2. Otherwise fall back to a base64 data-URI (scaffold behaviour — fine
    //    for small files, never for production).
    const objectKey = `verification/${associationId}/${userId}/${Date.now()}-${file.originalname}`;
    let documentStorageRef: string;

    const storedKey = await this.storageService.put(
      objectKey,
      file.buffer,
      file.mimetype,
    );
    if (storedKey) {
      documentStorageRef = storedKey; // object key in the private bucket
    } else {
      documentStorageRef = `data:${file.mimetype};base64,${file.buffer.toString("base64")}`;
    }

    const request = await this.prisma.verificationRequest.create({
      data: {
        userId,
        associationId,
        documentStorageRef,
        documentOriginalName: file.originalname,
        documentMimeType: file.mimetype,
        status: "pending",
      },
    });

    this.logger.log(
      `Verification document uploaded: user=${userId}, request=${request.id}`,
    );

    return { id: request.id, status: request.status };
  }

  // ── Student: view own verification status ────────────────────

  async getMyVerification(userId: string) {
    const requests = await this.prisma.verificationRequest.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 10,
      select: {
        id: true,
        status: true,
        documentOriginalName: true,
        reviewedAt: true,
        rejectionReason: true,
        createdAt: true,
      },
    });

    return { requests };
  }

  // ── Executive: list verification requests ────────────────────

  async listRequests(
    associationId: string,
    status?: "pending" | "approved" | "rejected",
  ) {
    const requests = await this.prisma.verificationRequest.findMany({
      where: {
        associationId,
        ...(status && { status }),
      },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        userId: true,
        status: true,
        documentOriginalName: true,
        documentMimeType: true,
        rejectionReason: true,
        reviewedBy: true,
        reviewedAt: true,
        createdAt: true,
        user: {
          select: {
            id: true,
            fullName: true,
            email: true,
            registrationType: true,
            matricNumber: true,
            jambNumber: true,
            faculty: true,
            department: true,
            level: true,
          },
        },
      },
      take: 50,
    });

    return { requests };
  }

  // ── Executive: get document (scaffold — returns data URI) ────

  async getDocument(
    requestId: string,
    associationId: string,
  ): Promise<{ mimeType: string; dataUri: string }> {
    const request = await this.prisma.verificationRequest.findUnique({
      where: { id: requestId },
    });

    if (!request) {
      throw new NotFoundException("Verification request not found");
    }

    if (request.associationId !== associationId) {
      throw new ForbiddenException(
        "This request does not belong to your association",
      );
    }

    // The ref is either an object key (private bucket) or a legacy data URI.
    let dataUri = request.documentStorageRef;
    if (!dataUri.startsWith("data:")) {
      const fetched = await this.storageService.getDataUri(
        dataUri,
        request.documentMimeType,
      );
      if (fetched) {
        dataUri = fetched;
      } else {
        throw new NotFoundException(
          "Document could not be retrieved from storage",
        );
      }
    }

    return {
      mimeType: request.documentMimeType,
      dataUri,
    };
  }

  // ── Executive: approve ────────────────────────────────────────

  async approve(
    requestId: string,
    associationId: string,
    reviewerExecutiveId: string,
    ipAddress: string,
  ): Promise<{ message: string }> {
    const request = await this.prisma.verificationRequest.findUnique({
      where: { id: requestId },
    });

    if (!request) {
      throw new NotFoundException("Verification request not found");
    }

    if (request.associationId !== associationId) {
      throw new ForbiddenException(
        "This request does not belong to your association",
      );
    }

    if (request.status !== "pending") {
      throw new ForbiddenException(`This request is already ${request.status}`);
    }

    // Atomic: update request + flip user matric_status
    await this.prisma.$transaction([
      this.prisma.verificationRequest.update({
        where: { id: requestId },
        data: {
          status: "approved",
          reviewedBy: reviewerExecutiveId,
          reviewedAt: new Date(),
        },
      }),
      this.prisma.user.update({
        where: { id: request.userId },
        data: { matricStatus: "confirmed" },
      }),
    ]);

    await this.auditService.log({
      actorType: "executive",
      actorId: reviewerExecutiveId,
      action: "verification.approved",
      targetType: "verification_request",
      targetId: requestId,
      ipAddress,
      metadata: {
        userId: request.userId,
        associationId,
      },
    });

    this.logger.log(
      `Verification approved: request=${requestId}, user=${request.userId}, by=${reviewerExecutiveId}`,
    );

    // Fire-and-forget: notifyStudent swallows its own errors, so this can
    // never break the review action, and the request is not held hostage by
    // email latency (Resend has no explicit timeout).
    void this.notifyStudent(request.userId, associationId, "approved");
    void this.notificationsService.notifyUser(
      request.userId,
      "Identity verified ✅",
      "An executive approved your verification document. Your account is now confirmed.",
      { tags: ["white_check_mark"], priority: 4 },
    );

    return { message: "Student identity verified. Account confirmed." };
  }

  // ── Executive: reject ─────────────────────────────────────────

  async reject(
    requestId: string,
    associationId: string,
    reviewerExecutiveId: string,
    reason: string,
    ipAddress: string,
  ): Promise<{ message: string }> {
    const request = await this.prisma.verificationRequest.findUnique({
      where: { id: requestId },
    });

    if (!request) {
      throw new NotFoundException("Verification request not found");
    }

    if (request.associationId !== associationId) {
      throw new ForbiddenException(
        "This request does not belong to your association",
      );
    }

    if (request.status !== "pending") {
      throw new ForbiddenException(`This request is already ${request.status}`);
    }

    await this.prisma.verificationRequest.update({
      where: { id: requestId },
      data: {
        status: "rejected",
        reviewedBy: reviewerExecutiveId,
        reviewedAt: new Date(),
        rejectionReason: reason,
      },
    });

    // Note: student's matric_status stays "provisional" —
    // they can re-submit a new verification request.

    await this.auditService.log({
      actorType: "executive",
      actorId: reviewerExecutiveId,
      action: "verification.rejected",
      targetType: "verification_request",
      targetId: requestId,
      ipAddress,
      metadata: {
        userId: request.userId,
        associationId,
        reason,
      },
    });

    this.logger.log(
      `Verification rejected: request=${requestId}, user=${request.userId}, by=${reviewerExecutiveId}, reason="${reason}"`,
    );

    void this.notifyStudent(request.userId, associationId, "rejected", reason);
    void this.notificationsService.notifyUser(
      request.userId,
      "Verification needs attention",
      `Your document was rejected: ${reason ?? "No reason provided"}. You can re-submit from the app.`,
      { tags: ["warning"], priority: 4 },
    );

    return { message: "Verification rejected. Student has been notified." };
  }

  // ── Student notification (transactional email) ───────────────

  /**
   * Notify the student that their verification document was approved or
   * rejected. Failures are logged and swallowed — a notification problem
   * must never roll back or break the review action itself.
   */
  private async notifyStudent(
    userId: string,
    associationId: string,
    outcome: "approved" | "rejected",
    rejectionReason?: string,
  ): Promise<void> {
    try {
      const [user, association] = await Promise.all([
        this.prisma.user.findUnique({
          where: { id: userId },
          select: { email: true, fullName: true },
        }),
        this.prisma.association.findUnique({
          where: { id: associationId },
          select: { name: true },
        }),
      ]);

      if (!user?.email) {
        this.logger.warn(
          `Verification ${outcome}: user ${userId} has no email — notification skipped`,
        );
        return;
      }

      const associationName = association?.name ?? "your association";
      const firstName = user.fullName?.split(" ")[0] || "there";
      // Every value interpolated into the HTML body is attacker- or
      // user-influenced (rejection reason, student name, association name) —
      // escape them all. The plain-text version stays raw.
      const safeAssociationName = this.escapeHtml(associationName);
      const safeFirstName = this.escapeHtml(firstName);
      const isApproved = outcome === "approved";

      const subject = isApproved
        ? "Your Matriq verification was approved"
        : "Your Matriq verification needs attention";

      const html = isApproved
        ? `
        <div style="font-family: Inter, Arial, sans-serif; max-width: 480px; margin: 0 auto; color: #1a1a1a;">
          <h2 style="color: #0D0620;">Your identity has been verified</h2>
          <p>Hi ${safeFirstName},</p>
          <p>
            An executive of <strong>${safeAssociationName}</strong> has approved your
            verification document. Your account is now confirmed, and you have
            full access to association features, including dues payments and
            receipts.
          </p>
          <p style="font-size: 12px; color: #8B7AAE;">
            Matriq &middot; Identity verification
          </p>
        </div>`
        : `
        <div style="font-family: Inter, Arial, sans-serif; max-width: 480px; margin: 0 auto; color: #1a1a1a;">
          <h2 style="color: #0D0620;">Your verification needs attention</h2>
          <p>Hi ${safeFirstName},</p>
          <p>
            An executive of <strong>${safeAssociationName}</strong> could not approve
            the document you uploaded.
          </p>
          <p><strong>Reason:</strong> ${this.escapeHtml(rejectionReason ?? "No reason provided")}</p>
          <p>
            You can upload a new, clearer document from the Matriq app and
            resubmit for review.
          </p>
          <p style="font-size: 12px; color: #8B7AAE;">
            Matriq &middot; Identity verification
          </p>
        </div>`;

      const text = isApproved
        ? `Hi ${firstName},\n\nAn executive of ${associationName} has approved your verification document. Your account is now confirmed and you have full access to association features, including dues payments and receipts.\n\nMatriq`
        : `Hi ${firstName},\n\nAn executive of ${associationName} could not approve the document you uploaded.\n\nReason: ${rejectionReason ?? "No reason provided"}\n\nYou can upload a new, clearer document from the Matriq app and resubmit for review.\n\nMatriq`;

      const result = await this.emailService.send({
        to: user.email,
        subject,
        html,
        text,
      });

      if (!result.success) {
        this.logger.warn(
          `Verification ${outcome} email failed for ${user.email}: ${result.error}`,
        );
      }
    } catch (err) {
      this.logger.error(
        `Verification ${outcome} notification error: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  private escapeHtml(value: string): string {
    return value
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }
}
