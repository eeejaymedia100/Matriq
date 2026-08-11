import { Test, TestingModule } from "@nestjs/testing";
import { ConfigService } from "@nestjs/config";
import { VerificationService } from "./verification.service";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { EmailService } from "../email/email.service";
import { StorageService } from "../storage/storage.service";
import { NotificationsService } from "../notifications/notifications.service";
import { NotFoundException, ForbiddenException } from "@nestjs/common";

describe("VerificationService", () => {
  let service: VerificationService;
  let prisma: jest.Mocked<PrismaService>;
  let email: jest.Mocked<EmailService>;

  const mockMembership = {
    id: "mem-1",
    userId: "user-1",
    associationId: "assoc-1",
    status: "live" as const,
    joinedAt: new Date(),
  };

  const mockRequest = {
    id: "req-1",
    userId: "user-1",
    associationId: "assoc-1",
    documentStorageRef: "verification/assoc-1/user-1/file.png",
    documentOriginalName: "student-id.png",
    documentMimeType: "image/png",
    status: "pending" as const,
    reviewedBy: null,
    reviewedAt: null,
    rejectionReason: null,
    createdAt: new Date(),
    user: {
      id: "user-1",
      fullName: "Test Student",
      email: "test@example.com",
      registrationType: "staylite" as const,
      matricNumber: "DEL/2020/001",
      jambNumber: null,
      faculty: "Science",
      department: "Computer Science",
      level: "300",
    },
  };

  beforeEach(async () => {
    prisma = {
      membership: { findUnique: jest.fn() },
      verificationRequest: {
        create: jest.fn(),
        update: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn(),
      },
      user: {
        update: jest.fn(),
        findUnique: jest.fn().mockResolvedValue({
          email: "test@example.com",
          fullName: "Test Student",
        }),
      },
      association: {
        findUnique: jest.fn().mockResolvedValue({ name: "Test Association" }),
      },
      $transaction: jest.fn((calls: unknown[]) => Promise.all(calls as [])),
    } as unknown as jest.Mocked<PrismaService>;

    const mockAudit: Partial<AuditService> = {
      log: jest.fn().mockResolvedValue(undefined),
    };

    const mockConfig: Partial<ConfigService> = {
      get: jest.fn().mockReturnValue("test-bucket"),
    };

    email = {
      send: jest.fn().mockResolvedValue({ success: true, messageId: "m-1" }),
    } as unknown as jest.Mocked<EmailService>;

    // Object storage disabled by default — verification falls back to the
    // legacy data-URI path (existing behaviour).
    const mockStorage = {
      put: jest.fn().mockResolvedValue(null),
      getDataUri: jest.fn().mockResolvedValue(null),
      isEnabled: false,
    };
    const mockNotifications = {
      push: jest.fn().mockResolvedValue(false),
      notifyUser: jest.fn().mockResolvedValue(false),
      notifyAssociation: jest.fn().mockResolvedValue(false),
      securityAlert: jest.fn().mockResolvedValue(false),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        VerificationService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditService, useValue: mockAudit },
        { provide: ConfigService, useValue: mockConfig },
        { provide: EmailService, useValue: email },
        { provide: StorageService, useValue: mockStorage },
        { provide: NotificationsService, useValue: mockNotifications },
      ],
    }).compile();

    service = module.get<VerificationService>(VerificationService);
  });

  describe("uploadDocument", () => {
    it("should upload and return request id", async () => {
      (prisma.membership.findUnique as jest.Mock).mockResolvedValue(
        mockMembership,
      );
      (prisma.verificationRequest.create as jest.Mock).mockResolvedValue({
        id: "req-1",
        status: "pending",
      });
      (prisma.verificationRequest.update as jest.Mock).mockResolvedValue(
        mockRequest,
      );

      const mockFile = {
        originalname: "student-id.png",
        mimetype: "image/png",
        buffer: Buffer.from("test"),
      } as Express.Multer.File;

      const result = await service.uploadDocument(
        "user-1",
        "assoc-1",
        mockFile,
      );

      expect(result).toEqual({ id: "req-1", status: "pending" });
    });

    it("should reject non-members", async () => {
      (prisma.membership.findUnique as jest.Mock).mockResolvedValue(null);

      const mockFile = {
        originalname: "test.png",
        mimetype: "image/png",
        buffer: Buffer.from("test"),
      } as Express.Multer.File;

      await expect(
        service.uploadDocument("user-1", "assoc-1", mockFile),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe("listRequests", () => {
    it("should return pending requests", async () => {
      (prisma.verificationRequest.findMany as jest.Mock).mockResolvedValue([
        mockRequest,
      ]);

      const result = await service.listRequests("assoc-1", "pending");
      expect(result.requests).toHaveLength(1);
    });
  });

  describe("approve", () => {
    it("should approve a pending request and flip matric_status", async () => {
      (prisma.verificationRequest.findUnique as jest.Mock).mockResolvedValue(
        mockRequest,
      );

      await service.approve("req-1", "assoc-1", "exec-1", "127.0.0.1");

      expect(prisma.$transaction).toHaveBeenCalled();
    });

    it("should reject approving an already-reviewed request", async () => {
      (prisma.verificationRequest.findUnique as jest.Mock).mockResolvedValue({
        ...mockRequest,
        status: "approved",
      });

      await expect(
        service.approve("req-1", "assoc-1", "exec-1", "127.0.0.1"),
      ).rejects.toThrow(ForbiddenException);
    });

    it("should reject approving a request from a different association", async () => {
      (prisma.verificationRequest.findUnique as jest.Mock).mockResolvedValue(
        mockRequest,
      );

      await expect(
        service.approve("req-1", "wrong-assoc", "exec-1", "127.0.0.1"),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe("reject", () => {
    it("should reject a pending request with a reason", async () => {
      (prisma.verificationRequest.findUnique as jest.Mock).mockResolvedValue(
        mockRequest,
      );

      const result = await service.reject(
        "req-1",
        "assoc-1",
        "exec-1",
        "ID card is blurry",
        "127.0.0.1",
      );

      expect(result.message).toContain("rejected");
    });

    it("should throw if request not found", async () => {
      (prisma.verificationRequest.findUnique as jest.Mock).mockResolvedValue(
        null,
      );

      await expect(
        service.reject("req-1", "assoc-1", "exec-1", "bad", "127.0.0.1"),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe("student notifications", () => {
    // notifyStudent is fire-and-forget — flush the microtask/macrotask queue
    // so the mocked email call has definitely been made before asserting.
    const flush = (): Promise<void> =>
      new Promise((resolve) => setTimeout(resolve, 0));

    it("should email the student on approval", async () => {
      (prisma.verificationRequest.findUnique as jest.Mock).mockResolvedValue(
        mockRequest,
      );

      await service.approve("req-1", "assoc-1", "exec-1", "127.0.0.1");
      await flush();

      expect(email.send).toHaveBeenCalledWith(
        expect.objectContaining({
          to: "test@example.com",
          subject: expect.stringContaining("approved"),
          html: expect.stringContaining("Test Association"),
        }),
      );
    });

    it("should email the student the rejection reason", async () => {
      (prisma.verificationRequest.findUnique as jest.Mock).mockResolvedValue(
        mockRequest,
      );

      await service.reject(
        "req-1",
        "assoc-1",
        "exec-1",
        "ID card is blurry",
        "127.0.0.1",
      );
      await flush();

      expect(email.send).toHaveBeenCalledWith(
        expect.objectContaining({
          to: "test@example.com",
          subject: expect.stringContaining("verification"),
          html: expect.stringContaining("blurry"),
        }),
      );
    });

    it("should not throw when the notification email fails", async () => {
      (prisma.verificationRequest.findUnique as jest.Mock).mockResolvedValue(
        mockRequest,
      );
      email.send.mockResolvedValue({
        success: false,
        error: "smtp unavailable",
      });

      await expect(
        service.approve("req-1", "assoc-1", "exec-1", "127.0.0.1"),
      ).resolves.toBeDefined();
      await flush();
      expect(email.send).toHaveBeenCalled();
    });

    it("should skip email when the student has no address", async () => {
      (prisma.verificationRequest.findUnique as jest.Mock).mockResolvedValue(
        mockRequest,
      );
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        email: null,
        fullName: "No Email",
      });

      await service.approve("req-1", "assoc-1", "exec-1", "127.0.0.1");
      await flush();

      expect(email.send).not.toHaveBeenCalled();
    });

    it("should escape the rejection reason in HTML", async () => {
      (prisma.verificationRequest.findUnique as jest.Mock).mockResolvedValue(
        mockRequest,
      );

      await service.reject(
        "req-1",
        "assoc-1",
        "exec-1",
        "<script>alert(1)</script>",
        "127.0.0.1",
      );
      await flush();

      expect(email.send).toHaveBeenCalledWith(
        expect.objectContaining({
          html: expect.stringContaining("&lt;script&gt;"),
        }),
      );
    });
  });
});
