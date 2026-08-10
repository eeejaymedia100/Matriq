import {
  Controller,
  Post,
  Get,
  Patch,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
  Req,
} from "@nestjs/common";
import { Request } from "express";
import { Throttle } from "@nestjs/throttler";
import { AuthService, AuthResponse, LoginResult } from "./auth.service";
import { MfaService } from "./mfa.service";
import { RegisterStayliteDto } from "./dto/register-staylite.dto";
import { RegisterFresherDto } from "./dto/register-fresher.dto";
import { LoginDto } from "./dto/login.dto";
import { VerifyEmailDto } from "./dto/verify-email.dto";
import { RefreshDto } from "./dto/refresh.dto";
import { LogoutDto } from "./dto/logout.dto";
import { UpdateProfileDto } from "./dto/update-profile.dto";
import { MfaVerifyDto } from "./dto/mfa-verify.dto";
import { MfaChallengeDto } from "./dto/mfa-challenge.dto";
import { JwtAuthGuard } from "./guards/jwt-auth.guard";
import { CurrentUser } from "./decorators/current-user.decorator";
import { JwtPayload } from "./auth.service";

@Controller("v1")
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly mfaService: MfaService,
  ) {}

  // ── Auth: Registration ──────────────────────────────────────

  @Post("auth/register/staylite")
  @Throttle({ default: { ttl: 60000, limit: 5 } })
  registerStaylite(
    @Body() dto: RegisterStayliteDto,
    @Req() req: Request,
  ): Promise<{ message: string }> {
    const ip = (req.ip || req.socket.remoteAddress || "unknown") as string;
    return this.authService.registerStaylite(dto, ip);
  }

  @Post("auth/register/fresher")
  @Throttle({ default: { ttl: 60000, limit: 5 } })
  registerFresher(
    @Body() dto: RegisterFresherDto,
    @Req() req: Request,
  ): Promise<{ message: string }> {
    const ip = (req.ip || req.socket.remoteAddress || "unknown") as string;
    return this.authService.registerFresher(dto, ip);
  }

  // ── Auth: Email verification ─────────────────────────────────

  @Post("auth/verify-email")
  @HttpCode(HttpStatus.OK)
  verifyEmail(@Body() dto: VerifyEmailDto): Promise<AuthResponse> {
    return this.authService.verifyEmail(dto.token);
  }

  // ── Auth: Login ──────────────────────────────────────────────

  @Post("auth/login")
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { ttl: 60000, limit: 5 } })
  login(@Body() dto: LoginDto): Promise<LoginResult> {
    return this.authService.login(dto);
  }

  // ── Auth: MFA login challenge (step 2) ───────────────────────

  @Post("auth/mfa/challenge")
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { ttl: 60000, limit: 10 } })
  completeMfaLogin(@Body() dto: MfaChallengeDto): Promise<AuthResponse> {
    return this.authService.completeMfaLogin(dto.challengeToken, dto.code);
  }

  // ── Auth: Token refresh ──────────────────────────────────────

  @Post("auth/refresh")
  @HttpCode(HttpStatus.OK)
  refresh(@Body() dto: RefreshDto): Promise<AuthResponse> {
    return this.authService.refresh(dto.refreshToken);
  }

  // ── Auth: Logout ─────────────────────────────────────────────

  @Post("auth/logout")
  @HttpCode(HttpStatus.OK)
  logout(@Body() dto: LogoutDto): Promise<{ message: string }> {
    return this.authService.logout(dto.refreshToken);
  }

  @Post("auth/logout-all")
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  logoutAll(@CurrentUser() user: JwtPayload): Promise<{ message: string }> {
    return this.authService.logoutAll(user.sub);
  }

  // ── Profile ──────────────────────────────────────────────────

  @Get("me")
  @UseGuards(JwtAuthGuard)
  getProfile(@CurrentUser() user: JwtPayload) {
    return this.authService.getProfile(user.sub);
  }

  @Patch("me")
  @UseGuards(JwtAuthGuard)
  updateProfile(
    @CurrentUser() user: JwtPayload,
    @Body() dto: UpdateProfileDto,
  ) {
    return this.authService.updateProfile(user.sub, dto);
  }

  @Get("me/badges")
  @UseGuards(JwtAuthGuard)
  getBadges(@CurrentUser() user: JwtPayload) {
    return this.authService.getBadges(user.sub);
  }

  @Get("me/payment-history")
  @UseGuards(JwtAuthGuard)
  getPaymentHistory(@CurrentUser() user: JwtPayload) {
    return this.authService.getPaymentHistory(user.sub);
  }

  // ── Legal ────────────────────────────────────────────────────

  @Get("me/legal-status")
  @UseGuards(JwtAuthGuard)
  getLegalStatus(@CurrentUser() user: JwtPayload) {
    return this.authService.getLegalStatus(user.sub);
  }

  // ── MFA ──────────────────────────────────────────────────────

  @Post("auth/mfa/enroll")
  @UseGuards(JwtAuthGuard)
  enrollMfa(@CurrentUser() user: JwtPayload) {
    return this.mfaService.enroll(user.sub);
  }

  @Post("auth/mfa/verify")
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  verifyMfa(@CurrentUser() user: JwtPayload, @Body() dto: MfaVerifyDto) {
    return this.mfaService.verifyAndEnable(user.sub, dto.token);
  }

  @Get("me/mfa-status")
  @UseGuards(JwtAuthGuard)
  mfaStatus(@CurrentUser() user: JwtPayload) {
    return this.mfaService.status(user.sub);
  }

  @Post("auth/mfa/disable")
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  disableMfa(@CurrentUser() user: JwtPayload) {
    return this.mfaService.disable(user.sub);
  }
}
