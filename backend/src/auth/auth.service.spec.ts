// Mock EmailService before any imports to prevent Resend from loading
const mockSend = jest
  .fn()
  .mockResolvedValue({ success: true, messageId: "msg-id" });

jest.mock("../email/email.service", () => ({
  EmailService: jest.fn().mockImplementation(() => ({
    send: mockSend,
  })),
}));

// Mock argon2 to avoid real hashing in tests
jest.mock("argon2", () => ({
  hash: jest
    .fn()
    .mockResolvedValue(
      "$argon2id$v=19$m=65536,t=3,p=4$fakehashfakehashfakehashfakehash",
    ),
  verify: jest.fn().mockResolvedValue(true),
}));

// Mock otplib to avoid ESM/CJS compatibility issues (MfaService imports it)
jest.mock("otplib", () => ({
  generateSecret: () => "MOCKEDSECRET123456",
  generateURI: () => "otpauth://totp/mocked",
  verify: jest.fn(),
}));

import { Test, TestingModule } from "@nestjs/testing";
import { JwtService } from "@nestjs/jwt";
import { ConfigService } from "@nestjs/config";
import {
  UnauthorizedException,
  ConflictException,
  BadRequestException,
  HttpException,
} from "@nestjs/common";
import { JsonWebTokenError } from "jsonwebtoken";
import { AuthService } from "./auth.service";
import { MfaService } from "./mfa.service";
import { PrismaService } from "../prisma/prisma.service";
import { EmailService } from "../email/email.service";

describe("AuthService", () => {
  let service: AuthService;
  let prisma: PrismaService;
  let jwtService: JwtService;

  const verifiedUser = {
    id: "uuid-1",
    email: "test@example.com",
    fullName: "Test User",
    passwordHash: "hashed-password",
    registrationType: "staylite" as const,
    matricNumber: "MAT123",
    jambNumber: null,
    matricStatus: "provisional" as const,
    faculty: "Science",
    department: "Computer Science",
    level: "300",

    mfaEnabled: false,
    emailVerified: true,
    verificationToken: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
  };

  const unverifiedUser = {
    ...verifiedUser,
    email: "new@example.com",
    emailVerified: false,
    verificationToken: "test-token-123",
  };

  const mfaUser = {
    ...verifiedUser,
    mfaEnabled: true,
    mfaSecret: "MFA-SECRET",
  };

  const mockMfaService = {
    verifyToken: jest.fn().mockResolvedValue(true),
  };

  const tokenRecord = {
    id: "token-uuid-1",
    familyId: "family-uuid-1",
    tokenHash: expect.any(String),
    used: false,
    replacedBy: null,
    expiresAt: new Date(Date.now() + 7 * 86400000),
    createdAt: new Date(),
  };

  const tokenFamily = {
    id: "family-uuid-1",
    userId: "uuid-1",
    createdAt: new Date(),
  };

  beforeEach(async () => {
    mockSend.mockClear();

    const mockPrisma = {
      user: {
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
      legalAcceptance: {
        upsert: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      payment: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      refreshTokenFamily: {
        create: jest.fn().mockResolvedValue(tokenFamily),
        findMany: jest.fn().mockResolvedValue([]),
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      refreshToken: {
        findFirst: jest.fn(),
        create: jest.fn().mockResolvedValue(tokenRecord),
        update: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };

    const mockJwtService = {
      sign: jest.fn().mockReturnValue("mock-token"),
      verify: jest.fn().mockReturnValue({
        sub: "uuid-1",
        email: "test@example.com",
        role: "student",
      }),
      decode: jest.fn().mockReturnValue({
        sub: "uuid-1",
        email: "test@example.com",
        role: "student",
        exp: Math.floor(Date.now() / 1000) + 604800,
      }),
    };

    const mockConfigService = {
      get: jest.fn((key: string) => {
        if (key === "JWT_SECRET") return "test-secret";
        if (key === "JWT_REFRESH_SECRET") return "test-refresh-secret";
        if (key === "JWT_REFRESH_TTL") return "7d";
        return undefined;
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: JwtService, useValue: mockJwtService },
        { provide: ConfigService, useValue: mockConfigService },
        { provide: MfaService, useValue: mockMfaService },
        EmailService,
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    prisma = module.get<PrismaService>(PrismaService);
    jwtService = module.get<JwtService>(JwtService);
  });

  // ── Login ─────────────────────────────────────────────────

  describe("login", () => {
    it("should throw when user does not exist", async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(
        service.login({ email: "nobody@example.com", password: "password" }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it("should throw when user has no password", async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        ...verifiedUser,
        passwordHash: null,
      });

      await expect(
        service.login({ email: "test@example.com", password: "password" }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it("should throw when user email is not verified", async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(unverifiedUser);

      await expect(
        service.login({ email: "new@example.com", password: "password" }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it("should return tokens and create a refresh token family", async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(verifiedUser);

      const result = await service.login({
        email: "test@example.com",
        password: "password",
      });

      expect(result).toHaveProperty("accessToken");
      expect(result).toHaveProperty("refreshToken");
      if ("user" in result) {
        expect(result.user.email).toBe("test@example.com");
      }
      expect(prisma.refreshTokenFamily.create).toHaveBeenCalledTimes(1);
      expect(prisma.refreshToken.create).toHaveBeenCalledTimes(1);
    });

    it("should require an MFA challenge and issue no tokens for MFA-enabled accounts", async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(mfaUser);

      const result = await service.login({
        email: "test@example.com",
        password: "password",
      });

      expect(result).toMatchObject({ mfaRequired: true });
      expect(result).toHaveProperty("challengeToken");
      expect(result).not.toHaveProperty("accessToken");
      expect(prisma.refreshTokenFamily.create).not.toHaveBeenCalled();
      expect(prisma.refreshToken.create).not.toHaveBeenCalled();
    });
  });

  // ── MFA login challenge (step 2) ──────────────────────────

  describe("completeMfaLogin", () => {
    it("should issue tokens when the challenge and code are valid", async () => {
      (jwtService.verify as jest.Mock).mockReturnValue({
        sub: "uuid-1",
        purpose: "mfa-login",
      });
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(mfaUser);
      (mockMfaService.verifyToken as jest.Mock).mockResolvedValue(true);

      const result = await service.completeMfaLogin(
        "challenge-token",
        "123456",
      );

      expect(result).toHaveProperty("accessToken");
      expect(result).toHaveProperty("refreshToken");
      expect(mockMfaService.verifyToken).toHaveBeenCalledWith(
        "uuid-1",
        "123456",
      );
      expect(prisma.refreshTokenFamily.create).toHaveBeenCalledTimes(1);
    });

    it("should throw when the challenge token is invalid or expired", async () => {
      (jwtService.verify as jest.Mock).mockImplementation(() => {
        throw new JsonWebTokenError("expired");
      });

      await expect(
        service.completeMfaLogin("bad-challenge", "123456"),
      ).rejects.toThrow(UnauthorizedException);
    });

    it("should throw when the challenge token has the wrong purpose", async () => {
      (jwtService.verify as jest.Mock).mockReturnValue({
        sub: "uuid-1",
        purpose: "password-reset",
      });

      await expect(
        service.completeMfaLogin("challenge-token", "123456"),
      ).rejects.toThrow(UnauthorizedException);
    });

    it("should throw when the TOTP code is invalid", async () => {
      (jwtService.verify as jest.Mock).mockReturnValue({
        sub: "uuid-1",
        purpose: "mfa-login",
      });
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(mfaUser);
      (mockMfaService.verifyToken as jest.Mock).mockResolvedValue(false);

      await expect(
        service.completeMfaLogin("challenge-token", "000000"),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  // ── Token refresh ─────────────────────────────────────────

  describe("refresh", () => {
    it("should throw when the JWT is invalid", async () => {
      (jwtService.verify as jest.Mock).mockImplementation(() => {
        throw new JsonWebTokenError("invalid signature");
      });

      await expect(service.refresh("bad-token")).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it("should throw when the token hash is not found in DB", async () => {
      (prisma.refreshToken.findFirst as jest.Mock).mockResolvedValue(null);

      await expect(service.refresh("valid-jwt-not-in-db")).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it("should perform rotation: mark old as used, create new token", async () => {
      // Existing token — unused
      (prisma.refreshToken.findFirst as jest.Mock).mockResolvedValue({
        id: "old-token-id",
        familyId: "family-uuid-1",
        tokenHash: "hashed",
        used: false,
        replacedBy: null,
        expiresAt: new Date(Date.now() + 7 * 86400000),
        createdAt: new Date(),
        family: { tokens: [] },
      });
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(verifiedUser);
      // New token record
      (prisma.refreshToken.create as jest.Mock).mockResolvedValue({
        ...tokenRecord,
        id: "new-token-id",
      });

      const result = await service.refresh("valid-raw-token");

      expect(result).toHaveProperty("accessToken");
      expect(result).toHaveProperty("refreshToken");
      // Old token should be marked as used
      expect(prisma.refreshToken.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "old-token-id" },
          data: expect.objectContaining({ used: true }),
        }),
      );
      // New token should be created in the same family
      expect(prisma.refreshToken.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ familyId: "family-uuid-1" }),
        }),
      );
    });

    it("should detect replay attack and revoke family", async () => {
      // Token exists but is already used — replay!
      (prisma.refreshToken.findFirst as jest.Mock).mockResolvedValue({
        id: "used-token-id",
        familyId: "family-uuid-1",
        tokenHash: "hashed",
        used: true, // ← replay
        replacedBy: "newer-token-id",
        expiresAt: new Date(Date.now() + 7 * 86400000),
        createdAt: new Date(),
        family: { tokens: [] },
      });

      await expect(service.refresh("replayed-token")).rejects.toThrow(
        UnauthorizedException,
      );

      // Should revoke all unused tokens in the family
      expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
        where: { familyId: "family-uuid-1", used: false },
        data: { used: true },
      });
    });
  });

  // ── Logout ────────────────────────────────────────────────

  describe("logout", () => {
    it("should succeed even if token not found", async () => {
      (prisma.refreshToken.findFirst as jest.Mock).mockResolvedValue(null);

      const result = await service.logout("any-token");
      expect(result.message).toBe("Logged out");
    });

    it("should mark the token family as used", async () => {
      (prisma.refreshToken.findFirst as jest.Mock).mockResolvedValue({
        id: "tok-1",
        familyId: "family-1",
        createdAt: new Date(),
      });

      const result = await service.logout("valid-token");
      expect(result.message).toBe("Logged out");
      expect(prisma.refreshToken.updateMany).toHaveBeenCalled();
    });
  });

  // ── Logout all ────────────────────────────────────────────

  describe("logoutAll", () => {
    it("should revoke all tokens for the user", async () => {
      (prisma.refreshTokenFamily.findMany as jest.Mock).mockResolvedValue([
        { id: "family-1" },
        { id: "family-2" },
      ]);

      const result = await service.logoutAll("uuid-1");
      expect(result.message).toBe("Logged out of all sessions");
      expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { familyId: { in: ["family-1", "family-2"] }, used: false },
          data: { used: true },
        }),
      );
    });

    it("should succeed even with no token families", async () => {
      (prisma.refreshTokenFamily.findMany as jest.Mock).mockResolvedValue([]);

      const result = await service.logoutAll("uuid-1");
      expect(result.message).toBe("Logged out of all sessions");
    });
  });

  // ── Registration ──────────────────────────────────────────

  describe("registerStaylite", () => {
    it("should throw when email already exists and is verified", async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(verifiedUser);

      await expect(
        service.registerStaylite(
          {
            email: "test@example.com",
            fullName: "Test User",
            password: "password123",
            matricNumber: "MAT123",
            faculty: "Science",
            department: "CS",
            level: "300",
            privacyPolicyVersion: "1.0",
            termsVersion: "1.0",
          },
          "127.0.0.1",
        ),
      ).rejects.toThrow(ConflictException);
    });

    it("should allow re-registration when unverified user exists", async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(unverifiedUser);
      (prisma.user.delete as jest.Mock).mockResolvedValue(unverifiedUser);
      (prisma.user.create as jest.Mock).mockResolvedValue(verifiedUser);

      const result = await service.registerStaylite(
        {
          email: "new@example.com",
          fullName: "New User",
          password: "password123",
          matricNumber: "MAT456",
          faculty: "Science",
          department: "CS",
          level: "300",
          privacyPolicyVersion: "1.0",
          termsVersion: "1.0",
        },
        "127.0.0.1",
      );

      expect(result).toHaveProperty("message");
      expect(result.message).toContain("verify");
    });
  });

  describe("registerFresher", () => {
    it("should throw when email already exists and is verified", async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(verifiedUser);

      await expect(
        service.registerFresher(
          {
            email: "test@example.com",
            fullName: "Test User",
            password: "password123",
            jambNumber: "JAMB123",
            faculty: "Science",
            department: "CS",
            privacyPolicyVersion: "1.0",
            termsVersion: "1.0",
          },
          "127.0.0.1",
        ),
      ).rejects.toThrow(ConflictException);
    });
  });

  // ── Resend verification (5/hour budget) ───────────────────

  describe("resendVerification", () => {
    it("should throw TooManyRequests when the 5/hour budget is exhausted", async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        ...unverifiedUser,
        verificationEmailCount: 5,
        verificationEmailWindowStart: new Date(Date.now() - 10 * 60000),
      });

      await expect(
        service.resendVerification("new@example.com"),
      ).rejects.toThrow(HttpException);
      expect(mockSend).not.toHaveBeenCalled();
    });

    it("should reset the budget when the 1-hour window has elapsed", async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        ...unverifiedUser,
        verificationEmailCount: 5,
        verificationEmailWindowStart: new Date(Date.now() - 61 * 60000),
      });
      (prisma.user.update as jest.Mock).mockResolvedValue({
        ...unverifiedUser,
        verificationEmailCount: 1,
      });

      const result = await service.resendVerification("new@example.com");
      expect(result.message).toContain("sent");
      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ verificationEmailCount: 1 }),
        }),
      );
      expect(mockSend).toHaveBeenCalledTimes(1);
    });

    it("should keep the generic response for unknown/verified emails", async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(null);

      const result = await service.resendVerification("nobody@example.com");
      expect(result.message).toContain("If your email is registered");
      expect(mockSend).not.toHaveBeenCalled();
    });
  });

  // ── Email verification ────────────────────────────────────

  describe("verifyEmail", () => {
    it("should throw when token is invalid", async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(service.verifyEmail("invalid-token")).rejects.toThrow(
        BadRequestException,
      );
    });

    it("should return tokens for valid token", async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(unverifiedUser);
      (prisma.user.update as jest.Mock).mockResolvedValue(verifiedUser);

      const result = await service.verifyEmail("test-token-123");

      expect(result).toHaveProperty("accessToken");
      expect(result).toHaveProperty("refreshToken");
      expect(result.user.email).toBe("test@example.com");
    });
  });

  // ── Profile ───────────────────────────────────────────────

  describe("getProfile", () => {
    it("should throw when user not found", async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(service.getProfile("nonexistent")).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it("should include executive roles with association names", async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        ...verifiedUser,
        executiveRoles: [
          {
            id: "exec-1",
            associationId: "assoc-1",
            role: "treasurer",
            association: {
              name: "Computer Science Association",
              shortCode: "CS",
            },
          },
        ],
      });

      const result = await service.getProfile("uuid-1");

      expect(result.executive).toEqual([
        {
          id: "exec-1",
          associationId: "assoc-1",
          role: "treasurer",
          associationName: "Computer Science Association",
          shortCode: "CS",
        },
      ]);
    });
  });

  describe("updateProfile", () => {
    it("should update allowed fields", async () => {
      (prisma.user.update as jest.Mock).mockResolvedValue({
        ...verifiedUser,
        fullName: "Updated Name",
      });

      const result = await service.updateProfile("uuid-1", {
        fullName: "Updated Name",
      });

      expect(result.fullName).toBe("Updated Name");
    });

    it("should persist dateOfBirth when provided", async () => {
      (prisma.user.update as jest.Mock).mockResolvedValue({
        ...verifiedUser,
        dateOfBirth: new Date("2000-05-15T00:00:00.000Z"),
      });

      const result = await service.updateProfile("uuid-1", {
        dateOfBirth: "2000-05-15",
      });

      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            dateOfBirth: expect.any(Date),
          }),
        }),
      );
      expect(result.dateOfBirth).toEqual(new Date("2000-05-15T00:00:00.000Z"));
    });

    it("should reject a future date of birth", async () => {
      await expect(
        service.updateProfile("uuid-1", {
          dateOfBirth: new Date(Date.now() + 86400000).toISOString(),
        }),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.user.update).not.toHaveBeenCalled();
    });
  });
});
