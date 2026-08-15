import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
} from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { Roles } from "../auth/decorators/roles.decorator";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { JwtPayload } from "../auth/auth.service";
import { ExecutivesService } from "../auth/executives.service";
import { TimetableService, CreateTimetableUpdateDto } from "./timetable.service";

@Controller("v1")
export class TimetableController {
  constructor(
    private readonly timetableService: TimetableService,
    private readonly executivesService: ExecutivesService,
  ) {}

  /** Student view — scoped to the caller's department + level. */
  @Get("associations/:id/timetable-updates")
  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { ttl: 60000, limit: 30 } })
  list(
    @Param("id") associationId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.timetableService.listForStudent(user.sub, associationId);
  }

  /** Executive/class-rep: push a timetable change for the association. */
  @Post("associations/:id/timetable-updates")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("president", "treasurer", "pro")
  @HttpCode(HttpStatus.CREATED)
  create(
    @Param("id") associationId: string,
    @Body() dto: CreateTimetableUpdateDto,
    @CurrentUser() user: JwtPayload,
  ) {
    const { executiveId } = this.executivesService.requireExecutiveFor(
      user,
      associationId,
    );
    return this.timetableService.create(associationId, executiveId, dto);
  }
}
