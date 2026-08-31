import {
  Injectable,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  Logger,
} from "@nestjs/common";
import { zipSync } from "fflate";
import pdfParse from "pdf-parse";
import {
  IsInt,
  IsNotEmpty,
  IsString,
  Max,
  MaxLength,
  Min,
} from "class-validator";
import { PrismaService } from "../prisma/prisma.service";
import { StorageService } from "../storage/storage.service";
import { AuditService } from "../audit/audit.service";
import { ToolsService } from "../tools/tools.service";
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
// Chunked upload path — used for large files so the whole document is never
// held in a single multer buffer (a 200 MB upload would otherwise blow the
// server's memory). Chunks are 4-6 MB; the total is capped at 200 MB.
const MAX_CHUNK_BYTES = 6 * 1024 * 1024;
const MAX_TOTAL_UPLOAD_BYTES = 200 * 1024 * 1024;
const MAX_CHUNK_COUNT = 512;
const IMAGE_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
// Videos are deliberately NOT accepted into the academic document storage
// system at this stage — no video storage/processing infrastructure.
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
  /** Optional discovery metadata (academic level, e.g. "100"). */
  level?: string;
  /** Optional discovery metadata (academic session, e.g. "2023/2024"). */
  session?: string;
  /** Course full title, e.g. "General Chemistry I" (for course-title search). */
  courseTitle?: string;
  /** Free-text description shown on the library detail page. */
  description?: string;
}

/** Body of the chunked-upload completion call. */
export class CompleteChunkedUploadDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  uploadId: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  originalName: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  mimeType: string;

  @IsInt()
  @Min(1)
  @Max(MAX_CHUNK_COUNT)
  totalChunks: number;

  @IsInt()
  @Min(1)
  @Max(MAX_TOTAL_UPLOAD_BYTES)
  sizeBytes: number;

  courseCode: string;
  title: string;
  type: VaultItemType;
  visibility: VaultVisibility;
  termsVersion: string;
}

export class RenameVaultItemDto {
  /** New display filename (extension is preserved automatically when omitted). */
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  originalName: string;
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
    private readonly toolsService: ToolsService,
  ) {}

  // ── Student: search the vault ─────────────────────────────────

  /**
   * Search approved public items scoped to the student's own school
   * (association) plus their own items regardless of moderation state.
   * Search is course-code-first but also matches the title.
   */
  async search(
    userId: string,
    query?: string,
    type?: VaultItemType,
    level?: string,
  ) {
    const myAssociations = await this.myAssociationIds(userId);

    const where: Record<string, unknown> = {
      deletedAt: null,
      OR: [
        { userId },
        {
          visibility: "public",
          moderationStatus: "approved",
          // A student with no association gets zero public results — an
          // empty `in` list (a "__none__" sentinel used to crash the query
          // with an invalid UUID cast → 500 on the Vault search screen).
          ...(myAssociations.length > 0
            ? { associationId: { in: myAssociations } }
            : { associationId: { in: [] } }),
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
    const levelFilter = (level ?? "").trim();
    if (levelFilter) {
      filters.push({ level: levelFilter });
    }
    if (filters.length > 0) where.AND = filters;

    const items = await this.prisma.vaultItem.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 60,
      include: {
        user: { select: { fullName: true, level: true } },
        association: { select: { id: true, name: true, shortCode: true } },
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
    return this.createItem(
      userId,
      ipAddress,
      dto,
      {
        buffer: file?.buffer,
        mimetype: file?.mimetype,
        originalname: file?.originalname,
        size: file?.size,
      },
      {
        fileTooLargeMessage:
          "That file is too large — keep uploads under 20 MB. Compress it and try again.",
      },
    );
  }

  /**
   * Shared validation + create flow for both the single-part and chunked
   * upload paths. The `file` is a plain { buffer, mimetype, originalname,
   * size } shape so the chunked path can hand over an assembled buffer.
   */
  private async createItem(
    userId: string,
    ipAddress: string,
    dto: UploadVaultDto,
    file: {
      buffer?: Buffer;
      mimetype?: string;
      originalname?: string;
      size?: number;
    },
    opts: { fileTooLargeMessage: string },
  ) {
    // 1. Server-side file validation (spec §13 Tier 3)
    if (!file?.buffer) {
      throw new BadRequestException(
        "Please choose a file to upload (PDF, JPG or PNG).",
      );
    }
    const mimeType = file.mimetype ?? "application/octet-stream";
    if (!ALLOWED_MIME_TYPES.has(mimeType)) {
      throw new BadRequestException(
        file.mimetype?.startsWith("video/")
          ? "Videos aren't accepted in the Vault yet — upload a PDF, JPG, PNG or WebP."
          : "That file type isn't supported — upload a PDF, JPG, PNG or WebP.",
      );
    }
    if ((file.size ?? 0) > MAX_UPLOAD_BYTES) {
      throw new BadRequestException({
        statusCode: 400,
        code: "FILE_TOO_LARGE",
        message: opts.fileTooLargeMessage,
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

    // 4. Scope by the uploader's school (association membership) + capture
    //    their academic profile so the resource is discoverable by
    //    institution/faculty/department — not just by school.
    const myAssociations = await this.myAssociationIds(userId);
    if (myAssociations.length === 0) {
      throw new BadRequestException(
        "Join an association first — the Vault is scoped to your school.",
      );
    }
    const associationId = myAssociations[0];

    const profile = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { institutionId: true, faculty: true, department: true },
    });

    // 5. Store the original untouched (spec §7 smart storage)
    const originalname = file.originalname ?? "document";
    const objectKey = `vault/${associationId}/${userId}/${Date.now()}-${this.safeName(originalname)}`;
    const storedKey = await this.storageService.put(
      objectKey,
      file.buffer,
      mimeType,
    );
    const storageRef = storedKey
      ? storedKey
      : `data:${mimeType};base64,${file.buffer.toString("base64")}`;

    // 6. Companion version (only kept when genuinely smaller)
    const companion = await this.makeCompanion({
      buffer: file.buffer,
      mimetype: mimeType,
      originalname,
      size: file.size ?? file.buffer.length,
    });
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
        originalName: originalname.slice(0, 200),
        mimeType,
        sizeBytes: file.size ?? file.buffer.length,
        companionSizeBytes: companion?.buffer.length ?? null,
        companionMimeType: companion?.mimeType ?? null,
        moderationStatus: visibility === "public" ? "pending" : "approved",
        level: (dto.level ?? "").trim().slice(0, 12) || null,
        session: (dto.session ?? "").trim().slice(0, 16) || null,
        // Academic library metadata: prefilled from the uploader's profile so
        // discovery can personalise by institution/faculty/department/course.
        institutionId: profile?.institutionId ?? null,
        faculty: (profile?.faculty ?? "").trim().slice(0, 120) || null,
        department: (profile?.department ?? "").trim().slice(0, 120) || null,
        courseTitle: (dto.courseTitle ?? "").trim().slice(0, 200) || null,
        description: (dto.description ?? "").trim().slice(0, 1000) || null,
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
      `Vault upload: user=${userId}, item=${item.id}, ${courseCode} "${title}" (${visibility}, ${file.size ?? file.buffer.length} bytes, companion=${companionRef ? "yes" : "no"})`,
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

  // ── Student: chunked upload (large files) ─────────────────────
  // A 200 MB document must never be held in one multer buffer on the server
  // (memory) or in one JS string on the phone (crash). The app splits the
  // file into ~4 MB chunks, uploads each as its own multipart request, then
  // calls /vault/upload/complete which assembles and validates the file.
  // Re-uploading a chunk with the same uploadId overwrites it, so a retry
  // naturally resumes. Requires object storage: assembling 200 MB into a
  // data-URI fallback is impossible, so this path is honest about it.

  async uploadChunk(
    userId: string,
    ipAddress: string,
    uploadId: string,
    index: number,
    total: number,
    file: Express.Multer.File,
  ) {
    if (!this.storageService.isEnabled) {
      throw new BadRequestException(
        "Large uploads need object storage, which isn't configured on the server yet. Try a file under 20 MB for now.",
      );
    }
    if (!this.isSafeUploadId(uploadId)) {
      throw new BadRequestException("Invalid upload id.");
    }
    if (
      !Number.isInteger(index) ||
      !Number.isInteger(total) ||
      index < 0 ||
      index >= total ||
      total > MAX_CHUNK_COUNT
    ) {
      throw new BadRequestException("Invalid chunk range.");
    }
    if (!file?.buffer || file.buffer.length === 0) {
      throw new BadRequestException("Empty chunk.");
    }
    if (file.buffer.length > MAX_CHUNK_BYTES) {
      throw new BadRequestException(
        "That chunk is too large — keep each part under 6 MB.",
      );
    }

    const key = `${this.pendingKey(uploadId)}/${String(index).padStart(4, "0")}`;
    const stored = await this.storageService.put(
      key,
      file.buffer,
      "application/octet-stream",
    );
    if (!stored) {
      throw new BadRequestException(
        "Couldn't store that chunk right now — check your connection and try again.",
      );
    }

    this.logger.log(
      `Vault chunk: user=${userId}, upload=${uploadId}, part ${index + 1}/${total} (${file.buffer.length} bytes)`,
    );

    return { uploadId, received: index, total };
  }

  async completeChunkedUpload(
    userId: string,
    ipAddress: string,
    dto: CompleteChunkedUploadDto,
  ) {
    if (!this.isSafeUploadId(dto.uploadId)) {
      throw new BadRequestException("Invalid upload id.");
    }
    if (dto.mimeType.startsWith("video/")) {
      throw new BadRequestException(
        "Videos aren't accepted in the Vault yet — upload a PDF, JPG, PNG or WebP.",
      );
    }
    if (!ALLOWED_MIME_TYPES.has(dto.mimeType)) {
      throw new BadRequestException(
        "That file type isn't supported — upload a PDF, JPG, PNG or WebP.",
      );
    }
    if (dto.sizeBytes > MAX_TOTAL_UPLOAD_BYTES) {
      throw new BadRequestException({
        statusCode: 400,
        code: "FILE_TOO_LARGE",
        message: "That file is too large — keep uploads under 200 MB.",
      });
    }

    // Assemble the parts in order. Each part is fetched as a streamed buffer
    // from object storage; the running total is bounded so a malicious uploadId
    // can't balloon memory.
    const prefix = this.pendingKey(dto.uploadId);
    const parts: Buffer[] = [];
    let total = 0;
    for (let i = 0; i < dto.totalChunks; i += 1) {
      const part = await this.storageService.getBuffer(
        `${prefix}/${String(i).padStart(4, "0")}`,
      );
      if (!part) {
        throw new BadRequestException(
          `Upload is incomplete (part ${i + 1} of ${dto.totalChunks} is missing) — resume and try again.`,
        );
      }
      total += part.length;
      if (total > MAX_TOTAL_UPLOAD_BYTES) {
        throw new BadRequestException(
          "That file is too large — keep uploads under 200 MB.",
        );
      }
      parts.push(part);
    }
    const buffer = Buffer.concat(parts);

    const item = await this.createItem(
      userId,
      ipAddress,
      dto,
      {
        buffer,
        mimetype: dto.mimeType,
        originalname: dto.originalName,
        size: buffer.length,
      },
      {
        fileTooLargeMessage:
          "That file is too large — keep uploads under 200 MB.",
      },
    );

    // Best-effort cleanup of the pending parts — never fail the upload over it.
    for (let i = 0; i < dto.totalChunks; i += 1) {
      void this.storageService
        .remove(`${prefix}/${String(i).padStart(4, "0")}`)
        .catch(() => undefined);
    }

    return item;
  }

  private pendingKey(uploadId: string): string {
    return `vault-pending/${uploadId}`;
  }

  private isSafeUploadId(uploadId: string): boolean {
    return /^[A-Za-z0-9_-]{8,64}$/.test(uploadId ?? "");
  }

  // ── Student: delete (owner only, soft delete + storage cleanup) ──

  /**
   * Delete the student's own upload. The row is soft-deleted (hidden from
   * every list, including admin moderation) and the stored objects are
   * removed best-effort — storage cleanup must never fail the delete.
   */
  async deleteItem(userId: string, itemId: string, ipAddress: string) {
    const item = await this.prisma.vaultItem.findUnique({
      where: { id: itemId },
    });
    if (!item || item.deletedAt) {
      throw new NotFoundException("That item isn't in the Vault anymore.");
    }
    if (item.userId !== userId) {
      throw new ForbiddenException("You can only delete your own uploads.");
    }

    await this.prisma.vaultItem.update({
      where: { id: itemId },
      data: { deletedAt: new Date() },
    });

    // Best-effort object cleanup (original + companion).
    if (!item.storageRef.startsWith("data:")) {
      void this.storageService.remove(item.storageRef).catch(() => undefined);
    }
    if (item.companionRef && !item.companionRef.startsWith("data:")) {
      void this.storageService.remove(item.companionRef).catch(() => undefined);
    }

    await this.auditService.log({
      actorType: "student",
      actorId: userId,
      action: "vault.delete",
      targetType: "vault_item",
      targetId: itemId,
      ipAddress,
      metadata: { courseCode: item.courseCode, title: item.title },
    });

    this.logger.log(
      `Vault delete: user=${userId}, item=${itemId} (${item.courseCode} "${item.title}")`,
    );

    return { id: itemId, deleted: true };
  }

  // ── Student: rename (owner only) ──────────────────────────────

  /**
   * Rename an upload's display filename. Owner-only; the stored file itself
   * is untouched — only `originalName` changes. When the new name has no
   * extension (or a different one), the original extension wins so the file
   * stays a PDF/PNG/… after a rename.
   */
  async renameItem(
    userId: string,
    ipAddress: string,
    itemId: string,
    originalName: string,
  ) {
    const item = await this.prisma.vaultItem.findUnique({
      where: { id: itemId },
    });
    if (!item || item.deletedAt) {
      throw new NotFoundException("That item isn't in the Vault anymore.");
    }
    if (item.userId !== userId) {
      throw new ForbiddenException("You can only rename your own uploads.");
    }

    let name = (originalName ?? "")
      .replace(/[\\/]/g, "_")
      .replace(/[\u0000-\u001f]/g, "")
      .trim()
      .slice(0, 200);
    if (!name) {
      throw new BadRequestException("Enter a file name.");
    }

    // Extension preservation: "chm101 answers" → "chm101 answers.pdf", and
    // "answers.docx" on a PDF item → "answers.pdf" (rename ≠ convert).
    const currentExt =
      item.originalName.match(/\.[a-z0-9]+$/i)?.[0]?.toLowerCase() ?? "";
    if (currentExt) {
      name = /\.[a-z0-9]+$/i.test(name)
        ? name.replace(/\.[a-z0-9]+$/i, currentExt)
        : `${name}${currentExt}`;
    }

    const updated = await this.prisma.vaultItem.update({
      where: { id: itemId },
      data: { originalName: name },
    });

    await this.auditService.log({
      actorType: "student",
      actorId: userId,
      action: "vault.rename",
      targetType: "vault_item",
      targetId: itemId,
      ipAddress,
      metadata: { from: item.originalName, to: name },
    });

    this.logger.log(
      `Vault rename: user=${userId}, item=${itemId} "${item.originalName}" → "${name}"`,
    );

    return this.toPublicItem(updated);
  }

  // ── Student: read (extract text) ──────────────────────────────

  /**
   * Extract readable text from a vault file for the in-app reader. PDFs use
   * the embedded text layer; image uploads (photos of notes/past questions)
   * go through the same Tesseract OCR engine as /tools/ocr. Never throws for
   * unreadable content — returns source "none" so the UI can guide the
   * student (e.g. "scanned PDF — run it through Image to Text").
   */
  async getText(
    userId: string,
    itemId: string,
  ): Promise<{ text: string; source: "pdf" | "ocr" | "none" }> {
    const { ref, mimeType } = await this.resolveDownload(
      userId,
      itemId,
      "original",
    );
    const buffer = await this.fetchFileBuffer(ref);
    if (!buffer || buffer.length === 0) return { text: "", source: "none" };
    return this.extractText(buffer, mimeType);
  }

  /**
   * Extract readable text from a file's bytes. PDFs use the embedded text
   * layer; images run through the same Tesseract OCR engine as /tools/ocr.
   * Never throws for unreadable content — returns source "none".
   */
  private async extractText(
    buffer: Buffer,
    mimeType: string,
  ): Promise<{ text: string; source: "pdf" | "ocr" | "none" }> {
    if (mimeType === "application/pdf") {
      try {
        // pdf-parse 1.1.1's bundled pdf.js (v1.10.100) FAILS on Node Buffer
        // instances — "Invalid PDF structure" — while parsing the identical
        // bytes as a plain Uint8Array always works (the Buffer pool / subclass
        // handling is broken on modern Node). The exact-size Uint8Array copy
        // is the fix; the cast satisfies pdf-parse's Buffer-typed signature.
        const data = await pdfParse(
          new Uint8Array(buffer) as unknown as Buffer,
        );
        const text = (data.text ?? "").replace(/\s+/g, " ").trim();
        if (text) return { text: text.slice(0, 50_000), source: "pdf" };
      } catch {
        // Corrupt/edge-case PDF — fall through to "none".
      }
      return { text: "", source: "none" };
    }

    if (IMAGE_MIME_TYPES.has(mimeType)) {
      try {
        const result = await this.toolsService.ocrBuffer(buffer, mimeType);
        if (result.readable && result.text) {
          return { text: result.text.slice(0, 50_000), source: "ocr" };
        }
      } catch {
        // OCR failure — treat as unreadable, the UI still shows the image.
      }
      return { text: "", source: "none" };
    }

    return { text: "", source: "none" };
  }

  // ── Admin: preview (moderation queue) ─────────────────────────
  // The AdminGuard on the route is the authorization — these fetch the file
  // directly without student-scope checks so moderators can review content.

  /** Text preview of any vault item (PDF text layer or OCR for images). */
  async getTextForAdmin(
    itemId: string,
  ): Promise<{ text: string; source: "pdf" | "ocr" | "none" }> {
    const item = await this.prisma.vaultItem.findUnique({
      where: { id: itemId },
    });
    if (!item || item.deletedAt) {
      throw new NotFoundException("Vault item not found");
    }
    const buffer = await this.fetchFileBuffer(item.storageRef);
    if (!buffer || buffer.length === 0) return { text: "", source: "none" };
    return this.extractText(buffer, item.mimeType);
  }

  /** Raw file of any vault item (image preview / original download). */
  async getFileForAdmin(
    itemId: string,
  ): Promise<{ buffer: Buffer; mimeType: string; fileName: string }> {
    const item = await this.prisma.vaultItem.findUnique({
      where: { id: itemId },
    });
    if (!item || item.deletedAt) {
      throw new NotFoundException("Vault item not found");
    }
    const buffer = await this.fetchFileBuffer(item.storageRef);
    if (!buffer) {
      throw new NotFoundException(
        "The file couldn't be retrieved from storage right now.",
      );
    }
    return {
      buffer,
      mimeType: item.mimeType,
      fileName: item.originalName || `${item.courseCode}.pdf`,
    };
  }

  // ── Student: download ─────────────────────────────────────────

  /** Resolve which file (original or light companion) a user may fetch. */
  private async resolveDownload(
    userId: string,
    itemId: string,
    variant: "original" | "light",
  ): Promise<{
    item: {
      id: string;
      courseCode: string;
      title: string;
      originalName: string;
      mimeType: string;
      sizeBytes: number;
      companionSizeBytes: number | null;
      companionMimeType: string | null;
      storageRef: string;
      companionRef: string | null;
      visibility: string;
      moderationStatus: string;
      userId: string;
      associationId: string;
    };
    useCompanion: boolean;
    ref: string;
    mimeType: string;
    fileName: string;
    sizeBytes: number;
  }> {
    const item = await this.prisma.vaultItem.findUnique({
      where: { id: itemId },
    });
    if (!item || item.deletedAt) {
      throw new NotFoundException("That item isn't in the Vault anymore.");
    }

    const canSeeOwn = item.userId === userId;
    // Approved public items are visible to ANY signed-in student (the cross-
    // institution academic library), not just the uploader's school. The
    // library hides/soft-deletes items so a hidden/removed doc never resolves.
    const canSeeShared =
      item.visibility === "public" &&
      item.moderationStatus === "approved" &&
      !item.hidden;
    if (!canSeeOwn && !canSeeShared) {
      throw new ForbiddenException(
        "You can only download public library items or your own uploads.",
      );
    }

    const useCompanion = variant === "light" && item.companionRef !== null;
    const ref = useCompanion ? item.companionRef! : item.storageRef;
    const mimeType = useCompanion
      ? (item.companionMimeType ?? "application/octet-stream")
      : item.mimeType;
    const fileName = useCompanion
      ? `${item.courseCode.replace(/\s+/g, "-")}-light${this.extensionFor(mimeType)}`
      : item.originalName;
    const sizeBytes = useCompanion
      ? (item.companionSizeBytes ?? 0)
      : item.sizeBytes;

    return {
      item,
      useCompanion,
      ref,
      mimeType,
      fileName,
      sizeBytes,
    };
  }

  /**
   * Stream raw bytes for the in-app reader (image previews). Same auth checks
   * as the reader's text path. Counts as a view, not a download — vault
   * documents are view-only; there is no download/save endpoint anymore.
   */
  async downloadRaw(
    userId: string,
    itemId: string,
    variant: "original" | "light" = "original",
  ): Promise<{
    buffer: Buffer;
    mimeType: string;
    fileName: string;
    sizeBytes: number;
  }> {
    const { ref, mimeType, fileName, sizeBytes } = await this.resolveDownload(
      userId,
      itemId,
      variant,
    );

    const buffer = await this.fetchFileBuffer(ref);
    if (!buffer) {
      throw new NotFoundException(
        "The file couldn't be retrieved from storage right now.",
      );
    }

    await this.bumpDownloads(itemId);

    return { buffer, mimeType, fileName, sizeBytes };
  }

  /** Resolve a storage ref to raw bytes (data-URI fallback or object storage). */
  private async fetchFileBuffer(ref: string): Promise<Buffer | null> {
    if (ref.startsWith("data:")) {
      return Buffer.from(ref.split(",")[1] ?? "", "base64");
    }
    const fetched = await this.storageService.getBuffer(ref);
    return fetched ?? null;
  }

  private async bumpDownloads(itemId: string): Promise<void> {
    await this.prisma.vaultItem
      .update({ where: { id: itemId }, data: { downloads: { increment: 1 } } })
      .catch(() => undefined);
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
  private async makeCompanion(file: {
    buffer: Buffer;
    mimetype: string;
    originalname: string;
    size: number;
  }): Promise<{ buffer: Buffer; mimeType: string } | null> {
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
      companionMimeType: string | null;
      moderationStatus: string;
      rejectionReason: string | null;
      downloads: number;
      createdAt: Date;
      level: string | null;
      session: string | null;
      user?: { fullName: string; level: string } | null;
      association?: { id: string; name: string; shortCode: string } | null;
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
      companionMimeType: item.companionMimeType,
      moderationStatus: item.moderationStatus,
      rejectionReason: item.rejectionReason,
      downloads: item.downloads,
      createdAt: item.createdAt,
      level: item.level,
      session: item.session,
      // Institution (association) name so community resources are discoverable
      // without knowing who uploaded them.
      institution: item.association
        ? {
            id: item.association.id,
            name: item.association.name,
            shortCode: item.association.shortCode,
          }
        : null,
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
