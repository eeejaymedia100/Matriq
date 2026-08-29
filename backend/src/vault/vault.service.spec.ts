import { Test, TestingModule } from "@nestjs/testing";
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from "@nestjs/common";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { VaultService } from "./vault.service";
import { PrismaService } from "../prisma/prisma.service";
import { StorageService } from "../storage/storage.service";
import { AuditService } from "../audit/audit.service";
import { ToolsService } from "../tools/tools.service";

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
    storageRef: "data:application/pdf;base64,AAAA",
    companionRef: null,
    mimeType: "application/pdf",
    sizeBytes: 1024,
    companionSizeBytes: null,
    companionMimeType: null,
    moderationStatus: "approved",
    rejectionReason: null,
    downloads: 0,
    createdAt: new Date(),
    deletedAt: null,
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
    getBuffer: jest.fn().mockResolvedValue(null),
  };
  const mockAudit = { log: jest.fn().mockResolvedValue(undefined) };
  const mockTools = {
    ocrBuffer: jest
      .fn()
      .mockResolvedValue({
        text: "CHEMISTRY 2019 past questions",
        confidence: 92,
        readable: true,
        engine: "tesseract",
      }),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        VaultService,
        { provide: PrismaService, useValue: mockPrisma() },
        { provide: StorageService, useValue: mockStorage },
        { provide: AuditService, useValue: mockAudit },
        { provide: ToolsService, useValue: mockTools },
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

  describe("renameItem", () => {
    it("rejects renaming someone else's upload", async () => {
      await expect(
        service.renameItem("other-user", "1.2.3.4", "item-1", "my name"),
      ).rejects.toThrow(ForbiddenException);
    });

    it("rejects an empty name", async () => {
      await expect(
        service.renameItem("user-1", "1.2.3.4", "item-1", "   "),
      ).rejects.toThrow(BadRequestException);
    });

    it("appends the original extension when the new name omits it", async () => {
      (prisma.vaultItem.update as jest.Mock).mockResolvedValue({
        ...mockItem,
        originalName: "chm101 2019 answers.pdf",
      });

      await service.renameItem("user-1", "1.2.3.4", "item-1", "chm101 2019 answers");

      const data = (prisma.vaultItem.update as jest.Mock).mock.calls[0][0].data;
      expect(data.originalName).toBe("chm101 2019 answers.pdf");
      expect(mockAudit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          actorType: "student",
          action: "vault.rename",
          metadata: { from: "chm101.pdf", to: "chm101 2019 answers.pdf" },
        }),
      );
    });

    it("swaps a different extension back to the file's real one", async () => {
      (prisma.vaultItem.update as jest.Mock).mockResolvedValue({
        ...mockItem,
        originalName: "chm101 answers.pdf",
      });

      await service.renameItem("user-1", "1.2.3.4", "item-1", "chm101 answers.docx");

      const data = (prisma.vaultItem.update as jest.Mock).mock.calls[0][0].data;
      expect(data.originalName).toBe("chm101 answers.pdf");
    });
  });

  describe("getText", () => {
    it("extracts the embedded text layer from a PDF", async () => {
      const pdf = await PDFDocument.create();
      const page = pdf.addPage([400, 400]);
      const font = await pdf.embedFont(StandardFonts.Helvetica);
      page.drawText("Hello Matriq OCR test", {
        x: 50,
        y: 350,
        size: 14,
        font,
      });
      const bytes = await pdf.save();
      (prisma.vaultItem.findUnique as jest.Mock).mockResolvedValueOnce({
        ...mockItem,
        storageRef: `data:application/pdf;base64,${Buffer.from(bytes).toString("base64")}`,
      });

      const result = await service.getText("user-1", "item-1");
      expect(result.source).toBe("pdf");
      expect(result.text).toContain("Hello Matriq OCR test");
    });

    it("returns none for a PDF without a text layer (scanned)", async () => {
      const result = await service.getText("user-1", "item-1");
      expect(result).toEqual({ text: "", source: "none" });
    });

    it("runs OCR on image uploads", async () => {
      (prisma.vaultItem.findUnique as jest.Mock).mockResolvedValueOnce({
        ...mockItem,
        storageRef: "data:image/jpeg;base64,/9j/4AAQSkZJRg==",
        mimeType: "image/jpeg",
        originalName: "photo.jpg",
      });

      const result = await service.getText("user-1", "item-1");
      expect(result.source).toBe("ocr");
      expect(result.text).toContain("CHEMISTRY 2019");
      expect(mockTools.ocrBuffer).toHaveBeenCalled();
    });

    it("returns none for unreadable content without throwing", async () => {
      (prisma.vaultItem.findUnique as jest.Mock).mockResolvedValueOnce({
        ...mockItem,
        mimeType: "application/zip",
      });

      const result = await service.getText("user-1", "item-1");
      expect(result).toEqual({ text: "", source: "none" });
    });

    it("denies text for items the student can't download", async () => {
      (prisma.vaultItem.findUnique as jest.Mock).mockResolvedValueOnce({
        ...mockItem,
        userId: "someone-else",
        visibility: "private",
      });

      await expect(service.getText("user-1", "item-1")).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  describe("admin preview", () => {
    it("getTextForAdmin extracts the PDF text layer without student scoping", async () => {
      const pdf = await PDFDocument.create();
      const page = pdf.addPage([400, 400]);
      const font = await pdf.embedFont(StandardFonts.Helvetica);
      page.drawText("Admin preview works", { x: 50, y: 350, size: 14, font });
      const bytes = await pdf.save();
      (prisma.vaultItem.findUnique as jest.Mock).mockResolvedValueOnce({
        ...mockItem,
        userId: "someone-else", // admin path must NOT enforce ownership
        storageRef: `data:application/pdf;base64,${Buffer.from(bytes).toString("base64")}`,
      });

      const result = await service.getTextForAdmin("item-1");
      expect(result.source).toBe("pdf");
      expect(result.text).toContain("Admin preview works");
    });

    it("getFileForAdmin returns the raw file for image preview", async () => {
      (prisma.vaultItem.findUnique as jest.Mock).mockResolvedValueOnce({
        ...mockItem,
        storageRef: "data:image/jpeg;base64,/9j/4AAQSkZJRg==",
        mimeType: "image/jpeg",
        originalName: "scan.jpg",
      });

      const result = await service.getFileForAdmin("item-1");
      expect(result.mimeType).toBe("image/jpeg");
      expect(result.fileName).toBe("scan.jpg");
      expect(result.buffer.length).toBeGreaterThan(0);
    });

    it("getTextForAdmin throws NotFound for missing items", async () => {
      (prisma.vaultItem.findUnique as jest.Mock).mockResolvedValueOnce(null);
      await expect(service.getTextForAdmin("nope")).rejects.toThrow(
        NotFoundException,
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

    it("rejects videos (no video infrastructure in this version)", async () => {
      const file = {
        buffer: Buffer.from("video"),
        mimetype: "video/mp4",
        size: 5,
        originalname: "lecture.mp4",
      } as Express.Multer.File;

      await expect(
        service.upload(
          "user-1",
          "1.2.3.4",
          {
            courseCode: "CHM 101",
            title: "Lecture",
            type: "material",
            visibility: "public",
            termsVersion: "1.0",
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

    it("persists optional level/session discovery metadata", async () => {
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
          visibility: "private",
          termsVersion: "1.0",
          level: "200",
          session: "2023/2024",
        },
        file,
      );

      const data = (prisma.vaultItem.create as jest.Mock).mock.calls[0][0].data;
      expect(data.level).toBe("200");
      expect(data.session).toBe("2023/2024");
    });
  });

  describe("chunked upload", () => {
    it("rejects chunks when object storage is disabled (honest limitation)", async () => {
      (storage as unknown as { isEnabled: boolean }).isEnabled = false;
      try {
        await expect(
          service.uploadChunk(
            "user-1",
            "1.2.3.4",
            "abc-123-upload-id",
            0,
            2,
            {
              buffer: Buffer.from("part"),
              mimetype: "application/octet-stream",
              size: 4,
              originalname: "part",
            } as Express.Multer.File,
          ),
        ).rejects.toThrow(BadRequestException);
      } finally {
        (storage as unknown as { isEnabled: boolean }).isEnabled = true;
      }
    });

    it("rejects an unsafe upload id", async () => {
      await expect(
        service.uploadChunk(
          "user-1",
          "1.2.3.4",
          "../../etc/passwd",
          0,
          2,
          {
            buffer: Buffer.from("part"),
            mimetype: "application/octet-stream",
            size: 4,
            originalname: "part",
          } as Express.Multer.File,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it("stores a valid chunk under the pending key", async () => {
      const result = await service.uploadChunk(
        "user-1",
        "1.2.3.4",
        "abc-123-upload-id",
        0,
        2,
        {
          buffer: Buffer.from("part"),
          mimetype: "application/octet-stream",
          size: 4,
          originalname: "part",
        } as Express.Multer.File,
      );
      expect(result).toEqual({ uploadId: "abc-123-upload-id", received: 0, total: 2 });
      expect(storage.put).toHaveBeenCalledWith(
        "vault-pending/abc-123-upload-id/0000",
        expect.any(Buffer),
        "application/octet-stream",
      );
    });

    it("complete rejects video mime types", async () => {
      await expect(
        service.completeChunkedUpload("user-1", "1.2.3.4", {
          uploadId: "abc-123-upload-id",
          originalName: "lecture.mp4",
          mimeType: "video/mp4",
          totalChunks: 2,
          sizeBytes: 100,
          courseCode: "CHM 101",
          title: "Lecture",
          type: "material",
          visibility: "public",
          termsVersion: "1.0",
        }),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.vaultItem.create).not.toHaveBeenCalled();
    });
  });
});
