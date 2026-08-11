import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  BadRequestException,
  Logger,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { ConfigService } from "@nestjs/config";
import * as argon2 from "argon2";
import { generateSecret, generateURI, verify as verifyTotp } from "otplib";
import * as qrcode from "qrcode";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { NotificationsService } from "../notifications/notifications.service";

export interface AdminPayload {
  sub: string;
  email: string;
  role: "admin";
}

export interface AdminAuthResponse {
  accessToken: string;
  admin: {
    id: string;
    email: string;
  };
}

export type AdminLoginResult = AdminAuthResponse | AdminMfaChallenge;

export interface AdminMfaChallenge {
  mfaRequired: true;
  challengeToken: string;
}

export interface AdminMfaEnrollResponse {
  secret: string;
  qrCodeDataUrl: string;
  uri: string;
}

// Sentinel actorId for audit entries where no admin account exists yet
// (e.g. failed login with an unknown email). The audit_logs.actor_id column
// is a UUID, so we use the nil UUID for "unknown actor".
const UNKNOWN_ACTOR_ID = "00000000-0000-0000-0000-000000000000";
const FAILURE_ALERT_THRESHOLD = 3;
const FAILURE_ALERT_WINDOW_MS = 15 * 60 * 1000;

@Injectable()
export class AdminAuthService {
  private readonly logger = new Logger(AdminAuthService.name);

  private readonly failuresByEmail = new Map<
    string,
    Array<{ at: number; ip: string }>
  >();

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly auditService: AuditService,
    private readonly configService: ConfigService,
    private readonly notificationsService: NotificationsService,
  ) {}

  /**
   * Admin login — completely separate from student/executive auth.
   *
   * Admin access tokens are signed with JWT_SECRET (the same secret the
   * passport JwtStrategy uses to validate every guarded route), so a token
   * issued here is always accepted by JwtAuthGuard on the admin routes.
   *
   * If the admin account has MFA enabled, no tokens are issued here — a
   * short-lived, single-purpose challenge token is returned instead and the
   * login only completes via `completeMfaLogin` with a valid TOTP code.
   */
  async login(
    email: string,
    password: string,
    ip: string,
  ): Promise<AdminLoginResult> {
    const admin = await this.prisma.adminAccount.findUnique({
      where: { email: email.toLowerCase().trim() },
    });

    if (!admin) {
      // Unknown email — still log a failed-login security event (nil UUID
      // actor) and alert if the pattern repeats. Never reveal whether the
      // email exists.
      await this.auditService.log({
        actorType: "admin",
        actorId: UNKNOWN_ACTOR_ID,
        action: "admin.login_failed",
        targetType: "admin_account",
        ipAddress: ip,
        metadata: { email: email.toLowerCase().trim() },
      });
      this.trackFailure(email.toLowerCase().trim(), ip);
      throw new UnauthorizedException("Invalid credentials");
    }

    const valid = await argon2.verify(admin.passwordHash, password);
    if (!valid) {
      // Wrong password for a known account — security event + alerting.
      await this.auditService.log({
        actorType: "admin",
        actorId: admin.id,
        action: "admin.login_failed",
        targetType: "admin_account",
        targetId: admin.id,
        ipAddress: ip,
        metadata: { email: admin.email },
      });
      this.trackFailure(admin.email, ip);
      throw new UnauthorizedException("Invalid credentials");
    }

    // MFA: schema comment on admin_accounts says "must be true before login".
    // Enforce the second factor before any token is issued.
    if (admin.mfaEnabled && admin.mfaSecret) {
      const challengeToken = await this.jwtService.signAsync(
        { sub: admin.id, email: admin.email, purpose: "admin-mfa-login" },
        { secret: this.jwtSecret(), expiresIn: "5m" },
      );
      this.logger.log(`Admin MFA challenge issued for ${admin.email}`);
      return { mfaRequired: true, challengeToken };
    }

    return this.issueTokens(admin.id, admin.email, ip);
  }

  /**
   * Second step of MFA login: verify the TOTP code tied to a challenge token
   * and, on success, issue the real access token.
   */
  async completeMfaLogin(
    challengeToken: string,
    code: string,
    ip: string,
  ): Promise<AdminAuthResponse> {
    let payload: { sub: string; email: string; purpose: string };
    try {
      payload = this.jwtService.verify<{
        sub: string;
        email: string;
        purpose: string;
      }>(challengeToken, { secret: this.jwtSecret() });
    } catch {
      throw new UnauthorizedException("Invalid or expired challenge");
    }

    if (payload.purpose !== "admin-mfa-login") {
      throw new UnauthorizedException("Invalid or expired challenge");
    }

    const admin = await this.prisma.adminAccount.findUnique({
      where: { id: payload.sub },
    });

    if (!admin || !admin.mfaEnabled || !admin.mfaSecret) {
      throw new UnauthorizedException("Invalid or expired challenge");
    }

    const result = await verifyTotp({ token: code, secret: admin.mfaSecret });
    if (!result.valid) {
      // MFA failure — security event + alerting.
      await this.auditService.log({
        actorType: "admin",
        actorId: admin.id,
        action: "admin.mfa_failed",
        targetType: "admin_account",
        targetId: admin.id,
        ipAddress: ip,
        metadata: { email: admin.email },
      });
      this.trackFailure(admin.email, ip);
      throw new UnauthorizedException("Invalid authentication code");
    }

    this.logger.log(`Admin MFA login completed for ${admin.email}`);
    return this.issueTokens(admin.id, admin.email, ip);
  }

  /**
   * Generate a TOTP secret + QR code for the admin to scan.
   * Does NOT enable MFA yet — that happens after successful verification.
   */
  async enrollMfa(adminId: string): Promise<AdminMfaEnrollResponse> {
    const admin = await this.prisma.adminAccount.findUnique({
      where: { id: adminId },
    });

    if (!admin) {
      throw new BadRequestException("Admin account not found");
    }
    if (admin.mfaEnabled) {
      throw new BadRequestException("MFA is already enabled");
    }

    const appName = this.configService.get<string>("MFA_APP_NAME") || "Matriq";

    const secret = generateSecret();
    const uri = generateURI({
      label: `admin:${admin.email}`,
      issuer: appName,
      secret,
    });

    const qrCodeDataUrl = await qrcode.toDataURL(uri);

    await this.prisma.adminAccount.update({
      where: { id: adminId },
      data: { mfaSecret: secret },
    });

    this.logger.log(`MFA enrollment initiated for admin ${admin.email}`);
    return { secret, qrCodeDataUrl, uri };
  }

  /** Verify a TOTP token and enable MFA for the admin if successful. */
  async verifyAndEnableMfa(
    adminId: string,
    code: string,
  ): Promise<{ message: string }> {
    const admin = await this.prisma.adminAccount.findUnique({
      where: { id: adminId },
    });

    if (!admin || !admin.mfaSecret) {
      throw new BadRequestException(
        "MFA enrollment not initiated. Call /admin/auth/mfa/enroll first.",
      );
    }

    const result = await verifyTotp({ token: code, secret: admin.mfaSecret });
    if (!result.valid) {
      throw new BadRequestException("Invalid verification code");
    }

    await this.prisma.adminAccount.update({
      where: { id: adminId },
      data: { mfaEnabled: true },
    });

    this.logger.log(`MFA enabled for admin ${admin.email}`);
    return { message: "MFA enabled successfully" };
  }

  /** Disable MFA for an admin. */
  async disableMfa(adminId: string): Promise<{ message: string }> {
    const admin = await this.prisma.adminAccount.findUnique({
      where: { id: adminId },
    });
    if (!admin) {
      throw new BadRequestException("Admin account not found");
    }

    await this.prisma.adminAccount.update({
      where: { id: adminId },
      data: { mfaEnabled: false, mfaSecret: null },
    });

    this.logger.log(`MFA disabled for admin ${admin.email}`);
    return { message: "MFA disabled" };
  }

  /** Get MFA status for the current admin. */
  async mfaStatus(
    adminId: string,
  ): Promise<{ mfaEnabled: boolean; mfaSecretSet: boolean }> {
    const admin = await this.prisma.adminAccount.findUnique({
      where: { id: adminId },
      select: { mfaEnabled: true, mfaSecret: true },
    });

    return {
      mfaEnabled: admin?.mfaEnabled ?? false,
      mfaSecretSet: Boolean(admin?.mfaSecret),
    };
  }

  /**
   * Current admin identity — used by the admin console session layer to
   * validate an access token and fetch fresh account data.
   */
  async me(adminId: string): Promise<{ id: string; email: string }> {
    const admin = await this.prisma.adminAccount.findUnique({
      where: { id: adminId },
      select: { id: true, email: true },
    });

    if (!admin) {
      throw new UnauthorizedException("Admin account not found");
    }

    return admin;
  }

  /**
   * Seed an initial admin account (for bootstrapping).
   * Only works if no admin with that email exists.
   */
  async createInitialAdmin(
    email: string,
    password: string,
  ): Promise<{ message: string; adminId: string }> {
    const existing = await this.prisma.adminAccount.findUnique({
      where: { email: email.toLowerCase().trim() },
    });

    if (existing) {
      throw new ConflictException("Admin account already exists");
    }

    const passwordHash = await argon2.hash(password, {
      type: argon2.argon2id,
      memoryCost: 65536,
      timeCost: 3,
      parallelism: 4,
    });

    const admin = await this.prisma.adminAccount.create({
      data: {
        email: email.toLowerCase().trim(),
        passwordHash,
      },
    });

    this.logger.log(`Initial admin account created: ${email}`);

    return { message: "Admin account created", adminId: admin.id };
  }

  /**
   * Track auth failures per identity and raise a security alert once the
   * threshold is crossed within the window (per security.md incident
   * response: "IP-based alerting on new login locations"). In-memory only —
   * per-instance, good enough for alerting.
   */
  private trackFailure(identity: string, ip: string): void {
    const now = Date.now();
    const list = this.failuresByEmail.get(identity) ?? [];
    const recent = list.filter((f) => now - f.at < FAILURE_ALERT_WINDOW_MS);
    recent.push({ at: now, ip });
    this.failuresByEmail.set(identity, recent);

    if (recent.length >= FAILURE_ALERT_THRESHOLD) {
      this.failuresByEmail.delete(identity); // reset so the next burst re-alerts
      void this.notificationsService.securityAlert(
        "Possible brute-force on admin login",
        `${recent.length} failed admin auth attempts for ${identity} within 15 minutes (last from ${ip}). Investigate immediately.`,
        { tags: ["rotating_light", "admin"], priority: 5 },
      );
    }
  }

  private jwtSecret(): string {
    return this.configService.getOrThrow<string>("JWT_SECRET");
  }

  private async issueTokens(
    adminId: string,
    email: string,
    ip: string,
  ): Promise<AdminAuthResponse> {
    const payload: AdminPayload = {
      sub: adminId,
      email,
      role: "admin",
    };

    const accessToken = await this.jwtService.signAsync(payload, {
      secret: this.jwtSecret(),
      expiresIn: "15m",
    });

    await this.auditService.log({
      actorType: "admin",
      actorId: adminId,
      action: "admin.login",
      targetType: "admin_account",
      targetId: adminId,
      ipAddress: ip,
    });

    this.logger.log(`Admin ${email} logged in`);

    return {
      accessToken,
      admin: { id: adminId, email },
    };
  }
}
