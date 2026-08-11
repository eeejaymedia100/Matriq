import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from "@nestjs/common";
import { EventsService } from "./events.service";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { Roles } from "../auth/decorators/roles.decorator";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { ExecutivesService } from "../auth/executives.service";
import { JwtPayload } from "../auth/auth.service";
import { IsString, IsNotEmpty, IsDateString } from "class-validator";

class CreateEventDto {
  @IsString()
  @IsNotEmpty()
  title: string;

  @IsString()
  @IsNotEmpty()
  description: string;

  @IsString()
  @IsNotEmpty()
  location: string;

  @IsDateString()
  eventDate: string;
}

@Controller("v1")
export class EventsController {
  constructor(
    private readonly eventsService: EventsService,
    private readonly executivesService: ExecutivesService,
  ) {}

  @Get("associations/:id/events")
  @UseGuards(JwtAuthGuard)
  list(
    @Param("id") associationId: string,
    @Query("cursor") cursor?: string,
    @Query("take") take?: string,
  ) {
    return this.eventsService.list(
      associationId,
      cursor,
      take ? Math.min(Number(take), 50) : undefined,
    );
  }

  @Post("associations/:id/events")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("president", "treasurer", "pro")
  create(
    @Param("id") associationId: string,
    @Body() dto: CreateEventDto,
    @CurrentUser() user: JwtPayload,
  ) {
    const { executiveId } = this.executivesService.requireExecutiveFor(
      user,
      associationId,
    );
    return this.eventsService.create(
      associationId,
      executiveId,
      dto.title,
      dto.description,
      dto.location,
      new Date(dto.eventDate),
    );
  }

  @Post("events/:id/rsvp")
  @UseGuards(JwtAuthGuard)
  toggleRsvp(@Param("id") eventId: string, @CurrentUser() user: JwtPayload) {
    return this.eventsService.toggleRsvp(eventId, user.sub);
  }

  // ── QR check-in ───────────────────────────────────────────────

  /** Executive: issue the rotating check-in token (rendered as a QR code). */
  @Post("events/:id/checkin-token")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("president", "treasurer", "pro")
  @HttpCode(HttpStatus.OK)
  checkinToken(@Param("id") eventId: string, @CurrentUser() user: JwtPayload) {
    // Resolve the executive id for the event's association via the event.
    return this.eventsService.generateCheckinTokenFor(user, eventId);
  }

  /** Student: verify the displayed token and record attendance. */
  @Post("events/:id/checkin")
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  checkIn(
    @Param("id") eventId: string,
    @CurrentUser() user: JwtPayload,
    @Body() dto: { token: string; method?: string },
  ) {
    return this.eventsService.checkIn(
      eventId,
      user.sub,
      dto.token,
      dto.method ?? "qr",
    );
  }

  /** Executive: attendance roster. */
  @Get("events/:id/attendance")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("president", "treasurer", "pro")
  getAttendance(@Param("id") eventId: string, @CurrentUser() user: JwtPayload) {
    return this.eventsService.getAttendanceFor(user, eventId);
  }
}
