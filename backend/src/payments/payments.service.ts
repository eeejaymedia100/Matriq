import {
  Injectable,
  BadRequestException,
  NotFoundException,
  UnauthorizedException,
  Logger,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import * as crypto from "node:crypto";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";

export interface InitiatePaymentDto {
  feeId: string;
}

export interface PaymentResponse {
  id: string;
  amountKobo: number;
  status: string;
  internalReference: string;
  checkoutUrl: string | null;
  createdAt: Date;
}

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly auditService: AuditService,
  ) {}

  /**
   * Initiate a payment for a specific fee.
   * Creates a pending payment record and returns a checkout reference.
   * In production, this calls Paystack's initialize endpoint.
   */
  async initiate(
    userId: string,
    dto: InitiatePaymentDto,
    ipAddress: string,
  ): Promise<PaymentResponse> {
    // Verify the fee exists and the user is a member of its association
    const fee = await this.prisma.fee.findUnique({
      where: { id: dto.feeId },
      include: { association: true },
    });

    if (!fee) {
      throw new NotFoundException("Fee not found");
    }

    // Check membership
    const membership = await this.prisma.membership.findUnique({
      where: {
        userId_associationId: {
          userId,
          associationId: fee.associationId,
        },
      },
    });

    if (!membership || membership.status !== "live") {
      throw new BadRequestException(
        "You must be an active member of this association to pay dues",
      );
    }

    // Check for existing successful payment
    const existingPayment = await this.prisma.payment.findFirst({
      where: {
        userId,
        feeId: fee.id,
        status: "successful",
      },
    });

    if (existingPayment) {
      throw new BadRequestException("You have already paid this fee");
    }

    const internalReference = `MTQ-${crypto.randomBytes(8).toString("hex").toUpperCase()}`;

    const paystackSecret = this.configService.get<string>(
      "PAYSTACK_SECRET_KEY",
    );

    let gatewayReference: string | null = null;
    let checkoutUrl: string | null = null;

    if (paystackSecret) {
      // Real Paystack integration
      try {
        const response = await fetch(
          "https://api.paystack.co/transaction/initialize",
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${paystackSecret}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              email: (
                await this.prisma.user.findUnique({ where: { id: userId } })
              )?.email,
              amount: fee.amountKobo,
              reference: internalReference,
              metadata: {
                userId,
                feeId: fee.id,
                feeName: fee.name,
              },
            }),
          },
        );

        const data = (await response.json()) as {
          status: boolean;
          data?: { reference: string; authorization_url: string };
        };

        if (data.status && data.data) {
          gatewayReference = data.data.reference;
          checkoutUrl = data.data.authorization_url;
        }
      } catch (err) {
        this.logger.warn(
          `Paystack initialize call failed, falling back to offline mode: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    // Create the payment record
    const payment = await this.prisma.payment.create({
      data: {
        userId,
        feeId: fee.id,
        amountKobo: fee.amountKobo,
        status: "pending",
        internalReference,
        gatewayReference,
      },
    });

    // Audit log
    await this.auditService.log({
      actorType: "executive",
      actorId: userId,
      action: "payment.initiated",
      targetType: "payment",
      targetId: payment.id,
      ipAddress,
      metadata: {
        feeId: fee.id,
        feeName: fee.name,
        amountKobo: fee.amountKobo,
        internalReference,
      },
    });

    this.logger.log(
      `Payment initiated: ${payment.id} by user ${userId} for fee ${fee.name}`,
    );

    return {
      id: payment.id,
      amountKobo: payment.amountKobo,
      status: payment.status,
      internalReference: payment.internalReference,
      checkoutUrl,
      createdAt: payment.createdAt,
    };
  }

  /**
   * Process Paystack webhook.
   * This is the ONLY path that transitions a payment to "successful".
   * Signature verification is mandatory.
   */
  async handlePaystackWebhook(
    signature: string,
    body: Record<string, unknown>,
  ): Promise<{ message: string }> {
    const paystackSecret = this.configService.get<string>(
      "PAYSTACK_SECRET_KEY",
    );

    if (!paystackSecret) {
      throw new BadRequestException("Payment gateway not configured");
    }

    // Verify Paystack signature
    const hash = crypto
      .createHmac("sha512", paystackSecret)
      .update(JSON.stringify(body))
      .digest("hex");

    if (hash !== signature) {
      this.logger.warn("Paystack webhook: invalid signature");
      throw new UnauthorizedException("Invalid signature");
    }

    const event = body.event as string;
    const data = body.data as Record<string, unknown> | undefined;

    if (!data) {
      throw new BadRequestException("Missing event data");
    }

    if (event === "charge.success") {
      const reference = data.reference as string;
      await this.markPaymentSuccessful(reference, data);
    } else if (event === "charge.failed") {
      const reference = data.reference as string;
      await this.markPaymentFailed(reference);
    }

    return { message: "Webhook processed" };
  }

  /**
   * Get a single payment by ID.
   */
  async getPayment(
    paymentId: string,
    userId: string,
  ): Promise<Record<string, unknown>> {
    const payment = await this.prisma.payment.findUnique({
      where: { id: paymentId },
      include: {
        fee: true,
        receipt: true,
      },
    });

    if (!payment) {
      throw new NotFoundException("Payment not found");
    }

    // Only the payer or an executive of the association can view
    if (payment.userId !== userId) {
      // Check if user is executive of this association
      const fee = await this.prisma.fee.findUnique({
        where: { id: payment.feeId },
      });
      if (fee) {
        const isExec = await this.prisma.associationExecutive.findFirst({
          where: {
            userId,
            associationId: fee.associationId,
          },
        });
        if (!isExec) {
          throw new UnauthorizedException("Access denied");
        }
      }
    }

    return payment as unknown as Record<string, unknown>;
  }

  /**
   * Get receipt for a payment.
   */
  async getReceipt(
    paymentId: string,
    userId: string,
  ): Promise<Record<string, unknown>> {
    const payment = await this.prisma.payment.findUnique({
      where: { id: paymentId },
      include: { receipt: true, fee: true },
    });

    if (!payment || payment.userId !== userId) {
      throw new NotFoundException("Receipt not found");
    }

    if (!payment.receipt) {
      throw new NotFoundException("No receipt issued yet for this payment");
    }

    return payment.receipt as unknown as Record<string, unknown>;
  }

  /**
   * Generate a shareable payment card payload.
   */
  async generateShareCard(
    paymentId: string,
    userId: string,
  ): Promise<Record<string, unknown>> {
    const payment = await this.prisma.payment.findUnique({
      where: { id: paymentId },
      include: {
        fee: true,
        receipt: true,
        user: { select: { fullName: true, level: true, department: true } },
      },
    });

    if (!payment || payment.userId !== userId) {
      throw new NotFoundException("Payment not found");
    }

    if (!payment.receipt) {
      throw new NotFoundException("No receipt yet for this payment");
    }

    return {
      payerName: payment.user.fullName,
      level: payment.user.level,
      department: payment.user.department,
      feeName: payment.fee.name,
      amountKobo: payment.amountKobo,
      session: payment.fee.session,
      receiptNumber: payment.receipt.receiptNumber,
      paidAt: payment.paidAt,
      verified: !!payment.receipt.verifiedAt,
    };
  }

  // ── Private helpers ──────────────────────────────────────────

  private async markPaymentSuccessful(
    reference: string,
    gatewayData: Record<string, unknown>,
  ): Promise<void> {
    const payment = await this.prisma.payment.findFirst({
      where: { internalReference: reference },
    });

    if (!payment) {
      this.logger.warn(`Webhook: payment not found for reference ${reference}`);
      return;
    }

    if (payment.status === "successful") {
      return; // Idempotent
    }

    const amount = gatewayData.amount as number; // Paystack returns in kobo
    const channel = gatewayData.channel as string;
    const paidAtRaw = gatewayData.paid_at as string;

    // Count how many have already paid this fee for ranking
    const paidCount = await this.prisma.payment.count({
      where: {
        feeId: payment.feeId,
        status: "successful",
      },
    });

    await this.prisma.payment.update({
      where: { id: payment.id },
      data: {
        status: "successful",
        method: channel ?? "unknown",
        paidAt: paidAtRaw ? new Date(paidAtRaw) : new Date(),
        rankAtPayment: paidCount + 1,
      },
    });

    // Generate receipt
    const receiptNumber = `RCP-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(3).toString("hex").toUpperCase()}`;
    const qrPayload = JSON.stringify({
      r: receiptNumber,
      p: payment.id,
      a: amount ?? payment.amountKobo,
      s: crypto
        .createHmac(
          "sha256",
          this.configService.get<string>("JWT_SECRET") ?? "dev-secret",
        )
        .update(`${receiptNumber}:${payment.id}`)
        .digest("hex")
        .slice(0, 16),
    });

    await this.prisma.receipt.create({
      data: {
        paymentId: payment.id,
        receiptNumber,
        qrPayload,
      },
    });

    this.logger.log(
      `Payment ${payment.id} marked successful, receipt ${receiptNumber} issued`,
    );
  }

  private async markPaymentFailed(reference: string): Promise<void> {
    const payment = await this.prisma.payment.findFirst({
      where: { internalReference: reference },
    });

    if (!payment) return;

    await this.prisma.payment.update({
      where: { id: payment.id },
      data: { status: "failed" },
    });

    this.logger.log(`Payment ${payment.id} marked failed`);
  }
}
