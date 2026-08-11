import { Test, TestingModule } from "@nestjs/testing";
import { ConfigService } from "@nestjs/config";
import { PaymentsService } from "./payments.service";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { NotificationsService } from "../notifications/notifications.service";

describe("PaymentsService", () => {
  let service: PaymentsService;

  const mockPrisma = {
    fee: {
      findUnique: jest.fn(),
    },
    membership: {
      findUnique: jest.fn(),
    },
    payment: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
    },
    receipt: {
      create: jest.fn(),
    },
    user: {
      findUnique: jest.fn(),
    },
    associationExecutive: {
      findFirst: jest.fn(),
    },
  };

  const mockConfig = {
    get: jest.fn().mockImplementation((key: string) => {
      if (key === "PAYSTACK_SECRET_KEY") return undefined;
      if (key === "JWT_SECRET") return "test-secret";
      return undefined;
    }),
  };

  const mockAudit = {
    log: jest.fn().mockResolvedValue(undefined),
  };

  const mockNotifications = {
    push: jest.fn().mockResolvedValue(false),
    notifyUser: jest.fn().mockResolvedValue(false),
    notifyAssociation: jest.fn().mockResolvedValue(false),
    securityAlert: jest.fn().mockResolvedValue(false),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PaymentsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: ConfigService, useValue: mockConfig },
        { provide: AuditService, useValue: mockAudit },
        { provide: NotificationsService, useValue: mockNotifications },
      ],
    }).compile();

    service = module.get<PaymentsService>(PaymentsService);
    jest.clearAllMocks();
  });

  it("should be defined", () => {
    expect(service).toBeDefined();
  });

  it("should initiate a payment", async () => {
    mockPrisma.fee.findUnique.mockResolvedValue({
      id: "fee1",
      name: "NAAS Dues 2026",
      associationId: "assoc1",
      amountKobo: 500000,
      association: { name: "NAAS" },
    });
    mockPrisma.membership.findUnique.mockResolvedValue({
      status: "live",
    });
    mockPrisma.payment.findFirst.mockResolvedValue(null);
    mockPrisma.user.findUnique.mockResolvedValue({
      email: "student@example.com",
    });
    mockPrisma.payment.create.mockResolvedValue({
      id: "pay1",
      amountKobo: 500000,
      status: "pending",
      internalReference: "MTQ-ABCD1234",
      createdAt: new Date(),
    });

    const result = await service.initiate("u1", { feeId: "fee1" }, "127.0.0.1");

    expect(result.status).toBe("pending");
    expect(result.amountKobo).toBe(500000);
    expect(mockPrisma.payment.create).toHaveBeenCalled();
    expect(mockAudit.log).toHaveBeenCalled();
  });

  it("should reject payment if not a member", async () => {
    mockPrisma.fee.findUnique.mockResolvedValue({
      id: "fee1",
      associationId: "assoc1",
      amountKobo: 500000,
      association: { name: "NAAS" },
    });
    mockPrisma.membership.findUnique.mockResolvedValue(null);

    await expect(
      service.initiate("u1", { feeId: "fee1" }, "127.0.0.1"),
    ).rejects.toThrow("active member");
  });

  it("should get a payment by ID", async () => {
    mockPrisma.payment.findUnique.mockResolvedValue({
      id: "pay1",
      userId: "u1",
      feeId: "fee1",
      amountKobo: 500000,
      status: "successful",
      fee: { name: "NAAS Dues" },
      receipt: null,
    });

    const result = await service.getPayment("pay1", "u1");
    expect(result).toBeDefined();
  });

  it("should throw on non-existent payment", async () => {
    mockPrisma.payment.findUnique.mockResolvedValue(null);

    await expect(service.getPayment("bad-id", "u1")).rejects.toThrow(
      "Payment not found",
    );
  });
});
