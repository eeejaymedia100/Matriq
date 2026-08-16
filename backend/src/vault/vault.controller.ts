import {
  Controller,
  Get,
  Post,
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
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { JwtPayload } from "../auth/auth.service";
import { VaultService, UploadVaultDto } from "./vault.service";

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
  ) {
    return this.vaultService.search(user.sub, q, type);
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

  // ── Download (original or the light companion) ────────────────

  @Get("vault/:id/download")
  @UseGuards(JwtAuthGuard)
  download(
    @CurrentUser() user: JwtPayload,
    @Param("id") id: string,
    @Query("variant") variant?: "original" | "light",
  ) {
    return this.vaultService.download(user.sub, id, variant ?? "original");
  }

  // Streaming download (raw bytes, no base64 JSON) — the mobile app uses this
  // for large files so it can save them straight to disk without the ~33%
  // base64 inflation and a full-string JSON roundtrip.
  @Get("vault/:id/file")
  @UseGuards(JwtAuthGuard)
  async downloadFile(
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
      "Content-Disposition": `attachment; filename="${this.safeHeaderName(fileName)}"`,
      "Cache-Control": "private, max-age=300",
    });
    return new StreamableFile(buffer);
  }

  private safeHeaderName(name: string): string {
    // Content-Disposition filename must be ASCII-safe — strip quotes/CRLF and
    // fall back to a generic name if the result is empty.
    const cleaned = name.replace(/[\r\n"\\]/g, "_").replace(/[^\x20-\x7e]/g, "");
    return cleaned.trim() || "download";
  }

  // ── My uploads ────────────────────────────────────────────────

  @Get("me/vault")
  @UseGuards(JwtAuthGuard)
  myItems(@CurrentUser() user: JwtPayload) {
    return this.vaultService.getMyItems(user.sub);
  }
}
