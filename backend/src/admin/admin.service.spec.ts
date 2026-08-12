import { Test, TestingModule } from "@nestjs/testing";
import { JwtService } from "@nestjs/jwt";
import { ConfigService } from "@nestjs/config";
import { AdminAuthService } from "./admin-auth.service";
import { AdminService } from "./admin.service";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { AiService } from "../ai/ai.service";
import { NotificationsService } from "../notifications/notifications.service";

// Mock otplib to avoid ESM/CJS compatibility issues
jest.mock("otplib", () => ({
  generateSecret: () => "MOCKEDSECRET123456",
  generateURI: ({
    label,
    issuer,
    secret,
  }: {
    label: string;
    issuer: string;
    secret: string;
  }) =>
    `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(label)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}`,
  verify: jest.fn(),
}));

// Mock argon2 to avoid real hashing in tests (same factory pattern as
// auth.service.spec.ts — dynamic-import + spyOn breaks under esModuleInterop
// because module namespace objects are non-configurable).
jest.mock("argon2", () => ({
  hash: jest.fn().mockResolvedValue("hashed"),
  verify: jest.fn(),
}));

import { verify as verifyArgon2 } from "argon2";
import { verify as verifyTotp } from "otplib";

const mockVerifyTotp = verifyTotp as jest.MockedFunction<typeof verifyTotp>;
const mockVerifyArgon2 = verifyArgon2 as jest.MockedFunction<
  typeof verifyArgon2
>;

describe("AdminAuthService", () => {
  let service: AdminAuthService;
  let prisma: {
    adminAccount: {
      findUnique: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
    };
  };
  let audit: { log: jest.Mock };
  let jwt: { signAsync: jest.Mock; verify: jest.Mock };

  beforeEach(async () => {
    prisma = {
      adminAccount: {
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
    };
    audit = { log: jest.fn() };
    jwt = {
      signAsync: jest.fn().mockResolvedValue("jwt-token"),
      verify: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminAuthService,
        { provide: PrismaService, useValue: prisma },
        { provide: JwtService, useValue: jwt },
        { provide: AuditService, useValue: audit },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockReturnValue(undefined),
            getOrThrow: jest.fn().mockReturnValue("test-secret"),
          },
        },
        {
          provide: NotificationsService,
          useValue: {
            push: jest.fn().mockResolvedValue(false),
            notifyUser: jest.fn().mockResolvedValue(false),
            notifyAssociation: jest.fn().mockResolvedValue(false),
            securityAlert: jest.fn().mockResolvedValue(false),
          },
        },
      ],
    }).compile();

    service = module.get<AdminAuthService>(AdminAuthService);
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe("login", () => {
    it("rejects non-existent admin", async () => {
      prisma.adminAccount.findUnique.mockResolvedValue(null);
      await expect(
        service.login("x@test.com", "pass", "127.0.0.1"),
      ).rejects.toThrow("Invalid credentials");
    });

    it("rejects wrong password", async () => {
      prisma.adminAccount.findUnique.mockResolvedValue({
        id: "a1",
        email: "admin@test.com",
        passwordHash: "$argon2id$v=19$m=65536,t=3,p=4$hash",
        mfaEnabled: false,
        mfaSecret: null,
      });
      mockVerifyArgon2.mockResolvedValueOnce(false);

      await expect(
        service.login("admin@test.com", "wrong", "127.0.0.1"),
      ).rejects.toThrow("Invalid credentials");
    });

    it("issues a token for a non-MFA admin", async () => {
      prisma.adminAccount.findUnique.mockResolvedValue({
        id: "a1",
        email: "admin@test.com",
        passwordHash: "hash",
        mfaEnabled: false,
        mfaSecret: null,
      });
      mockVerifyArgon2.mockResolvedValueOnce(true);

      const result = await service.login("admin@test.com", "pass", "127.0.0.1");

      expect(result).not.toHaveProperty("mfaRequired");
      expect((result as { accessToken: string }).accessToken).toBe("jwt-token");
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: "admin.login" }),
      );
    });

    it("returns a challenge token instead of tokens when MFA is enabled", async () => {
      prisma.adminAccount.findUnique.mockResolvedValue({
        id: "a1",
        email: "admin@test.com",
        passwordHash: "hash",
        mfaEnabled: true,
        mfaSecret: "SECRET",
      });
      mockVerifyArgon2.mockResolvedValueOnce(true);

      const result = await service.login("admin@test.com", "pass", "127.0.0.1");

      expect(result).toEqual({
        mfaRequired: true,
        challengeToken: "jwt-token",
      });
      // No tokens issued, no audit log yet
      expect(audit.log).not.toHaveBeenCalled();
      expect(jwt.signAsync).toHaveBeenCalledWith(
        expect.objectContaining({ purpose: "admin-mfa-login" }),
        expect.objectContaining({ expiresIn: "5m" }),
      );
    });
  });

  describe("completeMfaLogin", () => {
    it("rejects an invalid challenge token", async () => {
      jwt.verify.mockImplementation(() => {
        throw new Error("bad token");
      });

      await expect(
        service.completeMfaLogin("bad-token", "123456", "127.0.0.1"),
      ).rejects.toThrow("Invalid or expired challenge");
    });

    it("rejects a challenge with the wrong purpose", async () => {
      jwt.verify.mockReturnValue({ sub: "a1", purpose: "other" });

      await expect(
        service.completeMfaLogin("challenge", "123456", "127.0.0.1"),
      ).rejects.toThrow("Invalid or expired challenge");
    });

    it("rejects an invalid TOTP code", async () => {
      jwt.verify.mockReturnValue({
        sub: "a1",
        email: "admin@test.com",
        purpose: "admin-mfa-login",
      });
      prisma.adminAccount.findUnique.mockResolvedValue({
        id: "a1",
        email: "admin@test.com",
        mfaEnabled: true,
        mfaSecret: "SECRET",
      });
      mockVerifyTotp.mockResolvedValue({ valid: false });

      await expect(
        service.completeMfaLogin("challenge", "000000", "127.0.0.1"),
      ).rejects.toThrow("Invalid authentication code");
    });

    it("issues a token on valid challenge + TOTP", async () => {
      jwt.verify.mockReturnValue({
        sub: "a1",
        email: "admin@test.com",
        purpose: "admin-mfa-login",
      });
      prisma.adminAccount.findUnique.mockResolvedValue({
        id: "a1",
        email: "admin@test.com",
        mfaEnabled: true,
        mfaSecret: "SECRET",
      });
      mockVerifyTotp.mockResolvedValue({ valid: true, delta: 0 });

      const result = await service.completeMfaLogin(
        "challenge",
        "123456",
        "127.0.0.1",
      );

      expect(result.accessToken).toBe("jwt-token");
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: "admin.login" }),
      );
    });
  });

  describe("enrollMfa", () => {
    it("returns secret + QR and stores the secret", async () => {
      prisma.adminAccount.findUnique.mockResolvedValue({
        id: "a1",
        email: "admin@test.com",
        mfaEnabled: false,
      });
      prisma.adminAccount.update.mockResolvedValue({});

      const result = await service.enrollMfa("a1");

      expect(result.secret).toBe("MOCKEDSECRET123456");
      expect(result.uri).toContain("otpauth://totp/");
      expect(result.qrCodeDataUrl).toContain("data:image/png;base64");
      expect(prisma.adminAccount.update).toHaveBeenCalledWith({
        where: { id: "a1" },
        data: { mfaSecret: "MOCKEDSECRET123456" },
      });
    });

    it("refuses to enroll when MFA is already enabled", async () => {
      prisma.adminAccount.findUnique.mockResolvedValue({
        id: "a1",
        mfaEnabled: true,
      });

      await expect(service.enrollMfa("a1")).rejects.toThrow(
        "MFA is already enabled",
      );
    });
  });

  describe("verifyAndEnableMfa", () => {
    it("enables MFA on a valid code", async () => {
      prisma.adminAccount.findUnique.mockResolvedValue({
        id: "a1",
        email: "admin@test.com",
        mfaSecret: "SECRET",
      });
      mockVerifyTotp.mockResolvedValue({ valid: true, delta: 0 });
      prisma.adminAccount.update.mockResolvedValue({});

      const result = await service.verifyAndEnableMfa("a1", "123456");

      expect(result.message).toContain("enabled");
      expect(prisma.adminAccount.update).toHaveBeenCalledWith({
        where: { id: "a1" },
        data: { mfaEnabled: true },
      });
    });

    it("rejects an invalid code", async () => {
      prisma.adminAccount.findUnique.mockResolvedValue({
        id: "a1",
        mfaSecret: "SECRET",
      });
      mockVerifyTotp.mockResolvedValue({ valid: false });

      await expect(service.verifyAndEnableMfa("a1", "000000")).rejects.toThrow(
        "Invalid verification code",
      );
    });
  });

  describe("mfaStatus", () => {
    it("reports enabled + secret state", async () => {
      prisma.adminAccount.findUnique.mockResolvedValue({
        id: "a1",
        mfaEnabled: true,
        mfaSecret: "SECRET",
      });

      const result = await service.mfaStatus("a1");

      expect(result).toEqual({ mfaEnabled: true, mfaSecretSet: true });
    });
  });
});

describe("AdminService", () => {
  let service: AdminService;
  let prisma: {
    association: {
      findMany: jest.Mock;
      count: jest.Mock;
      create: jest.Mock;
      findUnique: jest.Mock;
      update: jest.Mock;
    };
    user: { count: jest.Mock };
    payment: { count: jest.Mock; aggregate: jest.Mock; groupBy: jest.Mock };
    fee: { findMany: jest.Mock };
  };

  beforeEach(async () => {
    prisma = {
      association: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
        create: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      user: { count: jest.fn().mockResolvedValue(0) },
      payment: {
        count: jest.fn().mockResolvedValue(0),
        aggregate: jest.fn().mockResolvedValue({ _sum: { amountKobo: 0 } }),
        groupBy: jest.fn().mockResolvedValue([]),
      },
      fee: { findMany: jest.fn().mockResolvedValue([]) },
    };

    const mockAudit = { log: jest.fn().mockResolvedValue(undefined) };
    const mockAiService = {
      embedAndStore: jest.fn().mockResolvedValue(undefined),
      query: jest.fn(),
      streamQuery: jest.fn(),
      getConversations: jest.fn(),
      submitMaterial: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditService, useValue: mockAudit },
        { provide: AiService, useValue: mockAiService },
      ],
    }).compile();

    service = module.get<AdminService>(AdminService);
  });

  describe("createAssociation", () => {
    it("creates an association with uppercase shortCode", async () => {
      prisma.association.create.mockResolvedValue({
        id: "new-id",
        name: "NAAS",
        shortCode: "NAAS",
        faculty: "Agriculture",
        status: "active",
      });

      const result = await service.createAssociation({
        name: "NAAS",
        shortCode: "naas",
        faculty: "Agriculture",
      });

      expect(result.shortCode).toBe("NAAS");
      expect(prisma.association.create).toHaveBeenCalled();
    });
  });

  describe("getAnalytics", () => {
    it("returns overview analytics", async () => {
      const result = await service.getAnalytics();

      expect(result.totalUsers).toBe(0);
      expect(result.totalAssociations).toBe(0);
      expect(result.associationRevenue).toEqual([]);
    });
  });

  describe("updateAssociationStatus", () => {
    it("throws NotFoundException for missing association", async () => {
      prisma.association.findUnique.mockResolvedValue(null);
      await expect(
        service.updateAssociationStatus("bad-id", "suspended"),
      ).rejects.toThrow("Association not found");
    });
  });
});
