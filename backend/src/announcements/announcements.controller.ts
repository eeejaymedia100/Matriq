import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Query,
  UseGuards,
} from "@nestjs/common";
import { AnnouncementsService } from "./announcements.service";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { Roles } from "../auth/decorators/roles.decorator";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { ExecutivesService } from "../auth/executives.service";
import { JwtPayload } from "../auth/auth.service";
import { IsString, IsNotEmpty, IsOptional, IsBoolean } from "class-validator";

class CreateAnnouncementDto {
  @IsString()
  @IsNotEmpty()
  title: string;

  @IsString()
  @IsNotEmpty()
  body: string;

  @IsBoolean()
  @IsOptional()
  pinned?: boolean;
}

@Controller("v1")
export class AnnouncementsController {
  constructor(
    private readonly announcementsService: AnnouncementsService,
    private readonly executivesService: ExecutivesService,
  ) {}

  @Get("associations/:id/announcements")
  @UseGuards(JwtAuthGuard)
  list(
    @Param("id") associationId: string,
    @Query("cursor") cursor?: string,
    @Query("take") take?: string,
  ) {
    return this.announcementsService.list(
      associationId,
      cursor,
      take ? Math.min(Number(take), 50) : undefined,
    );
  }

  @Post("associations/:id/announcements")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("president", "treasurer", "pro")
  create(
    @Param("id") associationId: string,
    @Body() dto: CreateAnnouncementDto,
    @CurrentUser() user: JwtPayload,
  ) {
    const { executiveId } = this.executivesService.requireExecutiveFor(
      user,
      associationId,
    );
    return this.announcementsService.create(
      associationId,
      executiveId,
      dto.title,
      dto.body,
      dto.pinned,
    );
  }

  @Post("announcements/:id/read")
  @UseGuards(JwtAuthGuard)
  markRead(
    @Param("id") announcementId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.announcementsService.markRead(announcementId, user.sub);
  }

  @Get("associations/:aid/announcements/:id/reads")
  @UseGuards(JwtAuthGuard)
  getReads(@Param("id") announcementId: string) {
    return this.announcementsService.getReads(announcementId);
  }
}
