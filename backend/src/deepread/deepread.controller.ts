import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  Req,
  Res,
  UseGuards,
  UseInterceptors,
  UploadedFiles,
  NotFoundException,
  BadRequestException,
  StreamableFile,
} from "@nestjs/common";
import { FileFieldsInterceptor } from "@nestjs/platform-express";
import { Throttle } from "@nestjs/throttler";
import type { Request, Response } from "express";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { JwtPayload } from "../auth/auth.service";
import { DeepReadService } from "./deepread.service";
import { StorageService } from "../storage/storage.service";
import { IsArray, IsInt, IsOptional, IsString, MaxLength, Min, Max } from "class-validator";
import { Type } from "class-transformer";

class CreateJobDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  title?: string;
}

class UpdatePageTextDto {
  @IsString()
  @MaxLength(60_000)
  text: string;
}

/**
 * Deep Read — premium handwriting OCR (Magic Plus).
 *
 * Upload shape: multipart with any number of `page_N` file fields plus an
 * optional `title` text field (FileFieldsInterceptor handles the variable
 * file count; page order = field order sent by the app).
 *
 * Capacity: the create endpoint returns immediately (async job); results are
 * polled via GET and delivered by push notification. The throttle here (6
 * job submissions / minute / user) plus server-side daily page quotas are
 * the abuse boundary.
 */
@Controller("v1/deepread")
export class DeepReadController {
  constructor(
    private readonly deepRead: DeepReadService,
    private readonly storage: StorageService,
  ) {}

  @Post("jobs")
  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { ttl: 60_000, limit: 6 } })
  @UseInterceptors(
    FileFieldsInterceptor([{ name: "pages" }], {
      limits: { fileSize: 12 * 1024 * 1024, files: 15 },
    }),
  )
  async createJob(
    @CurrentUser() user: JwtPayload,
    @UploadedFiles() files: { pages?: Express.Multer.File[] },
    @Body() dto: CreateJobDto,
  ) {
    const pages = files?.pages ?? [];
    const { job, position } = await this.deepRead.createJob(
      user.sub,
      pages,
      dto.title,
    );
    return { ...job, queuePosition: position };
  }

  @Get("jobs")
  @UseGuards(JwtAuthGuard)
  listJobs(@CurrentUser() user: JwtPayload) {
    return this.deepRead.listJobs(user.sub);
  }

  @Get("jobs/:id")
  @UseGuards(JwtAuthGuard)
  getJob(@CurrentUser() user: JwtPayload, @Param("id") id: string) {
    return this.deepRead.getJob(user.sub, id);
  }

  @Patch("jobs/:id/pages/:pageId")
  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { ttl: 60_000, limit: 60 } })
  updatePageText(
    @CurrentUser() user: JwtPayload,
    @Param("id") id: string,
    @Param("pageId") pageId: string,
    @Body() dto: UpdatePageTextDto,
  ) {
    return this.deepRead.updatePageText(user.sub, id, pageId, dto.text);
  }

  @Get("quota")
  @UseGuards(JwtAuthGuard)
  quota(@CurrentUser() user: JwtPayload) {
    return this.deepRead.quota(user.sub);
  }

  /**
   * Page image for the review screen's side-by-side view. Ownership is
   * enforced through the job before the presigned URL / stream is issued.
   */
  @Get("jobs/:id/pages/:pageId/image")
  @UseGuards(JwtAuthGuard)
  async pageImage(
    @CurrentUser() user: JwtPayload,
    @Param("id") id: string,
    @Param("pageId") pageId: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile | { url: string }> {
    const { job } = await this.deepRead.getJob(user.sub, id);
    const page = job.pages.find((p) => p.id === pageId);
    if (!page?.imageRef) {
      throw new NotFoundException("Page image not available.");
    }

    // Prefer a short-lived presigned URL (offloads bytes from the API box).
    const url = await this.storage.presignedGetUrl(page.imageRef, 900);
    if (url) return { url };

    // Storage disabled / presign failed: stream through the API.
    const buffer = await this.storage.getBuffer(page.imageRef);
    if (!buffer) throw new NotFoundException("Page image not available.");
    res.set({
      "Content-Type": "image/jpeg",
      "Content-Length": String(buffer.length),
      "Cache-Control": "private, max-age=86400",
    });
    return new StreamableFile(buffer);
  }
}
