import { Controller, Post, Get, UseGuards } from "@nestjs/common";
import { ReferralsService } from "./referrals.service";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { JwtPayload } from "../auth/auth.service";

@Controller("v1")
export class ReferralsController {
  constructor(private readonly referralsService: ReferralsService) {}

  @Post("me/referrals")
  @UseGuards(JwtAuthGuard)
  createReferral(@CurrentUser() user: JwtPayload) {
    return this.referralsService.createReferral(user.sub);
  }

  @Get("me/referrals")
  @UseGuards(JwtAuthGuard)
  listMyReferrals(@CurrentUser() user: JwtPayload) {
    return this.referralsService.listByUser(user.sub);
  }
}
