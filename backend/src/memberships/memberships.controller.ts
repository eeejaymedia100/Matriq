import {
  Controller,
  Post,
  Delete,
  Get,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
} from "@nestjs/common";
import { MembershipsService } from "./memberships.service";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { JwtPayload } from "../auth/auth.service";

@Controller("v1")
export class MembershipsController {
  constructor(private readonly membershipsService: MembershipsService) {}

  @Post("associations/:id/join")
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.CREATED)
  join(@Param("id") associationId: string, @CurrentUser() user: JwtPayload) {
    return this.membershipsService.join(user.sub, associationId);
  }

  @Delete("associations/:id/leave")
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  leave(@Param("id") associationId: string, @CurrentUser() user: JwtPayload) {
    return this.membershipsService.leave(user.sub, associationId);
  }

  @Get("me/memberships")
  @UseGuards(JwtAuthGuard)
  listMyMemberships(@CurrentUser() user: JwtPayload) {
    return this.membershipsService.listByUser(user.sub);
  }
}
