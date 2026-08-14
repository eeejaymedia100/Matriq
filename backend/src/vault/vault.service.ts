import {
  Injectable,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  Logger,
} from "@nestjs/common";
import { zipSync } from "fflate";
import { PrismaService } from "../prisma/prisma.service";
import { StorageService } from "../storage/storage.service";
import { AuditService } from "../audit/audit.service";
import type {
  VaultItemType,
  VaultVisibility,
} from "../generated/prisma/client";

/**
 * The Vault (spec §7) — the shared, cross-student academic database.
 *
 * - Every upload is Public (visible to the uploader's school, after admin
 *   approval) or Private (usable by the owner immediately).
 * - Smart storage: the original is kept untouched; a lightweight companion
 *   is generated automatically on upload (image → lower-quality JPEG, any
 *   other file → zip) and only kept when it's actually smaller.
 * - Server-side file-type/size limits (spec §13 Tier 3) — never trust the
 *   client's file picker.
 * - The shared corpus (covered by the Terms of Use consent) feeds a
 *   Matriq-specific model later.
 */

const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;
const IMAGE_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const ALLOWED_MIME_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
]);

export interface UploadVaultDto {
  courseCode: string;
  title: string;
  type: VaultItemType;
  visibility: VaultVisibility;
  /** Version of the Terms of Use the student accepted at first upload (spec §14). */
  termsVersion: string;
}

export function normalizeCourseCode(raw: string): string {
  return raw.trim().toUpperCase().replace(/\s+/g, " ");
}

@Injectable()
export class VaultService {
  private readonly logger = new Logger(VaultService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storageService: StorageService,
    private readonly auditService: AuditService,
  ) {}

  // ── Student: search the vault ─────────────────────────────────

  /**
   * Search approved public items scoped to the student's own school
   * (association) plus their own items regardless of moderation state.
   * Search is course-code-first but also matches the title.
   */
  async search(userId: string, query?: string, type?: VaultItemType) {
    const myAssociations = await this.myAssociationIds(userId);

    const where: Record<string, unknown> = {
      deletedAt: null,
      OR: [
        { userId },
        {
          visibility: "public",
          moderationStatus: "approved",
          ...(myAssociations.length > 0
            ? { associationId: { in: myAssociations } }
            : { associationId: "__none__" }),
        },
      ],
    };

    const filters: Record<string, unknown>[] = [];
    const q = query?.trim();
    if (q) {
      const code = normalizeCourseCode(q);
      filters.push({
        OR: [
          { courseCode: { contains: code } },
          { courseCode: { contains: q.trim(), mode: "insensitive" } },
          { title: { contains: q.trim(), mode: "insensitive" } },
        ],
      });
    }
    if (type === "past_question" || type === "material") {
      filters.push({ type });
    }
    if (filters.length > 0) where.AND = filters;

    const items = await this.prisma.vaultItem.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 60,
      include: {
        user: { select: { fullName: true, level: true } },
      },
    });

    return {
      items: items.map((item) => this.toPublicItem(item)),
    };
  }

  // ── Student: my uploads ───────────────────────────────────────

  async getMyItems(userId: string) {
    const items = await this.prisma.vaultItem.findMany({
      where: { userId, deletedAt: null },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    return { items: items.map((item) => this.toPublicItem(item)) };
  }

  // ── Student: upload ───────────────────────────────────────────

  async upload(
    userId: string,
    ipAddress: string,
    dto: UploadVaultDto,
    file: Express.Multer.File,
  ) {
    // 1. Server-side file validation (spec §13 Tier 3)
    if (!file?.buffer) {
      throw new BadRequestException(
        "Please choose a file to upload (PDF, JPG or PNG).",
      );
    }
    if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
      throw new BadRequestException(
        "That file type isn't supported — upload a PDF, JPG, PNG or WebP.",
      );
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      throw new BadRequestException({
        statusCode: 400,
        code: "FILE_TOO_LARGE",
        message:
          "That file is too large — keep uploads under 20 MB. Compress it and try again.",
      });
    }

    // 2. Course code + title (course-code-first organisation, spec §7)
    const courseCode = normalizeCourseCode(dto.courseCode ?? "");
    if (courseCode.length < 2 || courseCode.length > 12) {
      throw new BadRequestException(
        "Enter a course code like CHM 101 — that's how the Vault is organised.",
      );
    }
    const title = (dto.title ?? "").trim();
    if (!title) {
      throw new BadRequestException("Give the upload a short title.");
    }

    // 3. Terms of Use acceptance at first upload (spec §14 trigger)
    const termsVersion = (dto.termsVersion ?? "").trim();
    if (!termsVersion) {
      throw new BadRequestException(
        "Please accept the Terms of Use to continue.",
      );
    }

    // 4. Scope by the uploader's school (association membership)
    const myAssociations = await this.myAssociationIds(userId);
    if (myAssociations.length === 0) {
      throw new BadRequestException(
        "Join an association first — the Vault is scoped to your school.",
      );
    }
    const associationId = myAssociations[0];

    // 5. Store the original untouched (spec §7 smart storage)
    const objectKey = `vault/${associationId}/${userId}/${Date.now()}-${this.safeName(file.originalname)}`;
    const storedKey = await this.storageService.put(
      objectKey,
      file.buffer,
      file.mimetype,
    );
    const storageRef = storedKey
      ? storedKey
      : `data:${file.mimetype};base64,${file.buffer.toString("base64")}`;

    // 6. Companion version (only kept when genuinely smaller)
    const companion = await this.makeCompanion(file);
    let companionRef: string | null = null;
    if (companion) {
      const companionKey = `${objectKey}.companion`;
      const companionStored = await this.storageService.put(
        companionKey,
        companion.buffer,
        companion.mimeType,
      );
      if (companionStored) {
        companionRef = companionStored;
      } else {
        companionRef = `data:${companion.mimeType};base64,${companion.buffer.toString("base64")}`;
      }
    }

    // 7. Public uploads need admin approval; private ones are immediately usable
    const visibility: VaultVisibility =
      dto.visibility === "private" ? "private" : "public";
    const item = await this.prisma.vaultItem.create({
      data: {
        userId,
        associationId,
        courseCode,
        title: title.slice(0, 120),
        type: dto.type === "past_question" ? "past_question" : "material",
        visibility,
        storageRef,
        companionRef,
        originalName: file.originalname.slice(0, 200),
        mimeType: file.mimetype,
        sizeBytes: file.size,
        companionSizeBytes: companion?.buffer.length ?? null,
        companionMimeType: companion?.mimeType ?? null,
        moderationStatus: visibility === "public" ? "pending" : "approved",
      },
    });

    // 8. Record the Terms acceptance (separate trigger from registration)
    await this.prisma.legalAcceptance.upsert({
      where: {
        userId_documentType_documentVersion: {
          userId,
          documentType: "terms_and_conditions",
          documentVersion: termsVersion.slice(0, 16),
        },
      },
      create: {
        userId,
        documentType: "terms_and_conditions",
        documentVersion: termsVersion.slice(0, 16),
        ipAddress,
      },
      update: { acceptedAt: new Date() },
    });

    this.logger.log(
      `Vault upload: user=${userId}, item=${item.id}, ${courseCode} "${title}" (${visibility}, ${file.size} bytes, companion=${companionRef ? "yes" : "no"})`,
    );

    return {
      id: item.id,
      moderationStatus: item.moderationStatus,
      visibility: item.visibility,
      message:
        item.moderationStatus === "pending"
          ? "Uploaded! Public items go live after a quick admin review."
          : "Uploaded — it's saved to your private Vault.",
    };
  }

  // ── Student: download ─────────────────────────────────────────

  /** Resolve an item's file (original or the smart-storage light copy). */
  async download(
    userId: string,
    itemId: string,
    variant: "original" | "light" = "original",
  ) {
    const item = await this.prisma.vaultItem.findUnique({
      where: { id: itemId },
    });
    if (!item || item.deletedAt) {
      throw new NotFoundException("That item isn't in the Vault anymore.");
    }

    const myAssociations = await this.myAssociationIds(userId);
    const canSeeOwn = item.userId === userId;
    const canSeeShared =
      item.visibility === "public" &&
      item.moderationStatus === "approved" &&
      myAssociations.includes(item.associationId);
    if (!canSeeOwn && !canSeeShared) {
      throw new ForbiddenException(
        "You can only download items shared with your school or your own uploads.",
      );
    }

    const useCompanion = variant === "light" && item.companionRef !== null;
    const ref = useCompanion ? item.companionRef! : item.storageRef;
    const mimeType = useCompanion
      ? (item.companionMimeType ?? "application/octet-stream")
      : item.mimeType;

    let dataUri = ref;
    if (!dataUri.startsWith("data:")) {
      const fetched = await this.storageService.getDataUri(ref, mimeType);
      if (fetched) {
        dataUri = fetched;
      } else {
        throw new NotFoundException(
          "The file couldn't be retrieved from storage right now.",
        );
      }
    }

    // Count every (successful) download — feeds popularity later.
    await this.prisma.vaultItem
      .update({ where: { id: itemId }, data: { downloads: { increment: 1 } } })
      .catch(() => undefined);

    return {
      itemId: item.id,
      courseCode: item.courseCode,
      title: item.title,
      variant: useCompanion ? "light" : "original",
      fileName: useCompanion
        ? `${item.courseCode.replace(/\s+/g, "-")}-light${this.extensionFor(mimeType)}`
        : item.originalName,
      mimeType,
      dataUri,
      sizeBytes: useCompanion ? (item.companionSizeBytes ?? 0) : item.sizeBytes,
    };
  }

  // ── Admin: moderation queue (spec §15) ────────────────────────

  async adminList(status?: "pending" | "approved" | "rejected") {
    const items = await this.prisma.vaultItem.findMany({
      where: {
        deletedAt: null,
        ...(status ? { moderationStatus: status } : {}),
      },
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
      items: items.map((item) => this.toPublicItem(item, true)),
      total: items.length,
    };
  }

  async adminModerate(
    itemId: string,
    status: "approved" | "rejected",
    adminId: string,
    ipAddress: string,
    reason?: string,
  ) {
    const item = await this.prisma.vaultItem.findUnique({
      where: { id: itemId },
    });
    if (!item || item.deletedAt) {
      throw new NotFoundException("Vault item not found");
    }
    if (item.moderationStatus === status) {
      throw new BadRequestException(
        `This item is already ${status === "approved" ? "approved" : "rejected"}`,
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

    this.logger.log(
      `Admin ${adminId} ${status} vault item ${itemId} (${item.courseCode} "${item.title}")`,
    );

    return {
      id: updated.id,
      moderationStatus: updated.moderationStatus,
      message:
        status === "approved"
          ? "Item approved — now visible to your school."
          : "Item rejected.",
    };
  }

  // ── Private helpers ───────────────────────────────────────────

  private async myAssociationIds(userId: string): Promise<string[]> {
    const memberships = await this.prisma.membership.findMany({
      where: { userId, status: "live" },
      select: { associationId: true },
    });
    return memberships.map((m) => m.associationId);
  }

  /**
   * Generate the smart-storage companion (spec §7). Images are re-encoded to
   * a lower-quality JPEG; any other file is zipped. Returns null when the
   * companion wouldn't be smaller than the original.
   */
  private async makeCompanion(
    file: Express.Multer.File,
  ): Promise<{ buffer: Buffer; mimeType: string } | null> {
    try {
      let buffer: Buffer;
      let mimeType: string;

      if (IMAGE_MIME_TYPES.has(file.mimetype)) {
        const sharp = (await import("sharp")).default;
        buffer = await sharp(file.buffer)
          .rotate()
          .jpeg({ quality: 70 })
          .toBuffer();
        mimeType = "image/jpeg";
      } else {
        const name = this.safeName(file.originalname) || "file";
        buffer = Buffer.from(
          zipSync({ [name]: [new Uint8Array(file.buffer), { level: 6 }] }),
        );
        mimeType = "application/zip";
      }

      if (buffer.length >= file.size) return null;
      return { buffer, mimeType };
    } catch (err) {
      this.logger.warn(
        `Companion generation failed (keeping original only): ${err instanceof Error ? err.message : String(err)}`,
      );
      return null;
    }
  }

  /** Strip path separators + control chars from a user-supplied filename. */
  private safeName(name: string): string {
    return (name ?? "")
      .replace(/[\\/]/g, "_")
      .replace(/[\u0000-\u001f]/g, "")
      .slice(0, 120);
  }

  private extensionFor(mimeType: string): string {
    if (mimeType === "image/jpeg") return ".jpg";
    if (mimeType === "application/zip") return ".zip";
    return "";
  }

  /** Shape a DB row into a safe public payload (never leak storage refs). */
  private toPublicItem(
    item: {
      id: string;
      courseCode: string;
      title: string;
      type: string;
      visibility: string;
      originalName: string;
      mimeType: string;
      sizeBytes: number;
      companionSizeBytes: number | null;
      moderationStatus: string;
      rejectionReason: string | null;
      downloads: number;
      createdAt: Date;
      user?: { fullName: string; level: string } | null;
    },
    includeAdmin = false,
  ) {
    const out: Record<string, unknown> = {
      id: item.id,
      courseCode: item.courseCode,
      title: item.title,
      type: item.type,
      visibility: item.visibility,
      originalName: item.originalName,
      mimeType: item.mimeType,
      sizeBytes: item.sizeBytes,
      hasCompanion: item.companionSizeBytes !== null,
      companionSizeBytes: item.companionSizeBytes,
      moderationStatus: item.moderationStatus,
      rejectionReason: item.rejectionReason,
      downloads: item.downloads,
      createdAt: item.createdAt,
      submitter: item.user
        ? { fullName: item.user.fullName, level: item.user.level }
        : null,
    };
    if (includeAdmin) {
      out.submitter = item.user ?? null;
    }
    return out;
  }
}
