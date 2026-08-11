import { Test, TestingModule } from "@nestjs/testing";
import { BadRequestException } from "@nestjs/common";
import { WaitlistService } from "./waitlist.service";
import { PrismaService } from "../prisma/prisma.service";
import { EmailService } from "../email/email.service";
import { NotificationsService } from "../notifications/notifications.service";

describe("WaitlistService", () => {
  let service: WaitlistService;
  let prisma: jest.Mocked<PrismaService>;
  let email: jest.Mocked<EmailService>;

  beforeEach(async () => {
    prisma = {
      waitlistEntry: {
        findUnique: jest.fn(),
        create: jest.fn(),
        count: jest.fn(),
        findMany: jest.fn(),
      },
    } as unknown as jest.Mocked<PrismaService>;

    email = {
      send: jest.fn().mockResolvedValue({ success: true, messageId: "m1" }),
    } as unknown as jest.Mocked<EmailService>;

    const mockNotifications = {
      push: jest.fn().mockResolvedValue(true),
      notifyUser: jest.fn().mockResolvedValue(true),
      notifyAssociation: jest.fn().mockResolvedValue(true),
      securityAlert: jest.fn().mockResolvedValue(true),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WaitlistService,
        { provide: PrismaService, useValue: prisma },
        { provide: EmailService, useValue: email },
        { provide: NotificationsService, useValue: mockNotifications },
      ],
    }).compile();

    service = module.get<WaitlistService>(WaitlistService);
  });

  it("should be defined", () => {
    expect(service).toBeDefined();
  });

  it("rejects an invalid email", async () => {
    await expect(
      service.join({ email: "not-an-email" }, "127.0.0.1", ""),
    ).rejects.toThrow(BadRequestException);
  });

  it("creates an entry and returns the position", async () => {
    (prisma.waitlistEntry.findUnique as jest.Mock).mockResolvedValue(null);
    const created = {
      id: "w1",
      email: "student@example.com",
      createdAt: new Date(),
    };
    (prisma.waitlistEntry.create as jest.Mock).mockResolvedValue(created);
    (prisma.waitlistEntry.count as jest.Mock).mockResolvedValue(7);

    const result = await service.join(
      { email: "Student@Example.com " },
      "1.2.3.4",
      "test-agent",
    );

    expect(result).toEqual({ message: "You're on the list!", position: 7 });
    // Email is normalized to lowercase/trimmed before storing.
    expect(prisma.waitlistEntry.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ email: "student@example.com" }),
      }),
    );
    // Confirmation email is sent (fire-and-forget).
    await new Promise((r) => setTimeout(r, 0));
    expect(email.send).toHaveBeenCalled();
  });

  it("returns success (with position) for an existing email without duplicating", async () => {
    (prisma.waitlistEntry.findUnique as jest.Mock).mockResolvedValue({
      id: "w1",
      email: "student@example.com",
      createdAt: new Date(),
    });
    (prisma.waitlistEntry.count as jest.Mock).mockResolvedValue(3);

    const result = await service.join(
      { email: "student@example.com" },
      "127.0.0.1",
      "",
    );

    expect(result.position).toBe(3);
    expect(prisma.waitlistEntry.create).not.toHaveBeenCalled();
  });
});
