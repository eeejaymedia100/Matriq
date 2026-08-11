import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  Logger,
} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { NotificationsService } from "../notifications/notifications.service";
import { JwtPayload } from "../auth/auth.service";

export interface CreateFeeDto {
  name: string;
  amountKobo: number;
  dueDate: string; // ISO date (YYYY-MM-DD)
  session?: string;
  currency?: string;
}

export interface UpdateFeeDto {
  name?: string;
  amountKobo?: number;
  dueDate?: string;
  session?: string;
  currency?: string;
}

@Injectable()
export class FeesService {
  private readonly logger = new Logger(FeesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly notificationsService: NotificationsService,
  ) {}

  /** Create a fee for an association (president/treasurer). */
  async create(
    associationId: string,
    executiveId: string,
    dto: CreateFeeDto,
    ipAddress: string,
  ) {
    const association = await this.prisma.association.findUnique({
      where: { id: associationId },
    });
    if (!association) throw new NotFoundException("Association not found");

    if (!dto.name?.trim())
      throw new BadRequestException("Fee name is required");
    if (!Number.isInteger(dto.amountKobo) || dto.amountKobo <= 0) {
      throw new BadRequestException(
        "Amount must be a positive whole number (kobo)",
      );
    }
    const dueDate = new Date(dto.dueDate);
    if (Number.isNaN(dueDate.getTime())) {
      throw new BadRequestException("Invalid due date");
    }

    const fee = await this.prisma.fee.create({
      data: {
        associationId,
        name: dto.name.trim(),
        amountKobo: dto.amountKobo,
        currency: dto.currency ?? "NGN",
        dueDate,
        session:
          dto.session?.trim() ||
          `${new Date().getFullYear()}/${new Date().getFullYear() + 1}`,
      },
    });

    await this.auditService.log({
      actorType: "executive",
      actorId: executiveId,
      action: "fee.created",
      targetType: "fee",
      targetId: fee.id,
      ipAddress,
      metadata: {
        associationId,
        name: fee.name,
        amountKobo: fee.amountKobo,
        dueDate: fee.dueDate.toISOString(),
        session: fee.session,
      },
    });

    this.logger.log(
      `Fee created: ${fee.id} (${fee.name}, ₦${(fee.amountKobo / 100).toLocaleString()}) in association ${associationId}`,
    );

    // Announce the new dues to members (fire-and-forget).
    void this.notificationsService.notifyAssociation(
      associationId,
      `New dues: ${fee.name}`,
      `${fee.name} — ₦${(fee.amountKobo / 100).toLocaleString()} (${fee.session}). Due ${dueDate.toISOString().slice(0, 10)}.`,
      { tags: ["money-bag"], priority: 4 },
    );

    return {
      id: fee.id,
      name: fee.name,
      amountKobo: fee.amountKobo,
      currency: fee.currency,
      dueDate: fee.dueDate,
      session: fee.session,
    };
  }

  /**
   * Update an existing fee, resolving the fee's association from the JWT so
   * the caller is validated as a president/treasurer of that association.
   */
  async updateAsExecutive(
    feeId: string,
    user: JwtPayload,
    dto: UpdateFeeDto,
    ipAddress: string,
  ) {
    const fee = await this.prisma.fee.findUnique({ where: { id: feeId } });
    if (!fee) throw new NotFoundException("Fee not found");

    const match = user.executive?.find(
      (e) => e.associationId === fee.associationId,
    );
    if (!match || (match.role !== "president" && match.role !== "treasurer")) {
      throw new ForbiddenException(
        "You must be a president or treasurer of this association",
      );
    }

    return this.update(feeId, match.id, dto, ipAddress);
  }

  /** Update an existing fee (president/treasurer). */
  async update(
    feeId: string,
    executiveId: string,
    dto: UpdateFeeDto,
    ipAddress: string,
  ) {
    const fee = await this.prisma.fee.findUnique({ where: { id: feeId } });
    if (!fee) throw new NotFoundException("Fee not found");

    const data: Record<string, unknown> = {};
    if (dto.name !== undefined) {
      if (!dto.name.trim())
        throw new BadRequestException("Fee name cannot be empty");
      data.name = dto.name.trim();
    }
    if (dto.amountKobo !== undefined) {
      if (!Number.isInteger(dto.amountKobo) || dto.amountKobo <= 0) {
        throw new BadRequestException(
          "Amount must be a positive whole number (kobo)",
        );
      }
      data.amountKobo = dto.amountKobo;
    }
    if (dto.dueDate !== undefined) {
      const dueDate = new Date(dto.dueDate);
      if (Number.isNaN(dueDate.getTime())) {
        throw new BadRequestException("Invalid due date");
      }
      data.dueDate = dueDate;
    }
    if (dto.session !== undefined) data.session = dto.session.trim();
    if (dto.currency !== undefined) data.currency = dto.currency;

    if (Object.keys(data).length === 0) {
      throw new BadRequestException("Nothing to update");
    }

    const updated = await this.prisma.fee.update({
      where: { id: feeId },
      data,
    });

    await this.auditService.log({
      actorType: "executive",
      actorId: executiveId,
      action: "fee.updated",
      targetType: "fee",
      targetId: feeId,
      ipAddress,
      metadata: { changes: data },
    });

    this.logger.log(`Fee updated: ${feeId} by executive ${executiveId}`);

    return {
      id: updated.id,
      name: updated.name,
      amountKobo: updated.amountKobo,
      currency: updated.currency,
      dueDate: updated.dueDate,
      session: updated.session,
    };
  }

  /** Per-fee collection overview for the treasurer dashboard. */
  async overview(associationId: string) {
    const association = await this.prisma.association.findUnique({
      where: { id: associationId },
    });
    if (!association) throw new NotFoundException("Association not found");

    const [fees, memberCount] = await Promise.all([
      this.prisma.fee.findMany({
        where: { associationId },
        orderBy: [{ dueDate: "asc" }],
        include: {
          _count: { select: { payments: true } },
        },
      }),
      this.prisma.membership.count({
        where: { associationId, status: "live" },
      }),
    ]);

    const paidByFee = await this.prisma.payment.groupBy({
      by: ["feeId"],
      where: {
        fee: { associationId },
        status: "successful",
      },
      _count: { _all: true },
      _sum: { amountKobo: true },
    });
    const paidMap = new Map(paidByFee.map((p) => [p.feeId, p]));

    return {
      association: { id: association.id, name: association.name },
      memberCount,
      fees: fees.map((f) => {
        const paid = paidMap.get(f.id);
        return {
          id: f.id,
          name: f.name,
          amountKobo: f.amountKobo,
          currency: f.currency,
          dueDate: f.dueDate,
          session: f.session,
          expectedKobo: f.amountKobo * memberCount,
          paidCount: paid?._count._all ?? 0,
          collectedKobo: paid?._sum.amountKobo ?? 0,
          paymentCount: f._count.payments,
        };
      }),
      total: fees.length,
    };
  }
}
