import {
  Controller,
  Post,
  Get,
  Patch,
  Body,
  Query,
  Header,
  UseGuards,
  HttpCode,
  HttpStatus,
  Req,
} from "@nestjs/common";
import { Request } from "express";
import { Throttle } from "@nestjs/throttler";
import { ipAndEmailTracker } from "../throttler/trackers";
import { AuthService, AuthResponse, LoginResult } from "./auth.service";
import { MfaService } from "./mfa.service";
import { RegisterStayliteDto } from "./dto/register-staylite.dto";
import { RegisterFresherDto } from "./dto/register-fresher.dto";
import { LoginDto } from "./dto/login.dto";
import { VerifyEmailDto } from "./dto/verify-email.dto";
import { ResendVerificationDto } from "./dto/resend-verification.dto";
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
  // Per-IP+email bucket: 1000 students behind campus NAT each get their own
  // 5/min, and one source can't spam many accounts (see trackers.ts).
  @Throttle({
    default: { ttl: 60000, limit: 5, getTracker: ipAndEmailTracker },
  })
  registerStaylite(
    @Body() dto: RegisterStayliteDto,
    @Req() req: Request,
  ): Promise<{ message: string }> {
    const ip = (req.ip || req.socket.remoteAddress || "unknown") as string;
    return this.authService.registerStaylite(dto, ip);
  }

  @Post("auth/register/fresher")
  @Throttle({
    default: { ttl: 60000, limit: 5, getTracker: ipAndEmailTracker },
  })
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
  // 6-digit codes are guessable (1M space) — tight per-IP limit + 24h expiry.
  @Throttle({ default: { ttl: 60000, limit: 10 } })
  verifyEmail(@Body() dto: VerifyEmailDto): Promise<AuthResponse> {
    return this.authService.verifyEmail(dto.token);
  }

  // Lets email clients verify by clicking the link in the verification email.
  @Get("auth/verify-email")
  @Header("Content-Type", "text/html; charset=utf-8")
  @Throttle({ default: { ttl: 60000, limit: 20 } })
  async verifyEmailFromLink(@Query("token") token?: string): Promise<string> {
    if (!token) {
      return this.verificationPage(
        false,
        "Missing verification code. Open the link from your email again.",
      );
    }
    try {
      await this.authService.verifyEmail(token);
      return this.verificationPage(
        true,
        "Your email has been verified. You can close this page and sign in to Matriq.",
      );
    } catch {
      return this.verificationPage(
        false,
        "This verification code is invalid or has expired. Request a new one from the app.",
      );
    }
  }

  @Post("auth/resend-verification")
  @HttpCode(HttpStatus.OK)
  // 5 per hour per (ip, email) — matches the DB-backed budget in AuthService,
  // which returns the exact "try again in X minutes" message on the 6th.
  @Throttle({
    default: { ttl: 3600000, limit: 5, getTracker: ipAndEmailTracker },
  })
  resendVerification(
    @Body() dto: ResendVerificationDto,
  ): Promise<{ message: string }> {
    return this.authService.resendVerification(dto.email);
  }

  // ── Auth: Login ──────────────────────────────────────────────

  @Post("auth/login")
  @HttpCode(HttpStatus.OK)
  // Per-IP+email bucket (5/min): an attacker rotating emails from one IP is
  // capped, and a legit user behind a shared NAT keeps their own bucket.
  @Throttle({
    default: { ttl: 60000, limit: 5, getTracker: ipAndEmailTracker },
  })
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

  private verificationPage(success: boolean, message: string): string {
    const color = success ? "#1E7A3C" : "#B3261E";
    const title = success ? "Email verified" : "Verification failed";
    return `<!doctype html>
<html lang="en">
  <head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><title>${title} — Matriq</title></head>
  <body style="margin:0;font-family:Inter,-apple-system,sans-serif;background:#F7F4FB;display:flex;align-items:center;justify-content:center;min-height:100vh;">
    <div style="background:#fff;border-radius:16px;padding:40px 32px;max-width:400px;text-align:center;box-shadow:0 8px 30px rgba(13,6,32,0.08);">
      <div style="width:48px;height:48px;margin:0 auto 16px;border-radius:50%;background:#F4EEFB;display:flex;align-items:center;justify-content:center;color:${color};font-size:24px;font-weight:700;">${success ? "&#10003;" : "!"}</div>
      <h1 style="color:#0D0620;font-size:20px;margin:0 0 8px;">${title}</h1>
      <p style="color:#5C4D82;font-size:14px;line-height:1.6;margin:0;">${message}</p>
    </div>
  </body>
</html>`;
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
