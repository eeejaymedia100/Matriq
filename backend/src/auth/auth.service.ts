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

    const verificationToken = crypto.randomBytes(32).toString("hex");

    const user = await this.prisma.user.create({
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
        verificationToken,
      },
    });

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

    await this.sendVerificationEmail(user.email, verificationToken);

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

    const verificationToken = crypto.randomBytes(32).toString("hex");

    const user = await this.prisma.user.create({
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
        verificationToken,
      },
    });

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

    await this.sendVerificationEmail(user.email, verificationToken);

    this.logger.log(
      `Fresher user registered (unverified): ${user.id} (${user.email})`,
    );
    return {
      message:
        "Registration successful. Please check your email to verify your account.",
    };
  }

  // ── Email verification ───────────────────────────────────────

  async verifyEmail(token: string): Promise<AuthResponse> {
    const user = await this.prisma.user.findUnique({
      where: { verificationToken: token },
    });

    if (!user) {
      throw new BadRequestException("Invalid or expired verification token");
    }

    if (user.emailVerified) {
      return this.generateTokens(user);
    }

    const updated = await this.prisma.user.update({
      where: { id: user.id },
      data: {
        emailVerified: true,
        verificationToken: null,
      },
    });

    this.logger.log(`Email verified: ${updated.id} (${updated.email})`);
    return this.generateTokens(updated);
  }

  // ── Login ─────────────────────────────────────────────────────

  async login(dto: LoginDto): Promise<LoginResult> {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    if (!user || !user.passwordHash) {
      throw new UnauthorizedException("Invalid email or password");
    }

    if (!user.emailVerified) {
      throw new UnauthorizedException("Invalid email or password");
    }

    const valid = await argon2.verify(user.passwordHash, dto.password);
    if (!valid) {
      throw new UnauthorizedException("Invalid email or password");
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
    token: string,
  ): Promise<void> {
    const appUrl =
      this.configService.get<string>("APP_URL") || "http://localhost:3000";
    const verifyUrl = `${appUrl}/v1/auth/verify-email?token=${token}`;

    const result = await this.emailService.send({
      to: email,
      subject: "Verify your Matriq account",
      html: `
        <div style="font-family: Inter, -apple-system, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px 16px;">
          <h2 style="color: #0D0620; margin-bottom: 16px;">Welcome to Matriq</h2>
          <p style="color: #5C4D82; line-height: 1.6;">
            Thanks for creating an account. Please verify your email address by clicking the button below.
          </p>
          <a href="${verifyUrl}" 
             style="display: inline-block; background-color: #6C3BAA; color: white; 
                    padding: 12px 32px; border-radius: 8px; text-decoration: none; 
                    font-weight: 600; margin: 16px 0;">
            Verify Email
          </a>
          <p style="color: #8B7AAE; font-size: 14px;">
            This link expires after 24 hours. If you didn't create this account, you can safely ignore this email.
          </p>
          <hr style="border: none; border-top: 1px solid #E8E0F0; margin: 24px 0;" />
          <p style="font-size: 12px; color: #8B7AAE;">
            If the button doesn't work, copy and paste this link:<br/>
            <a href="${verifyUrl}" style="color: #6C3BAA;">${verifyUrl}</a>
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
