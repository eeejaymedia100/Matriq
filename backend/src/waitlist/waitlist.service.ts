import { Injectable, BadRequestException, Logger } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { EmailService } from "../email/email.service";
import { NotificationsService } from "../notifications/notifications.service";

export interface JoinWaitlistDto {
  email: string;
  fullName?: string;
  source?: string;
  painPoint?: string;
  isAssociationExec?: boolean;
  execLevel?: string;
  execDepartment?: string;
  execFaculty?: string;
}

@Injectable()
export class WaitlistService {
  private readonly logger = new Logger(WaitlistService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly emailService: EmailService,
    private readonly notificationsService: NotificationsService,
  ) {}

  /**
   * Add an email to the waitlist. Public endpoint — deliberately forgiving:
   * a duplicate join returns success (never reveals that the email exists),
   * and all follow-up side effects (email, notification) are fire-and-forget.
   */
  async join(
    dto: JoinWaitlistDto,
    ip: string,
    userAgent: string,
  ): Promise<{ message: string; position: number }> {
    const email = dto.email.trim().toLowerCase();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new BadRequestException("A valid email address is required");
    }

    const existing = await this.prisma.waitlistEntry.findUnique({
      where: { email },
    });

    if (existing) {
      // Already on the list — return the same happy message with their position.
      const position =
        (await this.prisma.waitlistEntry.count({
          where: { createdAt: { lte: existing.createdAt } },
        })) ?? 0;
      return { message: "You're on the list!", position };
    }

    const isExec = dto.isAssociationExec === true;
    const entry = await this.prisma.waitlistEntry.create({
      data: {
        email,
        fullName: dto.fullName?.trim().slice(0, 120) || null,
        source: dto.source?.trim().slice(0, 40) || "landing",
        painPoint: dto.painPoint?.trim().slice(0, 500) || null,
        isAssociationExec: isExec,
        execLevel: isExec ? dto.execLevel?.trim().slice(0, 40) || null : null,
        execDepartment: isExec
          ? dto.execDepartment?.trim().slice(0, 120) || null
          : null,
        execFaculty: isExec
          ? dto.execFaculty?.trim().slice(0, 120) || null
          : null,
        ipAddress: ip === "unknown" ? null : ip.slice(0, 64),
        userAgent: userAgent ? userAgent.slice(0, 300) : null,
      },
    });

    const position = await this.prisma.waitlistEntry.count({
      where: { createdAt: { lte: entry.createdAt } },
    });

    this.logger.log(`Waitlist join: ${email} (position ${position})`);

    // Fire-and-forget: never block the join on email/notification latency.
    void this.sendConfirmation(entry.email, entry.fullName, position);
    void this.notificationsService.push({
      topic: "matriq-waitlist",
      title: "New waitlist signup 🎉",
      message: `${entry.fullName ?? entry.email} joined (position #${position}).`,
      tags: ["rocket"],
      priority: 3,
    });

    return { message: "You're on the list!", position };
  }

  /** Public: total number of waitlist signups (no PII). */
  async publicCount(): Promise<number> {
    return this.prisma.waitlistEntry.count();
  }

  /** Admin: paginated waitlist. */
  async adminList(cursor?: string, take = 50) {
    const takePlusOne = Math.min(take, 100) + 1;
    const entries = await this.prisma.waitlistEntry.findMany({
      take: takePlusOne,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      orderBy: { createdAt: "desc" },
    });
    const hasMore = entries.length > take;
    const items = hasMore ? entries.slice(0, take) : entries;
    return {
      entries,
      pagination: {
        cursor: hasMore ? items[items.length - 1].id : null,
        hasMore,
      },
    };
  }

  /** Admin: waitlist stats. */
  async adminStats() {
    const [total, pending, invited, joined, today] = await Promise.all([
      this.prisma.waitlistEntry.count(),
      this.prisma.waitlistEntry.count({ where: { status: "pending" } }),
      this.prisma.waitlistEntry.count({ where: { status: "invited" } }),
      this.prisma.waitlistEntry.count({ where: { status: "joined" } }),
      this.prisma.waitlistEntry.count({
        where: {
          createdAt: { gte: new Date(new Date().setHours(0, 0, 0, 0)) },
        },
      }),
    ]);
    return { total, pending, invited, joined, today };
  }

  // ── Private ─────────────────────────────────────────────────

  private async sendConfirmation(
    email: string,
    fullName: string | null,
    position: number,
  ): Promise<void> {
    const firstName = fullName?.split(" ")[0] ?? "there";
    const result = await this.emailService.send({
      to: email,
      subject: "You're on the Matriq waitlist 🚀",
      html: `
        <div style="font-family: Inter, Arial, sans-serif; max-width: 480px; margin: 0 auto; color: #1a1a1a;">
          <h2 style="color: #0D0620;">Welcome to Matriq</h2>
          <p>Hi ${firstName},</p>
          <p>
            You're on the list! You're <strong>#${position}</strong> in line.
            Matriq is the smart way to get through semester — past questions,
            offline AI, and the tools you actually reach for daily, in one app.
          </p>
          <p style="font-size: 12px; color: #8B7AAE;">
            We'll email you as soon as early access opens.
          </p>
          <hr style="border: none; border-top: 1px solid #E8E0F0; margin: 24px 0;" />
          <p style="font-size: 12px; color: #8B7AAE;">Matriq &middot; Built for Nigerian student communities</p>
        </div>
      `,
      text: `Welcome to Matriq!\n\nHi ${firstName},\n\nYou're on the list — you're #${position} in line. Matriq is the smart way to get through semester: past questions, offline AI, and the tools you actually reach for daily, in one app.\n\nWe'll email you when early access opens.\n\n— Matriq`,
    });

    if (!result.success) {
      this.logger.warn(
        `Waitlist confirmation email failed for ${email}: ${result.error}`,
      );
    }
  }
}
