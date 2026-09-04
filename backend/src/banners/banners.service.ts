import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";

/**
 * Admin-controlled Home banners.
 *
 * Two surfaces:
 *  - `listActive()` — what students see: published banners whose schedule
 *    window (startsAt/endsAt) is open right now, ordered by sortOrder then
 *    newest first. Served to authenticated students on Home.
 *  - Admin CRUD — create / edit / publish / reorder / schedule / remove.
 *    Distinct from association-scoped announcements (announcements module).
 */

export interface BannerInput {
  title: string;
  body: string;
  linkLabel?: string | null;
  linkUrl?: string | null;
  published?: boolean;
  startsAt?: string | null; // ISO datetime
  endsAt?: string | null; // ISO datetime
  sortOrder?: number;
}

function toDate(v: string | null | undefined): Date | null | undefined {
  if (v === null) return null;
  if (v === undefined || v === "") return undefined;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) {
    throw new BadRequestException("Invalid datetime provided.");
  }
  return d;
}

// Length caps — a Home banner strip is a headline surface, not a noticeboard.
// Capped server-side so the admin console can never push a wall of text onto
// every student's Home screen.
const MAX_TITLE = 120;
const MAX_BODY = 500;
const MAX_LINK_LABEL = 40;

function validateBannerText(input: {
  title?: string | null;
  body?: string | null;
  linkLabel?: string | null;
}) {
  if (input.title !== undefined && input.title !== null) {
    if (!input.title.trim()) throw new BadRequestException("Title is required.");
    if (input.title.length > MAX_TITLE) {
      throw new BadRequestException(`Title must be at most ${MAX_TITLE} characters.`);
    }
  }
  if (input.body !== undefined && input.body !== null) {
    if (!input.body.trim()) throw new BadRequestException("Body is required.");
    if (input.body.length > MAX_BODY) {
      throw new BadRequestException(`Body must be at most ${MAX_BODY} characters.`);
    }
  }
  if (input.linkLabel !== undefined && input.linkLabel !== null && input.linkLabel.length > MAX_LINK_LABEL) {
    throw new BadRequestException(`Link label must be at most ${MAX_LINK_LABEL} characters.`);
  }
}

function validateSchedule(startsAt: Date | null | undefined, endsAt: Date | null | undefined) {
  if (startsAt && endsAt && startsAt > endsAt) {
    throw new BadRequestException("Start time must be before end time.");
  }
}

@Injectable()
export class BannersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** Banners currently visible to students (published + schedule open). */
  async listActive() {
    const now = new Date();
    const banners = await this.prisma.banner.findMany({
      where: {
        published: true,
        OR: [
          { startsAt: null },
          { startsAt: { lte: now } },
        ],
        AND: [
          {
            OR: [{ endsAt: null }, { endsAt: { gte: now } }],
          },
        ],
      },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
      take: 10,
    });
    return { banners };
  }

  /** Every banner (admin console) — draft and published, any schedule. */
  async listAll() {
    const banners = await this.prisma.banner.findMany({
      orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
    });
    const now = new Date();
    return {
      banners: banners.map((b) => ({
        ...b,
        live: b.published && (!b.startsAt || b.startsAt <= now) && (!b.endsAt || b.endsAt >= now),
      })),
    };
  }

  async create(input: BannerInput, ip = "unknown") {
    if (!input.title?.trim() || !input.body?.trim()) {
      throw new BadRequestException("Title and body are required.");
    }
    if (input.linkUrl && !/^https?:\/\//i.test(input.linkUrl)) {
      throw new BadRequestException("linkUrl must be an http(s) URL.");
    }
    validateBannerText(input);
    const startsAt = toDate(input.startsAt) ?? null;
    const endsAt = toDate(input.endsAt) ?? null;
    validateSchedule(startsAt, endsAt);
    const banner = await this.prisma.banner.create({
      data: {
        title: input.title.trim(),
        body: input.body.trim(),
        linkLabel: input.linkLabel?.trim() || null,
        linkUrl: input.linkUrl?.trim() || null,
        published: input.published ?? false,
        startsAt,
        endsAt,
        sortOrder: input.sortOrder ?? 0,
      },
    });
    await this.audit.log({
      actorType: "admin",
      actorId: "system",
      action: "banner.created",
      targetType: "banner",
      targetId: banner.id,
      ipAddress: ip,
      metadata: { title: banner.title, published: banner.published },
    });
    return banner;
  }

  async update(id: string, input: Partial<BannerInput>, ip = "unknown") {
    const existing = await this.prisma.banner.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException("Banner not found.");
    if (input.linkUrl && !/^https?:\/\//i.test(input.linkUrl)) {
      throw new BadRequestException("linkUrl must be an http(s) URL.");
    }
    validateBannerText(input);
    const startsAt = input.startsAt !== undefined ? toDate(input.startsAt) ?? null : undefined;
    const endsAt = input.endsAt !== undefined ? toDate(input.endsAt) ?? null : undefined;
    validateSchedule(
      startsAt !== undefined ? startsAt : existing.startsAt,
      endsAt !== undefined ? endsAt : existing.endsAt,
    );
    const updated = await this.prisma.banner.update({
      where: { id },
      data: {
        ...(input.title !== undefined ? { title: input.title.trim() } : {}),
        ...(input.body !== undefined ? { body: input.body.trim() } : {}),
        ...(input.linkLabel !== undefined
          ? { linkLabel: input.linkLabel?.trim() || null }
          : {}),
        ...(input.linkUrl !== undefined
          ? { linkUrl: input.linkUrl?.trim() || null }
          : {}),
        ...(input.published !== undefined ? { published: input.published } : {}),
        ...(startsAt !== undefined ? { startsAt } : {}),
        ...(endsAt !== undefined ? { endsAt } : {}),
        ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
      },
    });
    await this.audit.log({
      actorType: "admin",
      actorId: "system",
      action: "banner.updated",
      targetType: "banner",
      targetId: updated.id,
      ipAddress: ip,
      metadata: { published: updated.published },
    });
    return updated;
  }

  async remove(id: string, ip = "unknown") {
    const existing = await this.prisma.banner.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException("Banner not found.");
    await this.prisma.banner.delete({ where: { id } });
    await this.audit.log({
      actorType: "admin",
      actorId: "system",
      action: "banner.deleted",
      targetType: "banner",
      targetId: id,
      ipAddress: ip,
      metadata: { title: existing.title },
    });
    return { ok: true };
  }

  /** Bulk reorder: [{ id, sortOrder }] — applied in one transaction. */
  async reorder(items: Array<{ id: string; sortOrder: number }>, ip = "unknown") {
    if (!Array.isArray(items) || items.length === 0) {
      throw new BadRequestException("Reorder list is required.");
    }
    const ids = new Set(items.map((i) => i.id));
    if (ids.size !== items.length) {
      throw new BadRequestException("Duplicate banner ids in reorder list.");
    }
    await this.prisma.$transaction(
      items.map((item) =>
        this.prisma.banner.update({
          where: { id: item.id },
          data: { sortOrder: item.sortOrder },
        }),
      ),
    );
    await this.audit.log({
      actorType: "admin",
      actorId: "system",
      action: "banner.reordered",
      targetType: "banner",
      ipAddress: ip,
      metadata: { count: items.length },
    });
    return this.listAll();
  }
}