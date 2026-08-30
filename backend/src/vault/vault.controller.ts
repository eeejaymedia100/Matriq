import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  Req,
  Res,
  StreamableFile,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { Request, Response } from "express";
import { Throttle } from "@nestjs/throttler";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { JwtPayload } from "../auth/auth.service";
import {
  VaultService,
  UploadVaultDto,
  CompleteChunkedUploadDto,
  RenameVaultItemDto,
} from "./vault.service";

@Controller("v1")
export class VaultController {
  constructor(private readonly vaultService: VaultService) {}

  // ── Search the vault (course-code first) ──────────────────────

  @Get("vault")
  @UseGuards(JwtAuthGuard)
  search(
    @CurrentUser() user: JwtPayload,
    @Query("q") q?: string,
    @Query("type") type?: "past_question" | "material",
    @Query("level") level?: string,
  ) {
    return this.vaultService.search(user.sub, q, type, level);
  }

  // ── Upload (original + smart-storage companion) ───────────────

  @Post("vault/upload")
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(
    FileInterceptor("file", { limits: { fileSize: 21 * 1024 * 1024 } }),
  )
  upload(
    @CurrentUser() user: JwtPayload,
    @Req() req: Request,
    @Body() body: UploadVaultDto,
    @UploadedFile() file: Express.Multer.File,
  ) {
    const ip = (req.ip || req.socket.remoteAddress || "unknown") as string;
    return this.vaultService.upload(user.sub, ip, body, file);
  }

  // ── Chunked upload (large files) — one request per ~4 MB chunk ──
  // Re-uploading a chunk with the same uploadId overwrites it, so a retry
  // resumes where it left off. Completion assembles + validates the file.

  @Post("vault/upload/chunk")
  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { ttl: 60000, limit: 240 } })
  @UseInterceptors(
    FileInterceptor("file", { limits: { fileSize: 6 * 1024 * 1024 } }),
  )
  uploadChunk(
    @CurrentUser() user: JwtPayload,
    @Req() req: Request,
    @Body() body: { uploadId?: string; index?: string; total?: string },
    @UploadedFile() file: Express.Multer.File,
  ) {
    const ip = (req.ip || req.socket.remoteAddress || "unknown") as string;
    return this.vaultService.uploadChunk(
      user.sub,
      ip,
      body.uploadId ?? "",
      Number(body.index),
      Number(body.total),
      file,
    );
  }

  @Post("vault/upload/complete")
  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { ttl: 60000, limit: 20 } })
  completeChunkedUpload(
    @CurrentUser() user: JwtPayload,
    @Req() req: Request,
    @Body() body: CompleteChunkedUploadDto,
  ) {
    const ip = (req.ip || req.socket.remoteAddress || "unknown") as string;
    return this.vaultService.completeChunkedUpload(user.sub, ip, body);
  }

  // ── View (in-app only — no download/save-to-device) ───────────
  // Vault documents are view-only: they must be read inside the app, never
  // saved to the student's own storage. The data-URI /download endpoint was
  // removed; this raw-byte endpoint exists solely to render files in the
  // in-app reader (image previews). It streams inline — never as an
  // attachment — so the OS never offers "save this file".
  @Get("vault/:id/file")
  @UseGuards(JwtAuthGuard)
  async viewFile(
    @CurrentUser() user: JwtPayload,
    @Param("id") id: string,
    @Query("variant") variant?: "original" | "light",
    @Res({ passthrough: true }) res?: Response,
  ) {
    const { buffer, mimeType, fileName } = await this.vaultService.downloadRaw(
      user.sub,
      id,
      variant ?? "original",
    );
    res?.set({
      "Content-Type": mimeType,
      // inline, NOT attachment — the browser/app renders it; it never prompts
      // to save the file to local storage.
      "Content-Disposition": `inline; filename="${this.safeHeaderName(fileName)}"`,
      "Cache-Control": "private, max-age=300",
    });
    return new StreamableFile(buffer);
  }

  private safeHeaderName(name: string): string {
    // Content-Disposition filename must be ASCII-safe — strip quotes/CRLF and
    // fall back to a generic name if the result is empty.
    const cleaned = name
      .replace(/[\r\n"\\]/g, "_")
      .replace(/[^\x20-\x7e]/g, "");
    return cleaned.trim() || "download";
  }

  // ── Delete (owner only) ───────────────────────────────────────

  @Delete("vault/:id")
  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { ttl: 60000, limit: 30 } })
  remove(
    @CurrentUser() user: JwtPayload,
    @Param("id") id: string,
    @Req() req: Request,
  ) {
    const ip = (req.ip || req.socket.remoteAddress || "unknown") as string;
    return this.vaultService.deleteItem(user.sub, id, ip);
  }

  // ── Rename (owner only) ───────────────────────────────────────

  @Patch("vault/:id")
  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { ttl: 60000, limit: 30 } })
  rename(
    @CurrentUser() user: JwtPayload,
    @Param("id") id: string,
    @Req() req: Request,
    @Body() body: RenameVaultItemDto,
  ) {
    const ip = (req.ip || req.socket.remoteAddress || "unknown") as string;
    return this.vaultService.renameItem(user.sub, ip, id, body.originalName);
  }

  // ── Read (extract text for the in-app reader) ─────────────────
  // Images run through Tesseract OCR, so this is CPU-bound like /tools/ocr.

  @Get("vault/:id/text")
  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { ttl: 60000, limit: 20 } })
  text(@CurrentUser() user: JwtPayload, @Param("id") id: string) {
    return this.vaultService.getText(user.sub, id);
  }

  // ── My uploads ────────────────────────────────────────────────

  @Get("me/vault")
  @UseGuards(JwtAuthGuard)
  myItems(@CurrentUser() user: JwtPayload) {
    return this.vaultService.getMyItems(user.sub);
  }
}
