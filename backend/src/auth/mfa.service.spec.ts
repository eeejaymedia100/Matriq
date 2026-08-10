import { Test, TestingModule } from "@nestjs/testing";
import { ConfigService } from "@nestjs/config";
import { MfaService } from "./mfa.service";
import { PrismaService } from "../prisma/prisma.service";

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

import { verify } from "otplib";

const mockVerify = verify as jest.MockedFunction<typeof verify>;

describe("MfaService", () => {
  let service: MfaService;

  const mockPrisma = {
    user: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
  };

  const mockConfig = {
    get: jest.fn().mockReturnValue("Matriq"),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MfaService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: ConfigService, useValue: mockConfig },
      ],
    }).compile();

    service = module.get<MfaService>(MfaService);
    jest.clearAllMocks();
  });

  it("should be defined", () => {
    expect(service).toBeDefined();
  });

  it("should generate enrollment secret and QR code", async () => {
    mockPrisma.user.findUnique.mockResolvedValue({
      id: "u1",
      email: "test@example.com",
    });
    mockPrisma.user.update.mockResolvedValue({});

    const result = await service.enroll("u1");

    expect(result.secret).toBeDefined();
    expect(result.qrCodeDataUrl).toContain("data:image/png;base64");
    expect(result.uri).toContain("otpauth://totp/");
    expect(mockPrisma.user.update).toHaveBeenCalledWith({
      where: { id: "u1" },
      data: { mfaSecret: expect.any(String) },
    });
  });

  it("should verify and enable MFA with valid token", async () => {
    mockVerify.mockResolvedValue({ valid: true } as never);

    mockPrisma.user.findUnique.mockResolvedValue({
      id: "u1",
      mfaSecret: "TESTSECRET",
    });
    mockPrisma.user.update.mockResolvedValue({});

    const result = await service.verifyAndEnable("u1", "123456");

    expect(result.message).toBe("MFA enabled successfully");
    expect(mockPrisma.user.update).toHaveBeenCalledWith({
      where: { id: "u1" },
      data: { mfaEnabled: true },
    });
  });

  it("should reject invalid token", async () => {
    mockVerify.mockResolvedValue({ valid: false } as never);

    mockPrisma.user.findUnique.mockResolvedValue({
      id: "u1",
      mfaSecret: "TESTSECRET123",
    });

    await expect(service.verifyAndEnable("u1", "000000")).rejects.toThrow(
      "Invalid verification code",
    );
  });

  it("should return MFA status", async () => {
    mockPrisma.user.findUnique.mockResolvedValue({
      mfaEnabled: true,
    });

    const result = await service.status("u1");
    expect(result.mfaEnabled).toBe(true);
  });
});
