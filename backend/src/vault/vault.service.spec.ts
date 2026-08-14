import { Test, TestingModule } from "@nestjs/testing";
import { BadRequestException } from "@nestjs/common";
import { VaultService } from "./vault.service";
import { PrismaService } from "../prisma/prisma.service";
import { StorageService } from "../storage/storage.service";
import { AuditService } from "../audit/audit.service";

describe("VaultService", () => {
  let service: VaultService;
  let prisma: PrismaService;
  let storage: StorageService;

  const mockItem = {
    id: "item-1",
    userId: "user-1",
    associationId: "assoc-1",
    courseCode: "CHM 101",
    title: "2019 past questions",
    type: "past_question",
    visibility: "public",
    originalName: "chm101.pdf",
    mimeType: "application/pdf",
    sizeBytes: 1024,
    companionSizeBytes: null,
    moderationStatus: "approved",
    rejectionReason: null,
    downloads: 0,
    createdAt: new Date(),
    user: { fullName: "Ada", level: "200" },
  };

  const mockPrisma = () => ({
    membership: {
      findMany: jest
        .fn()
        .mockResolvedValue([
          { associationId: "assoc-1" },
          { associationId: "assoc-2" },
        ]),
    },
    vaultItem: {
      findMany: jest.fn().mockResolvedValue([mockItem]),
      findUnique: jest.fn().mockResolvedValue(mockItem),
      create: jest.fn().mockResolvedValue({ ...mockItem, id: "new-1" }),
      update: jest.fn().mockResolvedValue({}),
    },
    legalAcceptance: { upsert: jest.fn().mockResolvedValue({}) },
  });

  const mockStorage = {
    isEnabled: true,
    put: jest.fn().mockResolvedValue("vault/assoc-1/user-1/key.pdf"),
    getDataUri: jest.fn().mockResolvedValue(null),
  };
  const mockAudit = { log: jest.fn().mockResolvedValue(undefined) };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        VaultService,
        { provide: PrismaService, useValue: mockPrisma() },
        { provide: StorageService, useValue: mockStorage },
        { provide: AuditService, useValue: mockAudit },
      ],
    }).compile();

    service = module.get<VaultService>(VaultService);
    prisma = module.get<PrismaService>(PrismaService);
    storage = module.get<StorageService>(StorageService);
  });

  describe("search", () => {
    it("scopes results to approved public items of the user's associations + own items", async () => {
      const result = await service.search("user-1", "chm 101");

      const where = (prisma.vaultItem.findMany as jest.Mock).mock.calls[0][0]
        .where;
      expect(where.OR).toEqual(
        expect.arrayContaining([
          { userId: "user-1" },
          {
            visibility: "public",
            moderationStatus: "approved",
            associationId: { in: ["assoc-1", "assoc-2"] },
          },
        ]),
      );
      expect(where.AND[0].OR).toEqual(
        expect.arrayContaining([
          { courseCode: { contains: "CHM 101" } },
          { title: { contains: "chm 101", mode: "insensitive" } },
        ]),
      );
      expect(result.items[0]).not.toHaveProperty("storageRef");
      expect(result.items[0].hasCompanion).toBe(false);
    });

    it("filters by item type when requested", async () => {
      await service.search("user-1", undefined, "past_question");
      const where = (prisma.vaultItem.findMany as jest.Mock).mock.calls[0][0]
        .where;
      expect(where.AND).toEqual(
        expect.arrayContaining([{ type: "past_question" }]),
      );
    });
  });

  describe("upload", () => {
    it("rejects unsupported file types", async () => {
      const file = {
        buffer: Buffer.from("x"),
        mimetype: "text/plain",
        size: 10,
        originalname: "notes.txt",
      } as Express.Multer.File;

      await expect(
        service.upload(
          "user-1",
          "1.2.3.4",
          {
            courseCode: "CHM 101",
            title: "Notes",
            type: "material",
            visibility: "public",
            termsVersion: "1.0",
          },
          file,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it("requires a course code and terms acceptance", async () => {
      const file = {
        buffer: Buffer.from("x"),
        mimetype: "application/pdf",
        size: 10,
        originalname: "notes.pdf",
      } as Express.Multer.File;

      await expect(
        service.upload(
          "user-1",
          "1.2.3.4",
          {
            courseCode: "",
            title: "Notes",
            type: "material",
            visibility: "public",
            termsVersion: "",
          },
          file,
        ),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.vaultItem.create).not.toHaveBeenCalled();
    });

    it("marks public uploads pending moderation and private ones approved", async () => {
      const file = {
        buffer: Buffer.from("%PDF-1.4 test"),
        mimetype: "application/pdf",
        size: 13,
        originalname: "notes.pdf",
      } as Express.Multer.File;

      await service.upload(
        "user-1",
        "1.2.3.4",
        {
          courseCode: "chm 101",
          title: "Notes",
          type: "material",
          visibility: "public",
          termsVersion: "1.0",
        },
        file,
      );

      const data = (prisma.vaultItem.create as jest.Mock).mock.calls[0][0].data;
      expect(data.courseCode).toBe("CHM 101");
      expect(data.moderationStatus).toBe("pending");
      expect(data.visibility).toBe("public");
      expect(storage.put).toHaveBeenCalled();
      expect(prisma.legalAcceptance.upsert).toHaveBeenCalled();
    });
  });
});
