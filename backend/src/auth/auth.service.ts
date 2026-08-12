import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  BadRequestException,
  HttpStatus,
  Logger,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { ConfigService } from "@nestjs/config";
import * as argon2 from "argon2";
import * as crypto from "node:crypto";
import { JsonWebTokenError, TokenExpiredError } from "jsonwebtoken";
import { PrismaService } from "../prisma/prisma.service";
import { EmailService } from "../email/email.service";
import { MfaService } from "./mfa.service";
import { RegisterStayliteDto } from "./dto/register-staylite.dto";
import { RegisterFresherDto } from "./dto/register-fresher.dto";
import { LoginDto } from "./dto/login.dto";
import { UpdateProfileDto } from "./dto/update-profile.dto";
import { User } from "../generated/prisma/client";

export interface ExecutiveRole {
  id: string; // AssociationExecutive.id
  associationId: string;
  role: "president" | "treasurer" | "pro";
}

export interface JwtPayload {
  sub: string;
  email: string;
  role: "student";
  executive?: ExecutiveRole[];
}

export interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  user: Pick<User, "id" | "email" | "fullName" | "registrationType">;
}

export interface MfaChallengeRequired {
  mfaRequired: true;
  challengeToken: string;
}

export type LoginResult = AuthResponse | MfaChallengeRequired;

export interface ExecutiveProfile {
  id: string;
  associationId: string;
  role: ExecutiveRole["role"];
  associationName: string;
  shortCode: string;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly emailService: EmailService,
    private readonly mfaService: MfaService,
  ) {}

  // ── Registration: Staylite ────────────────────────────────────

  async registerStaylite(
    dto: RegisterStayliteDto,
    ipAddress: string,
  ): Promise<{ message: string }> {
    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (existing) {
      if (existing.emailVerified) {
        throw new ConflictException("A user with this email already exists");
      }
      await this.prisma.user.delete({ where: { id: existing.id } });
    }

    const passwordHash = await argon2.hash(dto.password, {
      type: argon2.argon2id,
      memoryCost: 65536,
      timeCost: 3,
      parallelism: 4,
    });

    const { code, result: user } = await this.withUniqueVerificationCode(
      (c) =>
        this.prisma.user.create({
          data: {
            email: dto.email,
            fullName: dto.fullName,
            passwordHash,
            registrationType: "staylite",
            matricNumber: dto.matricNumber,
            matricStatus: "provisional",
            faculty: dto.faculty,
            department: dto.department,
            level: dto.level,
            emailVerified: false,
            verificationToken: c.verificationToken,
            verificationCodeExpiresAt: c.verificationCodeExpiresAt,
          },
        }),
    );

    await this.recordLegalAcceptance(
      user.id,
      "privacy_policy",
      dto.privacyPolicyVersion,
      ipAddress,
    );
    await this.recordLegalAcceptance(
      user.id,
      "terms_and_conditions",
      dto.termsVersion,
      ipAddress,
    );

    await this.sendVerificationEmail(user.email, code.verificationToken);

    this.logger.log(
      `Staylite user registered (unverified): ${user.id} (${user.email})`,
    );
    return {
      message:
        "Registration successful. Please check your email to verify your account.",
    };
  }

  // ── Registration: Fresher ────────────────────────────────────

  async registerFresher(
    dto: RegisterFresherDto,
    ipAddress: string,
  ): Promise<{ message: string }> {
    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (existing) {
      if (existing.emailVerified) {
        throw new ConflictException("A user with this email already exists");
      }
      await this.prisma.user.delete({ where: { id: existing.id } });
    }

    const passwordHash = await argon2.hash(dto.password, {
      type: argon2.argon2id,
      memoryCost: 65536,
      timeCost: 3,
      parallelism: 4,
    });

    const { code, result: user } = await this.withUniqueVerificationCode(
      (c) =>
        this.prisma.user.create({
          data: {
            email: dto.email,
            fullName: dto.fullName,
            passwordHash,
            registrationType: "fresher",
            jambNumber: dto.jambNumber,
            matricStatus: "provisional",
            faculty: dto.faculty,
            department: dto.department,
            level: "100",
            emailVerified: false,
            verificationToken: c.verificationToken,
            verificationCodeExpiresAt: c.verificationCodeExpiresAt,
          },
        }),
    );

    await this.recordLegalAcceptance(
      user.id,
      "privacy_policy",
      dto.privacyPolicyVersion,
      ipAddress,
    );
    await this.recordLegalAcceptance(
      user.id,
      "terms_and_conditions",
      dto.termsVersion,
      ipAddress,
    );

    await this.sendVerificationEmail(user.email, code.verificationToken);

    this.logger.log(
      `Fresher user registered (unverified): ${user.id} (${user.email})`,
    );
    return {
      message:
        "Registration successful. Please check your email to verify your account.",
    };
  }

  // ── Email verification ───────────────────────────────────────

  /**
   * Verify an email address with a 6-digit code (or the equivalent link
   * token). On success the user is verified and a full token pair is issued.
   * Accepts both the raw code and the legacy hex token so existing emails
   * keep working.
   */
  async verifyEmail(token: string): Promise<AuthResponse> {
    const code = token.trim();
    const user = await this.prisma.user.findUnique({
      where: { verificationToken: code },
    });

    if (!user) {
      throw new BadRequestException("Invalid or expired verification code");
    }

    if (
      user.verificationCodeExpiresAt &&
      user.verificationCodeExpiresAt.getTime() < Date.now()
    ) {
      throw new BadRequestException(
        "This verification code has expired. Request a new one.",
      );
    }

    if (user.emailVerified) {
      return this.generateTokens(user);
    }

    const updated = await this.prisma.user.update({
      where: { id: user.id },
      data: {
        emailVerified: true,
        verificationToken: null,
        verificationCodeExpiresAt: null,
      },
    });

    this.logger.log(`Email verified: ${updated.id} (${updated.email})`);
    return this.generateTokens(updated);
  }

  /**
   * (Re)send a 6-digit verification code to an unverified account.
   * The response is deliberately generic so the endpoint can't be used to
   * enumerate which emails are registered.
   */
  async resendVerification(email: string): Promise<{ message: string }> {
    const normalized = email.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({
      where: { email: normalized },
    });

    if (!user || user.emailVerified) {
      return {
        message:
          "If your email is registered, a new verification code has been sent.",
      };
    }

    const { code } = await this.withUniqueVerificationCode((c) =>
      this.prisma.user.update({
        where: { id: user.id },
        data: {
          verificationToken: c.verificationToken,
          verificationCodeExpiresAt: c.verificationCodeExpiresAt,
        },
      }),
    );

    await this.sendVerificationEmail(user.email, code.verificationToken);
    this.logger.log(`Verification code re-sent to ${user.email}`);
    return { message: "A new verification code has been sent to your email." };
  }

  // ── Login ─────────────────────────────────────────────────────

  async login(dto: LoginDto): Promise<LoginResult> {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    if (!user || !user.passwordHash) {
      throw new UnauthorizedException("Invalid email or password");
    }

    const valid = await argon2.verify(user.passwordHash, dto.password);
    if (!valid) {
      throw new UnauthorizedException("Invalid email or password");
    }

    // Password verified first so EMAIL_NOT_VERIFIED only fires for correct
    // credentials (an attacker can't enumerate registered emails by probing
    // with wrong passwords). Structured error routes the app to the OTP
    // screen instead of a dead "401".
    if (!user.emailVerified) {
      throw new UnauthorizedException({
        statusCode: HttpStatus.UNAUTHORIZED,
        code: "EMAIL_NOT_VERIFIED",
        message:
          "Please verify your email address first — we sent you a verification code.",
      });
    }

    // MFA: if the account has MFA enabled, require a TOTP challenge before
    // issuing any tokens. The challenge token is short-lived (5m) and
    // single-purpose — it is never a session credential by itself.
    if (user.mfaEnabled && user.mfaSecret) {
      const challengeToken = this.jwtService.sign(
        { sub: user.id, purpose: "mfa-login" },
        {
          expiresIn: "5m",
          secret: this.configService.get<string>("JWT_SECRET"),
        },
      );
      this.logger.log(`MFA challenge issued for user ${user.id}`);
      return { mfaRequired: true, challengeToken };
    }

    this.logger.log(`User logged in: ${user.id} (${user.email})`);
    return this.generateTokens(user);
  }

  /**
   * Second step of MFA login: verify the TOTP code tied to a challenge
   * token and, on success, issue the real token pair.
   */
  async completeMfaLogin(
    challengeToken: string,
    code: string,
  ): Promise<AuthResponse> {
    let payload: { sub: string; purpose: string };
    try {
      payload = this.jwtService.verify<{ sub: string; purpose: string }>(
        challengeToken,
        { secret: this.configService.get<string>("JWT_SECRET") },
      );
    } catch {
      throw new UnauthorizedException("Invalid or expired challenge");
    }

    if (payload.purpose !== "mfa-login") {
      throw new UnauthorizedException("Invalid or expired challenge");
    }

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
    });

    if (!user || !user.mfaSecret) {
      throw new UnauthorizedException("Invalid or expired challenge");
    }

    const valid = await this.mfaService.verifyToken(user.id, code);
    if (!valid) {
      throw new UnauthorizedException("Invalid authentication code");
    }

    this.logger.log(`MFA login completed for user ${user.id}`);
    return this.generateTokens(user);
  }

  // ── Token refresh ─────────────────────────────────────────────

  async refresh(rawToken: string): Promise<AuthResponse> {
    // 1. Verify the JWT signature and expiry
    let payload: JwtPayload;
    try {
      payload = this.jwtService.verify<JwtPayload>(rawToken, {
        secret: this.configService.get<string>("JWT_REFRESH_SECRET"),
      });
    } catch (err) {
      if (
        err instanceof JsonWebTokenError ||
        err instanceof TokenExpiredError
      ) {
        throw new UnauthorizedException("Invalid or expired refresh token");
      }
      throw err;
    }

    // 2. Hash the raw token to look it up in the DB
    const tokenHash = this.hashToken(rawToken);

    const stored = await this.prisma.refreshToken.findFirst({
      where: { tokenHash },
    });

    // 3. Token not found in DB — never issued, or already expired/cleaned
    if (!stored) {
      throw new UnauthorizedException("Invalid or expired refresh token");
    }

    // 4. Replay-attack detection: if this token was already used,
    //    the entire family is compromised — revoke everything
    if (stored.used) {
      // Revoke every unused token in the family
      await this.prisma.refreshToken.updateMany({
        where: { familyId: stored.familyId, used: false },
        data: { used: true },
      });
      this.logger.warn(
        `Replay attack detected! Revoked token family ${stored.familyId} ` +
          `for user ${payload.sub}`,
      );
      throw new UnauthorizedException("Invalid or expired refresh token");
    }

    // 5. Verify user still exists
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
    });
    if (!user) {
      throw new UnauthorizedException("User not found");
    }

    // 6. Token is valid and unused — perform rotation
    //    Mark the current token as used, issue a new one in the same family
    const newRefreshToken = await this.issueRefreshToken(
      payload,
      stored.familyId,
    );

    // Mark the old token as used and link to the replacement
    await this.prisma.refreshToken.update({
      where: { id: stored.id },
      data: {
        used: true,
        replacedBy: newRefreshToken.tokenRecord.id,
      },
    });

    // 7. Build response — the new refresh token is the raw one,
    //    not the hash
    const accessToken = this.jwtService.sign(payload, {
      expiresIn: "15m",
      secret: this.configService.get<string>("JWT_SECRET"),
    });

    return {
      accessToken,
      refreshToken: newRefreshToken.rawToken,
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        registrationType: user.registrationType,
      },
    };
  }

  // ── Logout (single session) ──────────────────────────────────

  async logout(rawToken: string): Promise<{ message: string }> {
    const tokenHash = this.hashToken(rawToken);

    const stored = await this.prisma.refreshToken.findFirst({
      where: { tokenHash },
    });

    if (!stored) {
      // Token not found — already expired or never existed, still "success"
      return { message: "Logged out" };
    }

    // Mark this token and all future tokens in the family as used
    await this.prisma.refreshToken.updateMany({
      where: {
        familyId: stored.familyId,
        used: false,
        createdAt: { gte: stored.createdAt },
      },
      data: { used: true },
    });

    this.logger.log(
      `Single-session logout for token family ${stored.familyId}`,
    );
    return { message: "Logged out" };
  }

  // ── Logout all sessions ──────────────────────────────────────

  async logoutAll(userId: string): Promise<{ message: string }> {
    // Find all families for this user and mark every unused token as used
    const families = await this.prisma.refreshTokenFamily.findMany({
      where: { userId },
      select: { id: true },
    });

    const familyIds = families.map((f) => f.id);
    if (familyIds.length > 0) {
      await this.prisma.refreshToken.updateMany({
        where: { familyId: { in: familyIds }, used: false },
        data: { used: true },
      });
    }

    this.logger.log(`All-sessions logout for user ${userId}`);
    return { message: "Logged out of all sessions" };
  }

  // ── Profile ───────────────────────────────────────────────────

  async getProfile(userId: string): Promise<
    Omit<User, "passwordHash" | "verificationToken"> & {
      executive: ExecutiveProfile[];
    }
  > {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        executiveRoles: {
          select: {
            id: true,
            associationId: true,
            role: true,
            association: { select: { name: true, shortCode: true } },
          },
        },
      },
    });

    if (!user) {
      throw new UnauthorizedException("User not found");
    }

    /* eslint-disable @typescript-eslint/no-unused-vars */
    const {
      passwordHash: _,
      verificationToken: __,
      executiveRoles,
      ...profile
    } = user;
    /* eslint-enable @typescript-eslint/no-unused-vars */

    return {
      ...profile,
      executive: (executiveRoles ?? []).map((e) => ({
        id: e.id,
        associationId: e.associationId,
        role: e.role,
        associationName: e.association.name,
        shortCode: e.association.shortCode,
      })),
    };
  }

  async updateProfile(
    userId: string,
    dto: UpdateProfileDto,
  ): Promise<Omit<User, "passwordHash" | "verificationToken">> {
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: {
        ...(dto.fullName !== undefined && { fullName: dto.fullName }),
        ...(dto.faculty !== undefined && { faculty: dto.faculty }),
        ...(dto.department !== undefined && { department: dto.department }),
        ...(dto.level !== undefined && { level: dto.level }),
      },
    });

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { passwordHash: _, verificationToken: __, ...profile } = user;
    return profile;
  }

  async getPaymentHistory(userId: string) {
    const payments = await this.prisma.payment.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      include: { fee: true },
      take: 50,
    });

    return { payments, total: payments.length };
  }

  async getBadges(_userId: string) {
    return { badges: [] };
  }

  // ── Legal status ──────────────────────────────────────────────

  async getLegalStatus(userId: string) {
    const acceptances = await this.prisma.legalAcceptance.findMany({
      where: { userId },
      orderBy: { acceptedAt: "desc" },
    });

    const latest = {
      privacyPolicy:
        acceptances
          .filter((a) => a.documentType === "privacy_policy")
          .sort((a, b) => b.acceptedAt.getTime() - a.acceptedAt.getTime())[0]
          ?.documentVersion ?? null,
      termsAndConditions:
        acceptances
          .filter((a) => a.documentType === "terms_and_conditions")
          .sort((a, b) => b.acceptedAt.getTime() - a.acceptedAt.getTime())[0]
          ?.documentVersion ?? null,
    };

    return {
      accepted: latest,
      currentVersions: {
        privacyPolicy: "1.0",
        termsAndConditions: "1.0",
      },
      needsReacceptance: {
        privacyPolicy: latest.privacyPolicy !== "1.0",
        termsAndConditions: latest.termsAndConditions !== "1.0",
      },
    };
  }

  // ── Private helpers ──────────────────────────────────────────

  /**
   * Generate a fresh 6-digit verification code and its expiry (24h, matching
   * the email copy). The code is stored in verificationToken (unique) and
   * doubles as the token for the clickable email link.
   */
  private newVerificationCode(): {
    verificationToken: string;
    verificationCodeExpiresAt: Date;
  } {
    return {
      verificationToken: crypto.randomInt(100000, 1000000).toString(),
      verificationCodeExpiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    };
  }

  /**
   * Run `fn` with a fresh 6-digit code, regenerating and retrying when the
   * unique verificationToken index collides (rare — 900k space — but would
   * otherwise surface as a confusing 500 on register/resend as the user base
   * grows). Gives up after 5 attempts.
   */
  private async withUniqueVerificationCode<T>(
    fn: (code: {
      verificationToken: string;
      verificationCodeExpiresAt: Date;
    }) => Promise<T>,
  ): Promise<{ code: { verificationToken: string } } & { result: T }> {
    for (let attempt = 0; ; attempt += 1) {
      const code = this.newVerificationCode();
      try {
        return { code, result: await fn(code) };
      } catch (err) {
        if (attempt >= 4 || !this.isVerificationCodeCollision(err)) {
          throw err;
        }
      }
    }
  }

  private isVerificationCodeCollision(err: unknown): boolean {
    if ((err as { code?: string })?.code !== "P2002") return false;
    const target = (err as { meta?: { target?: unknown } })?.meta?.target;
    const targetStr = Array.isArray(target)
      ? target.join(",")
      : String(target ?? "");
    return targetStr.includes("verification_token");
  }

  /**
   * Generate a token pair for a user. Creates a new RefreshTokenFamily
   * and persists a hashed copy of the refresh token.
   */
  private async generateTokens(user: User): Promise<AuthResponse> {
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: "student",
    };

    const accessToken = this.jwtService.sign(payload, {
      expiresIn: "15m",
      secret: this.configService.get<string>("JWT_SECRET"),
    });

    // Create a new token family + first refresh token
    const tokenFamily = await this.prisma.refreshTokenFamily.create({
      data: { userId: user.id },
    });

    const { rawToken } = await this.issueRefreshToken(payload, tokenFamily.id);

    return {
      accessToken,
      refreshToken: rawToken,
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        registrationType: user.registrationType,
      },
    };
  }

  /**
   * Issue a single refresh token within an existing family.
   * Returns both the raw JWT (to give the client) and the DB record.
   */
  private async issueRefreshToken(
    payload: JwtPayload,
    familyId: string,
  ): Promise<{
    rawToken: string;
    tokenRecord: { id: string; createdAt: Date };
  }> {
    const refreshSecret = this.configService.get<string>("JWT_REFRESH_SECRET");

    const rawToken = this.jwtService.sign(payload, {
      expiresIn: "7d",
      secret: refreshSecret,
    });

    const tokenHash = this.hashToken(rawToken);

    // Decode to get the actual expiry date set by jwtService
    const decoded = this.jwtService.decode(rawToken) as { exp: number } | null;
    const expiresAt = new Date(
      (decoded?.exp ?? Math.floor(Date.now() / 1000) + 604800) * 1000,
    );

    const tokenRecord = await this.prisma.refreshToken.create({
      data: {
        familyId,
        tokenHash,
        expiresAt,
      },
    });

    return { rawToken, tokenRecord };
  }

  /**
   * SHA-256 hash the raw JWT string — a one-way mapping so the DB never
   * stores plaintext tokens.
   */
  private hashToken(rawToken: string): string {
    return crypto.createHash("sha256").update(rawToken).digest("hex");
  }

  private async recordLegalAcceptance(
    userId: string,
    documentType: "privacy_policy" | "terms_and_conditions",
    documentVersion: string,
    ipAddress: string,
  ): Promise<void> {
    await this.prisma.legalAcceptance.upsert({
      where: {
        userId_documentType_documentVersion: {
          userId,
          documentType,
          documentVersion,
        },
      },
      create: {
        userId,
        documentType,
        documentVersion,
        ipAddress,
      },
      update: {
        acceptedAt: new Date(),
      },
    });
  }

  private async sendVerificationEmail(
    email: string,
    code: string,
  ): Promise<void> {
    const appUrl =
      this.configService.get<string>("APP_URL") || "http://localhost:3000";
    const verifyUrl = `${appUrl}/v1/auth/verify-email?token=${code}`;

    const result = await this.emailService.send({
      to: email,
      subject: "Your Matriq verification code",
      html: `
        <div style="font-family: Inter, -apple-system, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px 16px;">
          <h2 style="color: #0D0620; margin-bottom: 16px;">Welcome to Matriq</h2>
          <p style="color: #5C4D82; line-height: 1.6;">
            Thanks for creating an account. Enter the 6-digit code below in the
            app to verify your email address.
          </p>
          <div style="background-color: #F4EEFB; border: 1px solid #E8E0F0; border-radius: 12px; padding: 24px; text-align: center; margin: 20px 0;">
            <div style="font-size: 34px; font-weight: 700; letter-spacing: 10px; color: #6C3BAA; font-family: monospace;">${code}</div>
          </div>
          <p style="color: #8B7AAE; font-size: 14px;">
            This code expires after 24 hours. If you didn't create this account, you can safely ignore this email.
          </p>
          <hr style="border: none; border-top: 1px solid #E8E0F0; margin: 24px 0;" />
          <p style="font-size: 12px; color: #8B7AAE;">
            Prefer a link? <a href="${verifyUrl}" style="color: #6C3BAA;">Verify my email instead</a>
          </p>
        </div>
      `,
    });

    if (!result.success) {
      this.logger.warn(
        `Failed to send verification email to ${email}: ${result.error}`,
      );
    }
  }
}
