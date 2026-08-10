import { Controller, Get, Post, Body, Req, UseGuards } from "@nestjs/common";
import { Request } from "express";
import { IsString, IsNotEmpty, IsIn } from "class-validator";
import { PrismaService } from "../prisma/prisma.service";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { JwtPayload } from "../auth/auth.service";

class AcceptLegalDto {
  @IsString()
  @IsNotEmpty()
  @IsIn(["privacy_policy", "terms_and_conditions"])
  documentType: "privacy_policy" | "terms_and_conditions";

  @IsString()
  @IsNotEmpty()
  documentVersion: string;
}

interface LegalDocument {
  version: string;
  title: string;
  lastUpdated: string;
  sections: Array<{ heading: string; body: string }>;
}

@Controller("v1/legal")
export class LegalController {
  private readonly currentVersions = {
    privacyPolicy: "1.0",
    termsAndConditions: "1.0",
  };

  constructor(private readonly prisma: PrismaService) {}

  // ── Public document endpoints ──────────────────────────────

  @Get("privacy-policy")
  getPrivacyPolicy(): LegalDocument {
    return {
      version: this.currentVersions.privacyPolicy,
      title: "Matriq Privacy Policy",
      lastUpdated: "2026-08-08",
      sections: [
        {
          heading: "1. Information We Collect",
          body: "Matriq collects personal information you provide during registration (name, email, matriculation number, faculty, department, level) and transaction data related to association dues and payments.",
        },
        {
          heading: "2. How We Use Your Information",
          body: "Your information is used to verify your identity within your academic institution, process association dues payments, generate receipts, and provide the AI study companion service.",
        },
        {
          heading: "3. Data Sharing",
          body: "We share your payment information with our payment processor (Paystack) for transaction processing. We do not sell your personal data to third parties.",
        },
        {
          heading: "4. Data Retention",
          body: "We retain your data for as long as your account is active. You may request deletion by contacting us. Financial records are retained as required by applicable law.",
        },
        {
          heading: "5. Your Rights",
          body: "You have the right to access, correct, or delete your personal data. You may withdraw consent at any time. To exercise these rights, contact us at the email below.",
        },
        {
          heading: "6. Security",
          body: "We implement appropriate technical and organizational measures to protect your data, including encryption, access controls, and regular security assessments.",
        },
        {
          heading: "7. Contact",
          body: "For privacy-related inquiries, contact us at privacy@matriq.app.",
        },
        {
          heading: "8. Changes to This Policy",
          body: "We will notify you of any material changes to this policy. Continued use after changes constitutes acceptance of the updated policy.",
        },
      ],
    };
  }

  @Get("terms-and-conditions")
  getTermsAndConditions(): LegalDocument {
    return {
      version: this.currentVersions.termsAndConditions,
      title: "Matriq Terms and Conditions",
      lastUpdated: "2026-08-08",
      sections: [
        {
          heading: "1. Acceptance of Terms",
          body: "By creating a Matriq account, you agree to these terms. If you do not agree, do not use the service.",
        },
        {
          heading: "2. Eligibility",
          body: "You must be a currently enrolled student at a participating institution to use Matriq's core features.",
        },
        {
          heading: "3. Account Responsibilities",
          body: "You are responsible for maintaining the confidentiality of your account credentials and for all activities under your account.",
        },
        {
          heading: "4. Payments",
          body: "Association dues are processed through Paystack. Matriq is not a payment processor. Refunds and disputes are handled per the payment processor's policies and the relevant association's rules.",
        },
        {
          heading: "5. AI Features",
          body: "The AI study companion provides educational assistance. Outputs should be verified for accuracy. Matriq makes no guarantees about the completeness or correctness of AI-generated responses.",
        },
        {
          heading: "6. Acceptable Use",
          body: "You agree not to misuse the service, including submitting harmful content, attempting unauthorized access, or using the AI companion for academic dishonesty.",
        },
        {
          heading: "7. Termination",
          body: "We reserve the right to suspend or terminate accounts that violate these terms. You may delete your account at any time.",
        },
        {
          heading: "8. Limitation of Liability",
          body: "Matriq is provided 'as is.' We are not liable for any damages arising from your use of the service, to the extent permitted by law.",
        },
        {
          heading: "9. Governing Law",
          body: "These terms are governed by the laws of the Federal Republic of Nigeria.",
        },
        {
          heading: "10. Changes to Terms",
          body: "We will notify you of material changes. Continued use after changes constitutes acceptance.",
        },
      ],
    };
  }

  // ── Acceptance tracking ─────────────────────────────────────

  @Post("accept")
  @UseGuards(JwtAuthGuard)
  async accept(
    @Body() dto: AcceptLegalDto,
    @CurrentUser() user: JwtPayload,
    @Req() req: Request,
  ) {
    const ip = (req.ip || req.socket.remoteAddress || "unknown") as string;

    await this.prisma.legalAcceptance.upsert({
      where: {
        userId_documentType_documentVersion: {
          userId: user.sub,
          documentType: dto.documentType,
          documentVersion: dto.documentVersion,
        },
      },
      create: {
        userId: user.sub,
        documentType: dto.documentType,
        documentVersion: dto.documentVersion,
        ipAddress: ip,
      },
      update: {
        acceptedAt: new Date(),
        ipAddress: ip,
      },
    });

    return {
      message: "Accepted",
      documentType: dto.documentType,
      documentVersion: dto.documentVersion,
      acceptedAt: new Date().toISOString(),
    };
  }
}
