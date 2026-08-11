import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  Logger,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import * as crypto from "node:crypto";
import { PrismaService } from "../prisma/prisma.service";
import { JwtPayload } from "../auth/auth.service";

// Rotating check-in windows (5 minutes). Tokens from the previous window are
// accepted for a short grace period to avoid check-in failures at boundaries.
const CHECKIN_WINDOW_MS = 5 * 60 * 1000;

@Injectable()
export class EventsService {
  private readonly logger = new Logger(EventsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  async list(associationId: string, cursor?: string, take = 20) {
    const association = await this.prisma.association.findUnique({
      where: { id: associationId },
    });
    if (!association) {
      throw new NotFoundException("Association not found");
    }

    const takePlusOne = Math.min(take, 50) + 1;

    const events = await this.prisma.event.findMany({
      where: { associationId },
      take: takePlusOne,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      orderBy: { eventDate: "asc" },
      include: {
        _count: { select: { rsvps: true, attendance: true } },
      },
    });

    const hasMore = events.length > take;
    const items = hasMore ? events.slice(0, take) : events;

    return {
      events: items.map((e) => ({
        id: e.id,
        title: e.title,
        description: e.description,
        location: e.location,
        eventDate: e.eventDate,
        rsvpCount: e._count.rsvps,
        attendanceCount: e._count.attendance,
        createdAt: e.createdAt,
      })),
      pagination: {
        cursor: hasMore ? items[items.length - 1].id : null,
        hasMore,
      },
    };
  }

  async create(
    associationId: string,
    authorExecutiveId: string,
    title: string,
    description: string,
    location: string,
    eventDate: Date,
  ) {
    const event = await this.prisma.event.create({
      data: {
        associationId,
        authorExecutiveId,
        title,
        description,
        location,
        eventDate,
      },
    });

    this.logger.log(
      `Event created: ${event.id} in association ${associationId}`,
    );

    return {
      id: event.id,
      title: event.title,
      description: event.description,
      location: event.location,
      eventDate: event.eventDate,
      createdAt: event.createdAt,
    };
  }

  async toggleRsvp(eventId: string, userId: string) {
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
    });
    if (!event) {
      throw new NotFoundException("Event not found");
    }

    const existing = await this.prisma.eventRsvp.findUnique({
      where: {
        eventId_userId: { eventId, userId },
      },
    });

    if (existing) {
      // Un-RSVP (toggle off)
      await this.prisma.eventRsvp.delete({
        where: { eventId_userId: { eventId, userId } },
      });
      const count = await this.prisma.eventRsvp.count({
        where: { eventId },
      });
      return { rsvp: false, rsvpCount: count };
    }

    // RSVP
    await this.prisma.eventRsvp.create({
      data: { eventId, userId },
    });
    const count = await this.prisma.eventRsvp.count({
      where: { eventId },
    });
    return { rsvp: true, rsvpCount: count };
  }

  // ── QR check-in (event attendance) ────────────────────────────

  /**
   * Issue a check-in token after verifying the caller is an executive of the
   * event's association.
   */
  async generateCheckinTokenFor(user: JwtPayload, eventId: string) {
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
      select: { associationId: true },
    });
    if (!event) throw new NotFoundException("Event not found");

    const match = user.executive?.find(
      (e) => e.associationId === event.associationId,
    );
    if (!match) {
      throw new ForbiddenException(
        "You are not an executive of this event's association",
      );
    }
    return this.generateCheckinToken(eventId, match.id);
  }

  /** Attendance roster after verifying the caller is an executive. */
  async getAttendanceFor(user: JwtPayload, eventId: string) {
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
      select: { associationId: true },
    });
    if (!event) throw new NotFoundException("Event not found");

    const match = user.executive?.find(
      (e) => e.associationId === event.associationId,
    );
    if (!match) {
      throw new ForbiddenException(
        "You are not an executive of this event's association",
      );
    }
    return this.getAttendance(eventId);
  }

  /**
   * Issue a rotating, signed check-in token for an event (executive displays
   * this as a QR code at the door). The token is valid for the current 5-min
   * window (plus a grace window) and is HMAC-signed — it cannot be forged or
   * replayed outside its window.
   */
  async generateCheckinToken(
    eventId: string,
    executiveId: string,
  ): Promise<{
    token: string;
    expiresInSeconds: number;
    windowStartsAt: string;
  }> {
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
    });
    if (!event) throw new NotFoundException("Event not found");

    const now = Date.now();
    const slot = Math.floor(now / CHECKIN_WINDOW_MS);
    const windowStartsAt = new Date(slot * CHECKIN_WINDOW_MS);
    const expiresAt = (slot + 2) * CHECKIN_WINDOW_MS;

    const payload = Buffer.from(
      JSON.stringify({ e: eventId, s: slot }),
    ).toString("base64url");
    const sig = this.signCheckin(eventId, slot);

    this.logger.log(
      `Check-in token issued for event ${eventId} by executive ${executiveId} (slot ${slot})`,
    );

    return {
      token: `${payload}.${sig}`,
      expiresInSeconds: Math.max(1, Math.ceil((expiresAt - now) / 1000)),
      windowStartsAt: windowStartsAt.toISOString(),
    };
  }

  /**
   * Student check-in: verifies the rotating token and records attendance.
   * Idempotent per (event, user) — a second check-in is a no-op.
   */
  async checkIn(
    eventId: string,
    userId: string,
    token: string,
    method = "qr",
  ): Promise<{
    checkedIn: boolean;
    alreadyCheckedIn: boolean;
    attendanceCount: number;
  }> {
    if (!token || !token.includes(".")) {
      throw new BadRequestException("Invalid check-in token");
    }

    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
    });
    if (!event) throw new NotFoundException("Event not found");

    if (!this.verifyCheckinToken(token, eventId)) {
      throw new BadRequestException(
        "Invalid or expired check-in code. Ask the executive to refresh the QR code.",
      );
    }

    // The student must be an active member of the event's association.
    const membership = await this.prisma.membership.findUnique({
      where: {
        userId_associationId: {
          userId,
          associationId: event.associationId,
        },
      },
    });
    if (!membership || membership.status !== "live") {
      throw new BadRequestException(
        "Only active members of this association can check in",
      );
    }

    const existing = await this.prisma.eventAttendance.findUnique({
      where: { eventId_userId: { eventId, userId } },
    });

    if (existing) {
      const count = await this.prisma.eventAttendance.count({
        where: { eventId },
      });
      return {
        checkedIn: false,
        alreadyCheckedIn: true,
        attendanceCount: count,
      };
    }

    await this.prisma.eventAttendance.create({
      data: { eventId, userId, method },
    });

    const count = await this.prisma.eventAttendance.count({
      where: { eventId },
    });
    this.logger.log(`User ${userId} checked in to event ${eventId}`);

    return { checkedIn: true, alreadyCheckedIn: false, attendanceCount: count };
  }

  /** Attendance roster for an event (executive view). */
  async getAttendance(eventId: string) {
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
    });
    if (!event) throw new NotFoundException("Event not found");

    const [records, count] = await Promise.all([
      this.prisma.eventAttendance.findMany({
        where: { eventId },
        orderBy: { checkedInAt: "desc" },
        include: {
          user: {
            select: {
              id: true,
              fullName: true,
              email: true,
              department: true,
              level: true,
            },
          },
        },
      }),
      this.prisma.eventAttendance.count({ where: { eventId } }),
    ]);

    return {
      event: { id: event.id, title: event.title },
      total: count,
      attendance: records.map((r) => ({
        id: r.id,
        checkedInAt: r.checkedInAt,
        method: r.method,
        user: r.user,
      })),
    };
  }

  // ── Private helpers ──────────────────────────────────────────

  private signCheckin(eventId: string, slot: number): string {
    const secret = this.configService.get<string>("JWT_SECRET") ?? "dev-secret";
    return crypto
      .createHmac("sha256", secret)
      .update(`${eventId}:${slot}`)
      .digest("hex")
      .slice(0, 16);
  }

  private verifyCheckinToken(token: string, eventId: string): boolean {
    try {
      const [encodedPayload, sig] = token.split(".");
      if (!encodedPayload || !sig) return false;

      const payload = JSON.parse(
        Buffer.from(encodedPayload, "base64url").toString("utf8"),
      ) as { e?: string; s?: number };

      if (payload.e !== eventId || typeof payload.s !== "number") return false;

      const expectedSig = this.signCheckin(eventId, payload.s);
      const sigMatches =
        sig.length === expectedSig.length &&
        crypto.timingSafeEqual(
          Buffer.from(sig, "utf8"),
          Buffer.from(expectedSig, "utf8"),
        );
      if (!sigMatches) return false;

      // Accept the current window and the previous one (grace period).
      const currentSlot = Math.floor(Date.now() / CHECKIN_WINDOW_MS);
      return payload.s === currentSlot || payload.s === currentSlot - 1;
    } catch {
      return false;
    }
  }
}
