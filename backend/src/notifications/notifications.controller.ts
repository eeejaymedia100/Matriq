import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { JwtPayload } from "../auth/auth.service";
import { InAppNotificationsService } from "./in-app.service";

/**
 * In-app notification feed (round-2 QA §9). The bell on Home points here.
 */
@Controller("v1")
export class NotificationsController {
  constructor(
    private readonly inAppNotificationsService: InAppNotificationsService,
  ) {}

  @Get("me/notifications")
  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { ttl: 60000, limit: 30 } })
  list(
    @CurrentUser() user: JwtPayload,
    @Query("cursor") cursor?: string,
    @Query("take") take?: string,
  ) {
    return this.inAppNotificationsService.listForUser(
      user.sub,
      cursor,
      take ? Math.min(Number(take), 50) : undefined,
    );
  }

  @Get("me/notifications/unread-count")
  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { ttl: 60000, limit: 30 } })
  unreadCount(@CurrentUser() user: JwtPayload) {
    return this.inAppNotificationsService.unreadCountFor(user.sub);
  }

  @Post("me/notifications/read-all")
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  markAllRead(@CurrentUser() user: JwtPayload) {
    return this.inAppNotificationsService.markAllRead(user.sub);
  }

  @Post("me/notifications/:id/read")
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  markRead(
    @CurrentUser() user: JwtPayload,
    @Param("id") id: string,
  ) {
    return this.inAppNotificationsService.markRead(user.sub, id);
  }
}
