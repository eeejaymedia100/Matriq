import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  UseGuards,
} from "@nestjs/common";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { AdminGuard } from "../admin/admin.guard";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { JwtPayload } from "../auth/auth.service";
import { LibraryService } from "./library.service";

class ResolveReportBody {
  status: "resolved" | "dismissed";
  contentAction: "hidden" | "none";
}

/** Admin moderation for the academic library (reports + hide/unhide). */
@Controller("v1/admin/library")
@UseGuards(JwtAuthGuard, AdminGuard)
export class LibraryAdminController {
  constructor(private readonly libraryService: LibraryService) {}

  /** Open (unresolved) reports, oldest first. */
  @Get("reports")
  reports() {
    return this.libraryService.openReports();
  }

  /** Resolve a report; hiding the content removes it from discovery. */
  @Post("reports/:id/resolve")
  resolve(
    @CurrentUser() user: JwtPayload,
    @Param("id") id: string,
    @Body() body: ResolveReportBody,
  ) {
    return this.libraryService.resolveReport(id, user.sub, {
      status: body?.status ?? "resolved",
      contentAction: body?.contentAction ?? "none",
    });
  }

  /** Hide or unhide an item (hidden = removed from all public queries). */
  @Post("items/:id/hide")
  hide(@Param("id") id: string, @Body() body: { hidden?: boolean }) {
    return this.libraryService.setHidden(id, body?.hidden ?? true);
  }
}