import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
} from "@nestjs/common";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { JwtPayload } from "../auth/auth.service";
import { LibraryService } from "./library.service";
import type { ReportReason } from "../generated/prisma/client";

class SaveBody {
  position?: string;
  progress?: number;
}

class ReportBody {
  reason: ReportReason;
  details?: string;
}

/**
 * The academic library (Netflix for Students). All endpooints require auth (a
 * signed-in student) except nothing is public — everything personalises to the
 * caller. Private resources never appear in any of these queries.
 */
@Controller("v1/library")
export class LibraryController {
  constructor(private readonly libraryService: LibraryService) {}

  /** The personalised discovery home (each section only if non-empty). */
  @Get("discovery")
  @UseGuards(JwtAuthGuard)
  discovery(@CurrentUser() user: JwtPayload) {
    return this.libraryService.discovery(user.sub);
  }

  /** Backend search + filters, paginated. */
  @Get("search")
  @UseGuards(JwtAuthGuard)
  search(
    @CurrentUser() user: JwtPayload,
    @Query("q") query?: string,
    @Query("institutionId") institutionId?: string,
    @Query("faculty") faculty?: string,
    @Query("department") department?: string,
    @Query("level") level?: string,
    @Query("session") session?: string,
    @Query("type") type?: "past_question" | "material",
    @Query("page") page?: string,
    @Query("pageSize") pageSize?: string,
  ) {
    return this.libraryService.search({
      query,
      institutionId,
      faculty,
      department,
      level,
      session,
      type,
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
    });
  }

  /** The student's saved collection. */
  @Get("saved")
  @UseGuards(JwtAuthGuard)
  saved(@CurrentUser() user: JwtPayload) {
    return this.libraryService.saved(user.sub);
  }

  /** The student's recent reading / Continue Reading. */
  @Get("recent")
  @UseGuards(JwtAuthGuard)
  recent(@CurrentUser() user: JwtPayload) {
    return this.libraryService.continueReading(user.sub);
  }

  /** Public details of one document + related materials. */
  @Get(":id")
  @UseGuards(JwtAuthGuard)
  details(@CurrentUser() user: JwtPayload, @Param("id") id: string) {
    return this.libraryService.details(user.sub, id);
  }

  /**
   * A short-lived direct-read URL for a public document (large files served
   * straight from object storage). Null when storage is off — fall back to
   * /vault/:id/file for the in-app reader.
   */
  @Get(":id/url")
  @UseGuards(JwtAuthGuard)
  directUrl(@CurrentUser() user: JwtPayload, @Param("id") id: string) {
    return this.libraryService.directReadUrl(user.sub, id);
  }

  /** Save / bookmark a public document (a reference, not a file copy). */
  @Post(":id/save")
  @UseGuards(JwtAuthGuard)
  save(@CurrentUser() user: JwtPayload, @Param("id") id: string) {
    return this.libraryService.save(user.sub, id);
  }

  @Delete(":id/save")
  @UseGuards(JwtAuthGuard)
  unsave(@CurrentUser() user: JwtPayload, @Param("id") id: string) {
    return this.libraryService.unsave(user.sub, id);
  }

  /** Record an open + private reading progress (Continue Reading). */
  @Post(":id/view")
  @UseGuards(JwtAuthGuard)
  recordView(
    @CurrentUser() user: JwtPayload,
    @Param("id") id: string,
    @Body() body: SaveBody,
  ) {
    return this.libraryService.recordView(user.sub, id, {
      position: body?.position,
      progress: body?.progress,
    });
  }

  /** Flag a public resource for moderation. */
  @Post(":id/report")
  @UseGuards(JwtAuthGuard)
  report(
    @CurrentUser() user: JwtPayload,
    @Param("id") id: string,
    @Body() body: ReportBody,
  ) {
    return this.libraryService.report(user.sub, id, body?.reason, body?.details);
  }
}