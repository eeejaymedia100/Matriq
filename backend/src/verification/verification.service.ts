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

@Injectable()
export class VerificationService {
  private readonly logger = new Logger(VerificationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly configService: ConfigService,
    private readonly emailService: EmailService,
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

    // In production: upload file.buffer to a private GCS bucket,
    // store the object path in documentStorageRef.
    // For now: store as base64 data URI (scaffold — not production-safe
    // for large files, but demonstrates the flow end-to-end).
    const storageRef = `verification/${associationId}/${userId}/${Date.now()}-${file.originalname}`;
    const dataUri = `data:${file.mimetype};base64,${file.buffer.toString("base64")}`;

    // In production, this would be the GCS object URL after upload.
    // For the scaffold, we store the data URI itself (small files only).
    const request = await this.prisma.verificationRequest.create({
      data: {
        userId,
        associationId,
        documentStorageRef: storageRef,
        documentOriginalName: file.originalname,
        documentMimeType: file.mimetype,
        status: "pending",
      },
    });

    // Store the actual file content separately for the scaffold
    // (see note in document endpoint below)
    await this.prisma.verificationRequest.update({
      where: { id: request.id },
      data: {
        // Overload storageRef with the data URI for scaffold access
        documentStorageRef: dataUri,
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

    // Scaffold: the documentStorageRef currently holds the data URI.
    // In production: generate a signed URL from the private GCS bucket,
    // return that URL (or redirect to it).
    return {
      mimeType: request.documentMimeType,
      dataUri: request.documentStorageRef,
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
