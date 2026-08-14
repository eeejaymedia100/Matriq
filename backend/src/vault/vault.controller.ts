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
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { Request } from "express";
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

  // ── My uploads ────────────────────────────────────────────────

  @Get("me/vault")
  @UseGuards(JwtAuthGuard)
  myItems(@CurrentUser() user: JwtPayload) {
    return this.vaultService.getMyItems(user.sub);
  }
}
