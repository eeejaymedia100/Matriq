import { Injectable, BadRequestException, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { generateSecret, generateURI, verify } from "otplib";
import * as qrcode from "qrcode";
import { PrismaService } from "../prisma/prisma.service";

export interface MfaEnrollResponse {
  secret: string;
  qrCodeDataUrl: string;
  uri: string;
}

@Injectable()
export class MfaService {
  private readonly logger = new Logger(MfaService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Generate a TOTP secret and QR code for the user to scan.
   * Does NOT enable MFA yet — that happens after successful verification.
   */
  async enroll(userId: string): Promise<MfaEnrollResponse> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new BadRequestException("User not found");
    }

    const appName = this.configService.get<string>("MFA_APP_NAME") || "Matriq";

    const secret = generateSecret();
    const uri = generateURI({
      label: user.email,
      issuer: appName,
      secret,
    });

    const qrCodeDataUrl = await qrcode.toDataURL(uri);

    // Store the secret (but don't enable MFA yet)
    await this.prisma.user.update({
      where: { id: userId },
      data: { mfaSecret: secret },
    });

    this.logger.log(`MFA enrollment initiated for user ${userId}`);

    return { secret, qrCodeDataUrl, uri };
  }

  /**
   * Verify a TOTP token and enable MFA for the user if successful.
   */
  async verifyAndEnable(
    userId: string,
    token: string,
  ): Promise<{ message: string }> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user || !user.mfaSecret) {
      throw new BadRequestException(
        "MFA enrollment not initiated. Call /mfa/enroll first.",
      );
    }

    const result = await verify({
      token,
      secret: user.mfaSecret,
    });

    if (!result.valid) {
      throw new BadRequestException("Invalid verification code");
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: { mfaEnabled: true },
    });

    this.logger.log(`MFA enabled for user ${userId}`);
    return { message: "MFA enabled successfully" };
  }

  /**
   * Verify a TOTP token during login (without enabling/disabling).
   * Used as the second factor during login for MFA-enabled accounts.
   */
  async verifyToken(userId: string, token: string): Promise<boolean> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user || !user.mfaSecret) {
      return false;
    }

    const result = await verify({
      token,
      secret: user.mfaSecret,
    });

    return result.valid;
  }

  /**
   * Disable MFA for a user.
   */
  async disable(userId: string): Promise<{ message: string }> {
    await this.prisma.user.update({
      where: { id: userId },
      data: { mfaEnabled: false, mfaSecret: null },
    });

    this.logger.log(`MFA disabled for user ${userId}`);
    return { message: "MFA disabled" };
  }

  /**
   * Get MFA status for the current user.
   */
  async status(userId: string): Promise<{ mfaEnabled: boolean }> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { mfaEnabled: true },
    });

    return { mfaEnabled: user?.mfaEnabled ?? false };
  }
}
