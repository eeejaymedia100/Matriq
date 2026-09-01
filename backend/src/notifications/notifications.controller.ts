import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Query,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
} from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { JwtPayload } from "../auth/auth.service";
import { InAppNotificationsService } from "./in-app.service";
import { NotificationsService } from "./notifications.service";

class PushRegisterBody {
  token?: string;
  platform?: string;
}

/**
 * In-app notification feed + real device push registration. The bell on Home
 * points at the feed; the push endpoints are called by the app itself at
 * launch (after the user grants notification permission) and on logout.
 */
@Controller("v1")
export class NotificationsController {
  constructor(
    private readonly inAppNotificationsService: InAppNotificationsService,
    private readonly notificationsService: NotificationsService,
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

  /**
   * The app registers its device token after the user grants notification
   * permission (called at launch, every time the app starts). Idempotent.
   */
  @Post("me/push/register")
  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { ttl: 60000, limit: 20 } })
  @HttpCode(HttpStatus.OK)
  registerDevice(
    @CurrentUser() user: JwtPayload,
    @Body() body: PushRegisterBody,
  ) {
    return this.notificationsService.registerDevice(
      user.sub,
      body?.token ?? "",
      body?.platform,
    );
  }

  /** The app removes its device token on logout. */
  @Delete("me/push/register")
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  unregisterDevice(
    @CurrentUser() user: JwtPayload,
    @Query("token") token?: string,
  ) {
    return this.notificationsService.unregisterDevice(user.sub, token);
  }
}
